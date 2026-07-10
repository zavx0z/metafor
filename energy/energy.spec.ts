import {Buffer} from "node:buffer"
import {describe, expect, test} from "bun:test"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type { EnergyActionProcessDescriptor } from "@metafor/types/energy/process"
import type { EnergyRuntimeSnapshot } from "@metafor/types/energy/catalog"
import type { EnergyMassStore } from "@metafor/types/energy/mass"
import type { EnergyForce } from "@metafor/types/energy/protocol"
import type { ForceMessage } from "@metafor/types/force/message"
import type { Particle } from "@metafor/types/force/particle"
import {startEnergyProtocol} from "./energy.ts"

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Expected asynchronous Energy broadcast effect")
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const processEntry = (
  state: string,
  action: EnergyActionProcessDescriptor["action"] = {
    src: "./actions/ready.ts",
    wrapperSrc: "async () => {}",
    readFields: [[2, "command"]],
  },
  env: string[] = ["server"],
  descriptor: Partial<Pick<EnergyActionProcessDescriptor, "success" | "error">> = {},
): EnergyRuntimeSnapshot["processes"][number] => ({
  wimp: "owner/process",
  state,
  descriptor: {
    type: "action",
    key: state,
    env,
    action,
    ...descriptor,
  },
})

const finallyProcessEntry = (
  state: string,
  src: string,
  env: string[] = ["server"],
): EnergyRuntimeSnapshot["processes"][number] => ({
  wimp: "owner/process",
  state,
  descriptor: {
    type: "finally",
    key: state,
    env,
    before: {src, readFields: []},
  },
})

const createCatalog = (env: string[] = ["server"]): EnergyRuntimeSnapshot => ({
  version: 1,
  actors: [[17, "owner/process"]],
  processes: [processEntry("ready", undefined, env)],
})

const createHarness = (
  energyId = "energy-local",
  catalog: EnergyRuntimeSnapshot = createCatalog(),
  runtimeKind = "server",
  massStore?: EnergyMassStore,
) => {
  const messages: ForceMessage[] = []
  const force: EnergyForce = {
    onCreate: () => {},
    onImpulse: () => {},
    impulse(message) {
      messages.push(structuredClone(message))
    },
  }
  const protocol = startEnergyProtocol({
    force,
    energyId,
    catalog,
    runtimeKind,
    ...(massStore ? {massStore} : {}),
  })

  return {
    messages,
    create(snapshot: EnergyRuntimeSnapshot) {
      void force.onCreate(structuredClone(snapshot))
    },
    emit(message: ForceMessage) {
      void force.onImpulse(structuredClone(message))
    },
    close() {
      protocol.close()
    },
  }
}

const collectParts = (messages: ForceMessage[], part: string, op?: string): Particle[] =>
  messages.flatMap((message) =>
    message.parts.filter((item) => item.part === part && (op === undefined || item.op === op)),
  )

const claimAndCopy = async (
  harness: ReturnType<typeof createHarness>,
  state: string,
  fields: Record<string, unknown>,
): Promise<void> => {
  const zCount = collectParts(harness.messages, "z", "test").length
  harness.emit({parts: [{part: "photon", op: "test", path: 17, value: state}]})
  await waitFor(() => collectParts(harness.messages, "z", "test").length > zCount)
  harness.emit({
    parts: [{
      part: "z",
      op: "copy",
      path: 17,
      from: "energy-local",
      value: {fields},
    }],
  })
}

const expectNoWeakExecutorIdentity = (result: Particle | undefined): void => {
  expect(result).toBeDefined()
  expect("energyId" in result!).toBe(false)
  expect("executorId" in result!).toBe(false)
  expect("processId" in result!).toBe(false)
  expect("token" in result!).toBe(false)
  expect("wimpId" in result!).toBe(false)
}

const dataUrlAction = (source: string): string =>
  `data:application/javascript;base64,${Buffer.from(source).toString("base64")}`

describe("Energy Weak protocol", () => {
  test("Energy ignores photon/replace", async () => {
    const harness = createHarness("energy-local")

    try {
      harness.emit({
        parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy sends z test on photon/test with matching catalog and env", async () => {
    const harness = createHarness("energy-local")

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })

      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)

      expect(collectParts(harness.messages, "z", "test")[0]).toEqual({
        part: "z",
        op: "test",
        path: 17,
        value: {energy: "energy-local"},
      })
    } finally {
      harness.close()
    }
  })

  test("Energy receives its process catalog through Force create", async () => {
    const harness = createHarness("energy-local", {version: 1, actors: [], processes: []})

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })
      await sleep(10)
      expect(collectParts(harness.messages, "z", "test")).toEqual([])

      harness.create(createCatalog())
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })

      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      expect(collectParts(harness.messages, "z", "test")[0]?.value).toEqual({energy: "energy-local"})
    } finally {
      harness.close()
    }
  })

  test("Energy does not claim photon/test without descriptor", async () => {
    const harness = createHarness("energy-local", {...createCatalog(), processes: []})

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy does not claim photon/test when env does not match", async () => {
    const harness = createHarness("energy-local", createCatalog(["browser"]), "server")

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy waits for z copy before w+", async () => {
    const harness = createHarness("energy-local")

    try {
      harness.emit({
        parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
      })

      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      await sleep(10)

      expect(collectParts(harness.messages, "z", "test")).toHaveLength(1)
      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy executes wrapperSrc and sends actor-addressed w+", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async ({ value }) => { if (value.command !== 'commit') throw new Error('bad command') }",
        readFields: [[2, "command"]],
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      const result = collectParts(harness.messages, "w+", "replace")[0]
      expect(result).toEqual({
        part: "w+",
        op: "replace",
        path: 17,
        value: {fields: {}},
      })
      expectNoWeakExecutorIdentity(result)
    } finally {
      harness.close()
    }
  })

  test("Energy success handler writes declared field", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async () => ({ result: 'done' })",
        readFields: [[2, "command"]],
      }, ["server"], {
        success: {
          src: "({ update, data }) => update({ result: data.result })",
          readFields: [[3, "result"]],
          writeFields: [[3, "result"]],
        },
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {"2": "commit", "3": "old"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      const result = collectParts(harness.messages, "w+", "replace")[0]
      expect(result).toEqual({
        part: "w+",
        op: "replace",
        path: 17,
        value: {fields: {"3": "done"}},
      })
      expectNoWeakExecutorIdentity(result)
    } finally {
      harness.close()
    }
  })

  test("Energy success handler cannot write undeclared fields", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async () => ({ result: 'done' })",
        readFields: [],
      }, ["server"], {
        success: {
          src: "({ update }) => update({ result: 'done', secret: 'bad' })",
          readFields: [],
          writeFields: [[3, "result"]],
        },
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      const result = collectParts(harness.messages, "w+", "replace")[0]
      expect(result?.value).toEqual({fields: {"3": "done"}})
      expectNoWeakExecutorIdentity(result)
    } finally {
      harness.close()
    }
  })

  test("Energy sends w- when wrapperSrc throws", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async () => { throw new Error('wrapper failed') }",
        readFields: [[2, "command"]],
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w-", "replace").length > 0)

      const result = collectParts(harness.messages, "w-", "replace")[0]
      expect(result?.path).toBe(17)
      expect((result?.value as {error?: string; fields?: unknown}).error).toContain("wrapper failed")
      expect((result?.value as {fields?: unknown}).fields).toEqual({})
      expectNoWeakExecutorIdentity(result)
    } finally {
      harness.close()
    }
  })

  test("Energy error handler writes declared field", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async () => { throw new Error('boom') }",
        readFields: [[2, "command"]],
      }, ["server"], {
        error: {
          src: "({ update, error }) => update({ errorText: error.message })",
          readFields: [],
          writeFields: [[4, "errorText"]],
        },
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w-", "replace").length > 0)

      const result = collectParts(harness.messages, "w-", "replace")[0]
      expect(result?.path).toBe(17)
      expect((result?.value as {error?: string; fields?: unknown}).error).toBe("boom")
      expect((result?.value as {fields?: unknown}).fields).toEqual({"4": "boom"})
      expectNoWeakExecutorIdentity(result)
    } finally {
      harness.close()
    }
  })

  test("Energy success handler throw converts to w-", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async () => ({ result: 'done' })",
        readFields: [],
      }, ["server"], {
        success: {
          src: "() => { throw new Error('success failed') }",
          readFields: [],
          writeFields: [[3, "result"]],
        },
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w-", "replace").length > 0)

      const result = collectParts(harness.messages, "w-", "replace")[0]
      expect((result?.value as {error?: string; fields?: unknown}).error).toContain("success failed")
      expect((result?.value as {fields?: unknown}).fields).toEqual({})
      expectNoWeakExecutorIdentity(result)
    } finally {
      harness.close()
    }
  })

  test("Energy error handler throw still sends w-", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async () => { throw new Error('action failed') }",
        readFields: [],
      }, ["server"], {
        error: {
          src: "() => { throw new Error('error handler failed') }",
          readFields: [],
          writeFields: [[4, "errorText"]],
        },
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w-", "replace").length > 0)

      const result = collectParts(harness.messages, "w-", "replace")[0]
      expect((result?.value as {error?: string; fields?: unknown}).error).toContain("error handler failed")
      expect((result?.value as {fields?: unknown}).fields).toEqual({})
      expectNoWeakExecutorIdentity(result)
    } finally {
      harness.close()
    }
  })

  test("Imported action receives the same params object contract", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: dataUrlAction(`
          export async function run(params) {
            if (params.value.command !== "commit") throw new Error("bad value")
            if (params.self.atom !== "17") throw new Error("bad atom")
            if (params.self.meta !== "owner/process") throw new Error("bad meta")
            if (params.self.path !== "17") throw new Error("bad path")
            if (typeof params.mass !== "object" || params.mass === null) throw new Error("bad mass")
          }
        `),
        importSpecifier: "run",
        readFields: [[2, "command"]],
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).toEqual({fields: {}})
    } finally {
      harness.close()
    }
  })

  test("Energy action value is keyed by field key, not field id", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async ({ value }) => { if ('2' in value) throw new Error('field id leaked'); if (value.command !== 'commit') throw new Error('missing command') }",
        readFields: [[2, "command"]],
      })],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).toEqual({fields: {}})
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy env resolver accepts any", async () => {
    const harness = createHarness("energy-local", createCatalog(["any"]), "server")

    try {
      await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      expect(collectParts(harness.messages, "z", "test")).toHaveLength(1)
      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).toEqual({fields: {}})
    } finally {
      harness.close()
    }
  })

  test("Energy mass persists between executions for same actor and wimp", async () => {
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [
        processEntry("init", {
          src: "./actions/init.ts",
          wrapperSrc: "async ({ mass }) => { mass.client = { ready: true } }",
          readFields: [],
        }),
        processEntry("ready", {
          src: "./actions/ready.ts",
          wrapperSrc: "async ({ mass }) => { if (!mass.client?.ready) throw new Error('missing mass client') }",
          readFields: [],
        }),
      ],
    }
    const harness = createHarness("energy-local", catalog)

    try {
      await claimAndCopy(harness, "init", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)

      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 2)

      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy executes finally before against mass and releases the actor with compact w+", async () => {
    const mass: Record<string, unknown> = {resource: "open"}
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [finallyProcessEntry(
        "done",
        "async ({ mass }) => { mass.resource = 'closed'; mass.finalized = true }",
      )],
    }
    const harness = createHarness("energy-local", catalog, "server", {get: () => mass})

    try {
      await claimAndCopy(harness, "done", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      expect(mass).toEqual({resource: "closed", finalized: true})
      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).toEqual({fields: {}})
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("Energy keeps a filesystem tool payload in mass and returns only a compact W result", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-energy-tool-"))
    const mass: Record<string, unknown> = {filesystemRoot: root}
    const catalog: EnergyRuntimeSnapshot = {
      version: 1,
      actors: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: new URL("../fixture/tools/filesystem.read.ts", import.meta.url).href,
        readFields: [[2, "path"]],
      })],
    }
    const harness = createHarness("energy-local", catalog, "server", {
      get: () => mass,
    })

    try {
      await writeFile(join(root, "input.txt"), "MetaFor tool payload")
      await claimAndCopy(harness, "ready", {"2": "input.txt"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)

      expect(mass.result).toEqual({
        dataBase64: Buffer.from("MetaFor tool payload").toString("base64"),
      })
      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).toEqual({fields: {}})
    } finally {
      harness.close()
      await rm(root, {recursive: true, force: true})
    }
  })

  test("Energy ignores z copy for another energy", async () => {
    const harness = createHarness("energy-local")

    try {
      harness.emit({
        parts: [{
          part: "z",
          op: "copy",
          path: 17,
          from: "energy-other",
          value: {fields: {"2": 11}},
        }],
      })
      await sleep(10)

      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })
})
