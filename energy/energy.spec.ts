import {Buffer} from "node:buffer"
import {describe, expect, test} from "bun:test"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {EnergyProcessEntity} from "@metafor/types/energy/catalog"
import type {EnergyMassStore} from "@metafor/types/energy/mass"
import type {EnergyActionProcessDescriptor} from "@metafor/types/energy/process"
import type {EnergyForce} from "@metafor/types/energy/protocol"
import type {
  ProcessExecutionClaim,
  ProcessExecutionGrant,
  ProcessResultProposal,
} from "shared/protocol/force/execution"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {startEnergyProtocol} from "./energy.ts"

type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
type ForceMessageInput = {parts: [ParticleInput]}
const message = (input: ForceMessageInput): ForceMessage => ({parts: [{ts: 1, ...input.parts[0]}] as [Particle]})

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Expected asynchronous Energy broadcast effect")
    await Bun.sleep(0)
  }
}

const sleep = async (ms: number): Promise<void> => {
  await Bun.sleep(ms)
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
): EnergyProcessEntity => ({
  id: state === "ready" ? 101 : state.length + 101,
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
): EnergyProcessEntity => ({
  id: state.length + 201,
  wimp: "owner/process",
  state,
  descriptor: {
    type: "finally",
    key: state,
    env,
    before: {src, readFields: []},
  },
})

type TestCatalog = {
  atoms: Array<[number, string]>
  processes: EnergyProcessEntity[]
}

const createCatalog = (env: string[] = ["server"]): TestCatalog => ({
  atoms: [[17, "owner/process"]],
  processes: [processEntry("ready", undefined, env)],
})

const createHarness = (
  energyId = "energy-local",
  catalog: TestCatalog = createCatalog(),
  runtimeKind = "server",
  massStore?: EnergyMassStore,
) => {
  const messages: ForceMessage[] = []
  const processByState = new Map<string, EnergyProcessEntity>()
  const force: EnergyForce = {
    onImpulse: () => {},
    impulse(message) {
      messages.push(structuredClone(message))
    },
  }
  const protocol = startEnergyProtocol({
    force,
    energyId,
    runtimeKind,
    ...(massStore ? {massStore} : {}),
  })

  const seed = (next: TestCatalog): void => {
    for (const [atomId, wimp] of next.atoms) {
      void force.onImpulse(message({parts: [{
        part: "graviton",
        op: "add",
        path: `atom/${atomId}`,
        value: {
          atom: {id: atomId, parentAtom: null, parentTopology: null, wimp, position: 0},
          values: [],
          valueRecords: [],
          valueItems: [],
          state: null,
        },
      }]}))
    }
    next.processes.forEach((process, index) => {
      processByState.set(process.state, process)
      void force.onImpulse(message({parts: [{
        part: "graviton",
        op: "add",
        path: "process",
        value: {...structuredClone(process), localId: index + 1},
      }]}))
    })
  }
  seed(catalog)

  return {
    energyId,
    messages,
    seed(next: TestCatalog) {
      seed(structuredClone(next))
    },
    emit(input: ForceMessageInput) {
      void force.onImpulse(structuredClone(message(input)))
    },
    processId(state: string): number {
      const process = processByState.get(state)
      if (!process) throw new Error(`Missing process for state ${state}`)
      return process.id
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

type ExecutionContext = {
  processExecutionId: string
  processId: number
}

const claimAndCopy = async (
  harness: ReturnType<typeof createHarness>,
  state: string,
  fields: Record<string, unknown>,
): Promise<ExecutionContext> => {
  const processExecutionId = `execution-${state}-${crypto.randomUUID()}`
  const zCount = collectParts(harness.messages, "z", "test").length
  harness.emit({parts: [{
    part: "photon",
    op: "test",
    path: 17,
    from: processExecutionId,
    value: state,
  }]})
  await waitFor(() => collectParts(harness.messages, "z", "test").length > zCount)

  const claim = collectParts(harness.messages, "z", "test").at(-1)
  expect(claim).toEqual({
    part: "z",
    op: "test",
    path: 17,
    ts: expect.any(Number),
    value: {energy: harness.energyId, processExecutionId} satisfies ProcessExecutionClaim,
  })

  const grant: ProcessExecutionGrant = {processExecutionId, fields}
  harness.emit({parts: [{
    part: "z",
    op: "copy",
    path: 17,
    from: harness.energyId,
    value: grant,
  }]})
  return {processExecutionId, processId: harness.processId(state)}
}

const expectProposal = (
  result: Particle | undefined,
  part: "w+" | "w-",
  harness: ReturnType<typeof createHarness>,
  execution: ExecutionContext,
  fields: Record<string, unknown>,
  error?: string,
): void => {
  const proposal: ProcessResultProposal = {
    processExecutionId: execution.processExecutionId,
    processId: execution.processId,
    fields,
    ...(error === undefined ? {} : {error}),
  }
  expect(result).toEqual({
    part,
    op: "replace",
    path: 17,
    ts: expect.any(Number),
    from: harness.energyId,
    value: proposal,
  })
  expect("executorId" in result!).toBe(false)
  expect("token" in result!).toBe(false)
  expect("wimpId" in result!).toBe(false)
  expect("energyId" in (result!.value as Record<string, unknown>)).toBe(false)
}

const dataUrlAction = (source: string): string =>
  `data:application/javascript;base64,${Buffer.from(source).toString("base64")}`

describe("Energy process protocol", () => {
  test("ignores photon/replace", async () => {
    const harness = createHarness()
    try {
      harness.emit({parts: [{part: "photon", op: "replace", path: 17, value: "ready"}]})
      await sleep(10)
      expect(collectParts(harness.messages, "z", "test")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("claims matching process with explicit execution identity", async () => {
    const harness = createHarness()
    try {
      const processExecutionId = "execution-claim"
      harness.emit({parts: [{
        part: "photon",
        op: "test",
        path: 17,
        from: processExecutionId,
        value: "ready",
      }]})
      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      expect(collectParts(harness.messages, "z", "test")[0]).toEqual({
        part: "z",
        op: "test",
        path: 17,
        ts: expect.any(Number),
        value: {energy: harness.energyId, processExecutionId},
      })
    } finally {
      harness.close()
    }
  })

  test("receives atom and process catalog through Graviton", async () => {
    const harness = createHarness("energy-local", {atoms: [], processes: []})
    try {
      harness.emit({parts: [{
        part: "photon",
        op: "test",
        path: 17,
        from: "execution-before-catalog",
        value: "ready",
      }]})
      await sleep(10)
      expect(collectParts(harness.messages, "z", "test")).toEqual([])

      harness.seed(createCatalog())
      harness.emit({parts: [{
        part: "photon",
        op: "test",
        path: 17,
        from: "execution-after-catalog",
        value: "ready",
      }]})
      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      expect(collectParts(harness.messages, "z", "test")[0]?.value).toEqual({
        energy: harness.energyId,
        processExecutionId: "execution-after-catalog",
      })
    } finally {
      harness.close()
    }
  })

  test("does not claim missing or mismatched process", async () => {
    for (const harness of [
      createHarness("energy-local", {...createCatalog(), processes: []}),
      createHarness("energy-local", createCatalog(["browser"]), "server"),
    ]) {
      try {
        harness.emit({parts: [{
          part: "photon",
          op: "test",
          path: 17,
          from: crypto.randomUUID(),
          value: "ready",
        }]})
        await sleep(10)
        expect(collectParts(harness.messages, "z", "test")).toEqual([])
      } finally {
        harness.close()
      }
    }
  })

  test("waits for matching Z grant before execution", async () => {
    const harness = createHarness()
    try {
      harness.emit({parts: [{
        part: "photon",
        op: "test",
        path: 17,
        from: "execution-wait",
        value: "ready",
      }]})
      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      await sleep(10)
      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("executes wrapper and returns identified W+ proposal", async () => {
    const catalog: TestCatalog = {
      atoms: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async ({value}) => { if (value.command !== 'commit') throw new Error('bad command') }",
        readFields: [[2, "command"]],
      })],
    }
    const harness = createHarness("energy-local", catalog)
    try {
      const execution = await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expectProposal(collectParts(harness.messages, "w+", "replace")[0], "w+", harness, execution, {})
    } finally {
      harness.close()
    }
  })

  test("success handler emits only declared fields", async () => {
    const catalog: TestCatalog = {
      atoms: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async () => ({result: 'done'})",
        readFields: [[2, "command"]],
      }, ["server"], {
        success: {
          src: "({update, data}) => update({result: data.result, secret: 'bad'})",
          readFields: [[3, "result"]],
          writeFields: [[3, "result"]],
        },
      })],
    }
    const harness = createHarness("energy-local", catalog)
    try {
      const execution = await claimAndCopy(harness, "ready", {"2": "commit", "3": "old"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expectProposal(
        collectParts(harness.messages, "w+", "replace")[0],
        "w+",
        harness,
        execution,
        {"3": "done"},
      )
    } finally {
      harness.close()
    }
  })

  test("wrapper and handlers produce identified W- proposals", async () => {
    const cases: Array<{
      process: EnergyProcessEntity
      expectedError: string
      expectedFields: Record<string, unknown>
    }> = [
      {
        process: processEntry("ready", {
          src: "./actions/ready.ts",
          wrapperSrc: "async () => { throw new Error('wrapper failed') }",
          readFields: [],
        }),
        expectedError: "wrapper failed",
        expectedFields: {},
      },
      {
        process: processEntry("ready", {
          src: "./actions/ready.ts",
          wrapperSrc: "async () => { throw new Error('boom') }",
          readFields: [],
        }, ["server"], {
          error: {
            src: "({update, error}) => update({errorText: error.message})",
            readFields: [],
            writeFields: [[4, "errorText"]],
          },
        }),
        expectedError: "boom",
        expectedFields: {"4": "boom"},
      },
      {
        process: processEntry("ready", {
          src: "./actions/ready.ts",
          wrapperSrc: "async () => ({result: 'done'})",
          readFields: [],
        }, ["server"], {
          success: {
            src: "() => { throw new Error('success failed') }",
            readFields: [],
            writeFields: [[3, "result"]],
          },
        }),
        expectedError: "success failed",
        expectedFields: {},
      },
      {
        process: processEntry("ready", {
          src: "./actions/ready.ts",
          wrapperSrc: "async () => { throw new Error('action failed') }",
          readFields: [],
        }, ["server"], {
          error: {
            src: "() => { throw new Error('error handler failed') }",
            readFields: [],
            writeFields: [[4, "errorText"]],
          },
        }),
        expectedError: "error handler failed",
        expectedFields: {},
      },
    ]

    for (const item of cases) {
      const harness = createHarness("energy-local", {atoms: [[17, "owner/process"]], processes: [item.process]})
      try {
        const execution = await claimAndCopy(harness, "ready", {})
        await waitFor(() => collectParts(harness.messages, "w-", "replace").length > 0)
        expectProposal(
          collectParts(harness.messages, "w-", "replace")[0],
          "w-",
          harness,
          execution,
          item.expectedFields,
          item.expectedError,
        )
      } finally {
        harness.close()
      }
    }
  })

  test("imported action receives the same params contract", async () => {
    const catalog: TestCatalog = {
      atoms: [[17, "owner/process"]],
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
      const execution = await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expectProposal(collectParts(harness.messages, "w+", "replace")[0], "w+", harness, execution, {})
    } finally {
      harness.close()
    }
  })

  test("action value is keyed by field key, not field id", async () => {
    const catalog: TestCatalog = {
      atoms: [[17, "owner/process"]],
      processes: [processEntry("ready", {
        src: "./actions/ready.ts",
        wrapperSrc: "async ({value}) => { if ('2' in value) throw new Error('field id leaked'); if (value.command !== 'commit') throw new Error('missing command') }",
        readFields: [[2, "command"]],
      })],
    }
    const harness = createHarness("energy-local", catalog)
    try {
      const execution = await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expectProposal(collectParts(harness.messages, "w+", "replace")[0], "w+", harness, execution, {})
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("env any is executable", async () => {
    const harness = createHarness("energy-local", createCatalog(["any"]), "server")
    try {
      const execution = await claimAndCopy(harness, "ready", {"2": "commit"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expectProposal(collectParts(harness.messages, "w+", "replace")[0], "w+", harness, execution, {})
    } finally {
      harness.close()
    }
  })

  test("mass persists between executions for the same atom and WIMP", async () => {
    const catalog: TestCatalog = {
      atoms: [[17, "owner/process"]],
      processes: [
        processEntry("init", {
          src: "./actions/init.ts",
          wrapperSrc: "async ({mass}) => { mass.client = {ready: true} }",
          readFields: [],
        }),
        processEntry("ready", {
          src: "./actions/ready.ts",
          wrapperSrc: "async ({mass}) => { if (!mass.client?.ready) throw new Error('missing mass client') }",
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

  test("finally Process executes against Mass", async () => {
    const mass: Record<string, unknown> = {resource: "open"}
    const process = finallyProcessEntry(
      "done",
      "async ({mass}) => { mass.resource = 'closed'; mass.finalized = true }",
    )
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass},
    )
    try {
      const execution = await claimAndCopy(harness, "done", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expect(mass).toEqual({resource: "closed", finalized: true})
      expectProposal(collectParts(harness.messages, "w+", "replace")[0], "w+", harness, execution, {})
    } finally {
      harness.close()
    }
  })

  test("keeps filesystem payload in Mass and returns compact proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-energy-tool-"))
    const mass: Record<string, unknown> = {filesystemRoot: root}
    const process = processEntry("ready", {
      src: new URL("../fixture/tools/filesystem.read.ts", import.meta.url).href,
      readFields: [[2, "path"]],
    })
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass},
    )
    try {
      await writeFile(join(root, "input.txt"), "MetaFor tool payload")
      const execution = await claimAndCopy(harness, "ready", {"2": "input.txt"})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expect(mass.result).toEqual({
        dataBase64: Buffer.from("MetaFor tool payload").toString("base64"),
      })
      expectProposal(collectParts(harness.messages, "w+", "replace")[0], "w+", harness, execution, {})
    } finally {
      harness.close()
      await rm(root, {recursive: true, force: true})
    }
  })

  test("ignores a grant addressed to another Energy", async () => {
    const harness = createHarness("energy-local")
    try {
      harness.emit({parts: [{
        part: "photon",
        op: "test",
        path: 17,
        from: "execution-foreign",
        value: "ready",
      }]})
      await waitFor(() => collectParts(harness.messages, "z", "test").length > 0)
      harness.emit({parts: [{
        part: "z",
        op: "copy",
        path: 17,
        from: "energy-other",
        value: {processExecutionId: "execution-foreign", fields: {"2": 11}},
      }]})
      await sleep(10)
      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })
})
