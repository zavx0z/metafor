import {Buffer} from "node:buffer"
import {describe, expect, spyOn, test} from "bun:test"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import type {EnergyAtomContinuation, EnergyAtomEntity, EnergyProcessEntity} from "@energy/types/catalog"
import type {EnergyRuntimeStore} from "@energy/types/energy"
import type {EnergyMassStore} from "@energy/types/mass"
import type {EnergyActionProcessDescriptor} from "@energy/types/process"
import type {EnergyForce} from "@energy/types/protocol"
import type {
  ProcessExecutionClaim,
  ProcessExecutionGrant,
  ProcessResultProposal,
} from "shared/protocol/force/execution"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {EnergyCatalogStore} from "./catalog.ts"
import {resolveActionImportSpecifier, startEnergyProtocol} from "./energy.ts"

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
  atoms: Array<[
    number,
    string,
    Partial<Omit<EnergyAtomEntity, "id" | "wimp">>?,
    EnergyAtomContinuation?,
  ]>
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
  energyStore?: EnergyRuntimeStore,
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
    catalog: new EnergyCatalogStore(),
    energyId,
    runtimeKind,
    ...(massStore ? {massStore} : {}),
    ...(energyStore ? {energyStore} : {}),
  })

  const seed = (next: TestCatalog): void => {
    for (const [atomId, wimp, atomPatch, continuation] of next.atoms) {
      void force.onImpulse(message({parts: [{
        part: "graviton",
        op: "add",
        path: `atom/${atomId}`,
        value: {
          atom: {id: atomId, parentAtom: null, parentTopology: null, wimp, position: 0, ...atomPatch},
          ...(continuation === undefined ? {} : {continuation}),
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
  atomId = 17,
): Promise<ExecutionContext> => {
  const processExecutionId = `execution-${state}-${crypto.randomUUID()}`
  const zCount = collectParts(harness.messages, "z", "test").length
  harness.emit({parts: [{
    part: "photon",
    op: "test",
    path: atomId,
    from: processExecutionId,
    value: state,
  }]})
  await waitFor(() => collectParts(harness.messages, "z", "test").length > zCount)

  const claim = collectParts(harness.messages, "z", "test").at(-1)
  expect(claim).toEqual({
    part: "z",
    op: "test",
    path: atomId,
    ts: expect.any(Number),
    value: {energy: harness.energyId, processExecutionId} satisfies ProcessExecutionClaim,
  })

  const grant: ProcessExecutionGrant = {processExecutionId, fields}
  harness.emit({parts: [{
    part: "z",
    op: "copy",
    path: atomId,
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
  test("resolves WIMP action modules from the physical Cluster", () => {
    expect(fileURLToPath(resolveActionImportSpecifier("./actions/start.ts", "zavx0z/capsule"))).toBe(
      resolve(import.meta.dir, "../cluster/zavx0z/capsule/actions/start.ts"),
    )
  })

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
            if (params.field.command.type !== "string") throw new Error("bad field schema")
            if (params.field.command.required !== true) throw new Error("bad field required")
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
      harness.emit({parts: [{
        part: "graviton",
        op: "add",
        path: "field",
        value: {
          id: 2,
          wimp: "owner/process",
          localId: 1,
          key: "command",
          type: "string",
          required: true,
          label: null,
          default: "commit",
        },
      }]})
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

  test("passes Energy and Mass as separate persistent runtime objects", async () => {
    const mass: Record<string, unknown> = {}
    const energy: Record<string, unknown> = {}
    const process = processEntry("ready", {
      src: "./actions/separate.ts",
      wrapperSrc: "async ({energy, mass}) => { if (energy === mass) throw new Error('mixed domains'); energy.socket = {ready: true}; mass.profile = {id: 'profile-1'} }",
      readFields: [],
    })
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass, bind: () => {}},
      {get: () => energy, bind: () => {}, release: () => {}},
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expect(energy).toEqual({socket: {ready: true}})
      expect(mass).toEqual({profile: {id: "profile-1"}})
    } finally {
      harness.close()
    }
  })

  test("binds child Mass and Energy to the exact parent object references", async () => {
    const parentMass: Record<string, unknown> = {attempts: 0}
    const parentEnergy: Record<string, unknown> = {socket: {ready: true}}
    const masses = new Map<number, Record<string, unknown>>([[1, parentMass]])
    const energies = new Map<number, Record<string, unknown>>([[1, parentEnergy]])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        masses.set(atomId, value)
      },
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        energies.set(atomId, value)
      },
      release: ({atomId}) => {
        energies.delete(atomId)
      },
    }
    const process = processEntry("ready", {
      src: "./actions/aliases.ts",
      wrapperSrc: "async ({mass, energy}) => { mass.attempts = 1; energy.connected = true }",
      readFields: [],
    })
    const harness = createHarness(
      "energy-local",
      {
        atoms: [
          [1, "owner/parent"],
          [17, "owner/process", {parentAtom: 1}, {
            massBinding: {data: "/mass", directMass: {kind: "whole"}},
            energyBinding: {data: "/energy"},
          }],
        ],
        processes: [process],
      },
      "server",
      massStore,
      energyStore,
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expect(masses.get(17)).toBe(parentMass)
      expect(energies.get(17)).toBe(parentEnergy)
      expect(parentMass).toEqual({attempts: 1})
      expect(parentEnergy).toEqual({socket: {ready: true}, connected: true})
      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).toEqual(expect.objectContaining({fields: {}}))
    } finally {
      harness.close()
    }
  })

  test("rebuilds an established projection across Process Graviton changes", async () => {
    const firstCache = {version: 1}
    const secondCache = {version: 2}
    const firstSocket = {version: 1}
    const secondSocket = {version: 2}
    const parentMass: Record<string, unknown> = {cache: firstCache}
    const parentEnergy: Record<string, unknown> = {socket: firstSocket}
    const masses = new Map<number, Record<string, unknown>>([[1, parentMass]])
    const energies = new Map<number, Record<string, unknown>>([[1, parentEnergy]])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        masses.set(atomId, value)
      },
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        energies.set(atomId, value)
      },
      release: ({atomId}) => {
        energies.delete(atomId)
      },
    }
    const process = processEntry("ready", {
      src: "./actions/projected.ts",
      wrapperSrc: "async () => {}",
      readFields: [],
    })
    const harness = createHarness(
      "energy-local",
      {
        atoms: [
          [1, "owner/parent"],
          [17, "owner/process", {parentAtom: 1}, {
            massBinding: {
              data: "/mass/cache",
              expr: "{cache: _[0]}",
              directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
            },
            energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
          }],
        ],
        processes: [process],
      },
      "server",
      massStore,
      energyStore,
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      const childMass = masses.get(17)
      const childEnergy = energies.get(17)
      expect(childMass?.cache).toBe(firstCache)
      expect(childEnergy?.socket).toBe(firstSocket)

      parentMass.cache = secondCache
      parentEnergy.socket = secondSocket
      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "process",
        value: {
          ...structuredClone(process),
          localId: 1,
          descriptor: {...structuredClone(process.descriptor), env: ["any"]},
        },
      }]})
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 2)

      expect(masses.get(17)).not.toBe(childMass)
      expect(energies.get(17)).not.toBe(childEnergy)
      expect(masses.get(17)?.cache).toBe(secondCache)
      expect(energies.get(17)?.socket).toBe(secondSocket)
    } finally {
      harness.close()
    }
  })

  test("detaches immediately, rebuilds, then aborts the old Process without blocking its replacement", async () => {
    const mass = {events: [] as string[]}
    const energies = new Map<number, Record<string, unknown>>()
    const massStore: EnergyMassStore = {
      get: () => mass,
      bind: () => {},
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => {
        const current = energies.get(atomId)
        if (current) return current
        const created: Record<string, unknown> = {}
        energies.set(atomId, created)
        return created
      },
      bind: ({atomId}, value) => void energies.set(atomId, value),
      release: ({atomId}) => {
        mass.events.push("energy:release")
        energies.delete(atomId)
      },
    }
    const oldProcess = processEntry("ready", {
      src: "./actions/old.ts",
      wrapperSrc: `async ({mass, signal}) => {
        mass.runs = Number(mass.runs ?? 0) + 1
        if (mass.runs === 1) {
          mass.events.push("old:start")
          await new Promise((resolve) => signal?.addEventListener("abort", () => {
            mass.events.push("old:stop")
            resolve()
          }, {once: true}))
          mass.events.push("old:return")
        } else {
          mass.events.push("new:run")
        }
      }`,
      readFields: [],
    })
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [oldProcess]},
      "server",
      massStore,
      energyStore,
    )
    try {
      const oldExecution = await claimAndCopy(harness, "ready", {})
      await waitFor(() => mass.events.includes("old:start"))

      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "matter",
        value: {wimp: "owner/process", localId: 1, id: 41, kind: "wimp", src: "owner/child"},
      }]})

      const newExecution = await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      await waitFor(() => mass.events.includes("old:stop"))

      expect(mass.events.indexOf("new:run")).toBeGreaterThan(-1)
      expect(mass.events.indexOf("old:stop")).toBeGreaterThan(-1)
      expect(mass.events.indexOf("energy:release")).toBeLessThan(mass.events.indexOf("old:stop"))
      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).toEqual(expect.objectContaining({
        processExecutionId: newExecution.processExecutionId,
      }))
      expect(collectParts(harness.messages, "w+", "replace")[0]?.value).not.toEqual(expect.objectContaining({
        processExecutionId: oldExecution.processExecutionId,
      }))
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("removes an Atom before abort and runs its destroy against retired Mass and Energy", async () => {
    const mass: Record<string, unknown> = {events: [] as string[]}
    const energy: Record<string, unknown> = {socket: {ready: true}}
    let releases = 0
    const action = processEntry("ready", {
      src: "./actions/wait-for-remove.ts",
      wrapperSrc: `async ({mass, signal}) => {
        mass.events.push("action:start")
        await new Promise((resolve) => signal.addEventListener("abort", () => {
          mass.events.push("action:abort")
          resolve()
        }, {once: true}))
        mass.events.push("action:return")
      }`,
      readFields: [],
    })
    const destroy = finallyProcessEntry(
      "cleanup",
      `async ({energy, mass}) => {
        if (!energy.socket?.ready) throw new Error("missing retired Energy")
        mass.events.push("destroy")
        energy.closed = true
      }`,
    )
    const ignoredDestroy = finallyProcessEntry(
      "browser-only-cleanup",
      "async ({mass}) => { mass.events.push('wrong-runtime') }",
      ["browser"],
    )
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [action, destroy, ignoredDestroy]},
      "server",
      {get: () => mass, bind: () => {}},
      {
        get: () => energy,
        bind: () => {},
        release: () => {
          releases++
          ;(mass.events as string[]).push("energy:release")
        },
      },
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => (mass.events as string[]).includes("action:start"))
      const claimsBeforeRemove = collectParts(harness.messages, "z", "test").length

      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/17"}]})
      await waitFor(() => (mass.events as string[]).includes("destroy"))
      await sleep(0)

      expect((mass.events as string[]).slice(0, 3)).toEqual([
        "action:start",
        "energy:release",
        "action:abort",
      ])
      expect(mass.events).toContain("destroy")
      expect(mass.events).toContain("action:return")
      expect((mass.events as string[]).indexOf("destroy")).toBeGreaterThan(
        (mass.events as string[]).indexOf("action:abort"),
      )
      expect(energy.closed).toBe(true)
      expect(releases).toBe(1)
      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])

      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/17"}]})
      harness.emit({parts: [{part: "photon", op: "test", path: 17, from: "removed", value: "ready"}]})
      await sleep(10)
      expect(mass.events).not.toContain("wrong-runtime")
      expect((mass.events as string[]).filter((event) => event === "destroy")).toHaveLength(1)
      expect(collectParts(harness.messages, "z", "test")).toHaveLength(claimsBeforeRemove)
    } finally {
      harness.close()
    }
  })

  test("keeps async destroy on the retired generation after the same Atom ID is re-added", async () => {
    const mass: Record<string, unknown> = {runs: 0, events: [] as string[]}
    const energies = new Map<number, Record<string, unknown>>()
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => {
        const current = energies.get(atomId)
        if (current) return current
        const created: Record<string, unknown> = {}
        energies.set(atomId, created)
        return created
      },
      bind: ({atomId}, value) => void energies.set(atomId, value),
      release: ({atomId}) => {
        ;(mass.events as string[]).push("release")
        energies.delete(atomId)
      },
    }
    const action = processEntry("ready", {
      src: "./actions/generation.ts",
      wrapperSrc: `async ({energy, mass}) => {
        mass.runs = Number(mass.runs) + 1
        energy.generation = mass.runs === 1 ? "old" : "new"
      }`,
      readFields: [],
    })
    const destroy = finallyProcessEntry(
      "cleanup-generation",
      `async ({energy, mass}) => {
        mass.events.push("destroy:start")
        await new Promise((resolve) => { mass.finishDestroy = resolve })
        energy.cleaned = true
        mass.events.push("destroy:end")
      }`,
    )
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [action, destroy]},
      "server",
      {get: () => mass, bind: () => {}},
      energyStore,
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      const oldEnergy = energies.get(17)!
      expect(oldEnergy.generation).toBe("old")

      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/17"}]})
      await waitFor(() => (mass.events as string[]).includes("destroy:start"))
      expect(energies.has(17)).toBe(false)

      harness.emit({parts: [{
        part: "graviton",
        op: "add",
        path: "atom/17",
        value: {
          atom: {id: 17, parentAtom: null, parentTopology: null, wimp: "owner/process", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null,
        },
      }]})
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 2)
      const newEnergy = energies.get(17)!
      expect(newEnergy).not.toBe(oldEnergy)
      expect(newEnergy.generation).toBe("new")

      ;(mass.finishDestroy as () => void)()
      await waitFor(() => (mass.events as string[]).includes("destroy:end"))
      expect(oldEnergy.cleaned).toBe(true)
      expect(newEnergy.cleaned).toBeUndefined()
      expect(energies.get(17)).toBe(newEnergy)
    } finally {
      harness.close()
    }
  })

  test("does not create runtime stores when an unhydrated Atom is removed", async () => {
    let massReads = 0
    let energyReads = 0
    let releases = 0
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [finallyProcessEntry("cleanup", "async () => {}")]},
      "server",
      {get: () => { massReads++; return {} }, bind: () => {}},
      {get: () => { energyReads++; return {} }, bind: () => {}, release: () => { releases++ }},
    )
    try {
      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/17"}]})
      await sleep(0)
      expect({massReads, energyReads, releases}).toEqual({massReads: 0, energyReads: 0, releases: 0})
    } finally {
      harness.close()
    }
  })

  test("destroys a removed runtime branch child before parent without duplicate cleanup", async () => {
    const order: number[] = []
    let finishChild!: () => void
    const childBarrier = new Promise<void>((resolve) => { finishChild = resolve })
    const masses = new Map<number, Record<string, unknown>>([
      [1, {atomId: 1, order, childBarrier}],
      [17, {atomId: 17, order, childBarrier}],
    ])
    const energies = new Map<number, Record<string, unknown>>()
    const action = processEntry("ready", {
      src: "./actions/open.ts",
      wrapperSrc: "async ({energy}) => { energy.open = true }",
      readFields: [],
    })
    const destroy = finallyProcessEntry(
      "cleanup-branch",
      `async ({energy, mass}) => {
        if (!energy.open) throw new Error("missing live Energy")
        mass.order.push(mass.atomId)
        if (mass.atomId === 17) await mass.childBarrier
        mass.order.push(-mass.atomId)
      }`,
    )
    const harness = createHarness(
      "energy-local",
      {
        atoms: [[1, "owner/process"], [17, "owner/process", {parentAtom: 1}]],
        processes: [action, destroy],
      },
      "server",
      {get: ({atomId}) => masses.get(atomId)!, bind: ({atomId}, value) => void masses.set(atomId, value)},
      {
        get: ({atomId}) => {
          const current = energies.get(atomId)
          if (current) return current
          const created: Record<string, unknown> = {}
          energies.set(atomId, created)
          return created
        },
        bind: ({atomId}, value) => void energies.set(atomId, value),
        release: ({atomId}) => void energies.delete(atomId),
      },
    )
    try {
      await claimAndCopy(harness, "ready", {}, 1)
      await claimAndCopy(harness, "ready", {}, 17)
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 2)

      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/17"}]})
      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/1"}]})
      await waitFor(() => order.length === 1)
      await sleep(0)
      expect(order).toEqual([17])

      finishChild()
      await waitFor(() => order.length === 4)

      expect(order).toEqual([17, -17, 1, -1])
      expect(energies.size).toBe(0)
      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/1"}]})
      await sleep(0)
      expect(order).toEqual([17, -17, 1, -1])
    } finally {
      harness.close()
    }
  })

  test("continues ordered destroy hooks after one cleanup fails", async () => {
    const mass: Record<string, unknown> = {events: [] as string[]}
    const logged = spyOn(console, "error").mockImplementation(() => {})
    const harness = createHarness(
      "energy-local",
      {
        atoms: [[17, "owner/process"]],
        processes: [
          processEntry("ready", {
            src: "./actions/open.ts",
            wrapperSrc: "async ({energy}) => { energy.open = true }",
            readFields: [],
          }),
          finallyProcessEntry("cleanup-first", "async ({mass}) => { mass.events.push('first'); throw new Error('first failed') }"),
          finallyProcessEntry("cleanup-second", "async ({mass}) => { mass.events.push('second') }"),
        ],
      },
      "server",
      {get: () => mass, bind: () => {}},
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      harness.emit({parts: [{part: "graviton", op: "remove", path: "atom/17"}]})
      await waitFor(() => (mass.events as string[]).includes("second"))

      expect(mass.events).toEqual(["first", "second"])
      expect(logged).toHaveBeenCalledTimes(1)
      expect(String(logged.mock.calls[0]?.[0])).toContain("state=cleanup-first: first failed")
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      logged.mockRestore()
      harness.close()
    }
  })

  test("does not detach a running Process for an identical declaration", async () => {
    const mass: Record<string, unknown> = {events: [] as string[]}
    const process = processEntry("ready", {
      src: "./actions/wait.ts",
      wrapperSrc: `async ({mass, signal}) => {
        await new Promise((resolve) => {
          mass.finish = resolve
          signal.addEventListener("abort", () => mass.events.push("abort"), {once: true})
        })
      }`,
      readFields: [],
    })
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass, bind: () => {}},
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => typeof mass.finish === "function")
      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "process",
        value: structuredClone(process),
      }]})
      await sleep(0)

      expect(mass.events).toEqual([])
      ;(mass.finish as () => void)()
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
    } finally {
      harness.close()
    }
  })

  test("updates an Atom projection without detaching its Matrix-preserved Process", async () => {
    const mass: Record<string, unknown> = {events: [] as string[]}
    const process = processEntry("ready", {
      src: "./actions/wait.ts",
      wrapperSrc: `async ({mass, signal}) => {
        await new Promise((resolve) => {
          mass.finish = resolve
          signal.addEventListener("abort", () => mass.events.push("abort"), {once: true})
        })
      }`,
      readFields: [],
    })
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass, bind: () => {}},
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => typeof mass.finish === "function")
      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "atom/17",
        value: {
          atom: {id: 17, parentAtom: null, parentTopology: null, wimp: "owner/process", position: 1},
        },
      }]})
      await sleep(0)

      expect(mass.events).toEqual([])
      ;(mass.finish as () => void)()
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
    } finally {
      harness.close()
    }
  })

  test("replaces a running parent Atom without detaching or rebinding its child Process", async () => {
    const masses = new Map<number, Record<string, unknown>>([
      [1, {events: [] as string[]}],
      [17, {events: [] as string[]}],
    ])
    const energies = new Map<number, Record<string, unknown>>([
      [1, {identity: "parent"}],
      [17, {identity: "child"}],
    ])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => void masses.set(atomId, value),
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => void energies.set(atomId, value),
      release: ({atomId}) => void energies.delete(atomId),
    }
    const process = processEntry("ready", {
      src: "./actions/wait.ts",
      wrapperSrc: `async ({mass, signal}) => {
        await new Promise((resolve) => {
          mass.finish = resolve
          signal.addEventListener("abort", () => {
            mass.events.push("abort")
            resolve()
          }, {once: true})
        })
      }`,
      readFields: [],
    })
    const harness = createHarness(
      "energy-local",
      {atoms: [[1, "owner/process"], [17, "owner/process", {parentAtom: 1}]], processes: [process]},
      "server",
      massStore,
      energyStore,
    )
    try {
      await claimAndCopy(harness, "ready", {}, 1)
      await claimAndCopy(harness, "ready", {}, 17)
      const parentMass = masses.get(1)
      const childMass = masses.get(17)
      const childEnergy = energies.get(17)
      await waitFor(() => typeof parentMass?.finish === "function" && typeof childMass?.finish === "function")

      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "atom/1",
        value: {
          atom: {id: 1, parentAtom: null, parentTopology: null, wimp: "owner/process", position: 1},
          values: [],
          valueRecords: [],
          valueItems: [],
          state: {atom: 1, metaState: null},
        },
      }]})
      await waitFor(() => ((parentMass?.events as string[]) ?? []).includes("abort"))

      expect(parentMass?.events).toEqual(["abort"])
      expect((childMass?.events as string[]) ?? []).toEqual([])
      expect(masses.get(17)).toBe(childMass)
      expect(energies.get(17)).toBe(childEnergy)
      ;(childMass?.finish as (() => void) | undefined)?.()
      await waitFor(() => collectParts(harness.messages, "w+", "replace").some((part) => part.path === 17))
    } finally {
      harness.close()
    }
  })

  test("detaches child stores when Matter bindings are removed", async () => {
    const parentMass: Record<string, unknown> = {attempts: 0}
    const parentEnergy: Record<string, unknown> = {connected: false}
    const masses = new Map<number, Record<string, unknown>>([[1, parentMass]])
    const energies = new Map<number, Record<string, unknown>>([[1, parentEnergy]])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        masses.set(atomId, value)
      },
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        energies.set(atomId, value)
      },
      release: ({atomId}) => {
        energies.delete(atomId)
      },
    }
    const harness = createHarness(
      "energy-local",
      {
        atoms: [
          [1, "owner/parent"],
          [17, "owner/process", {parentAtom: 1}, {
            massBinding: {data: "/mass", directMass: {kind: "whole"}},
            energyBinding: {data: "/energy"},
          }],
        ],
        processes: [processEntry("ready", {
          src: "./actions/detach.ts",
          wrapperSrc: "async ({mass, energy}) => { mass.attempts = Number(mass.attempts ?? 0) + 1; energy.connected = true }",
          readFields: [],
        })],
      },
      "server",
      massStore,
      energyStore,
    )
    try {
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      expect(masses.get(17)).toBe(parentMass)
      expect(energies.get(17)).toBe(parentEnergy)

      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "atom/17",
        value: {
          atom: {id: 17, parentAtom: 1, parentTopology: null, wimp: "owner/process", position: 0},
          continuation: {},
          values: [],
          valueRecords: [],
          valueItems: [],
          state: null,
        },
      }]})
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 2)

      expect(masses.get(17)).not.toBe(parentMass)
      expect(energies.get(17)).not.toBe(parentEnergy)
      expect(parentMass).toEqual({attempts: 1})
      expect(parentEnergy).toEqual({connected: true})
      expect(masses.get(17)).toEqual({attempts: 1})
      expect(energies.get(17)).toEqual({connected: true})
    } finally {
      harness.close()
    }
  })

  test("rebinds a topology child on its explicit canonical Atom replacement", async () => {
    const firstMass: Record<string, unknown> = {owner: "first"}
    const secondMass: Record<string, unknown> = {owner: "second"}
    const firstEnergy: Record<string, unknown> = {owner: "first"}
    const secondEnergy: Record<string, unknown> = {owner: "second"}
    const masses = new Map<number, Record<string, unknown>>([[1, firstMass], [2, secondMass]])
    const energies = new Map<number, Record<string, unknown>>([[1, firstEnergy], [2, secondEnergy]])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        masses.set(atomId, value)
      },
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        energies.set(atomId, value)
      },
      release: ({atomId}) => {
        energies.delete(atomId)
      },
    }
    const harness = createHarness(
      "energy-local",
      {
        atoms: [
          [1, "owner/first"],
          [2, "owner/second"],
          [17, "owner/process", {parentAtom: null, parentTopology: 7}, {
          massBinding: {data: "/mass", directMass: {kind: "whole"}},
            energyBinding: {data: "/energy"},
          }],
        ],
        processes: [processEntry("ready", {
          src: "./actions/topology-owner.ts",
          wrapperSrc: "async ({mass, energy}) => { if (mass.owner !== energy.owner) throw new Error('mixed owners') }",
          readFields: [],
        })],
      },
      "server",
      massStore,
      energyStore,
    )
    try {
      harness.emit({parts: [{
        part: "graviton",
        op: "add",
        path: "topology/7",
        value: {id: 7, parentAtom: 1, parentTopology: null, kind: "axion", position: 0},
      }]})
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      expect(masses.get(17)).toBe(firstMass)
      expect(energies.get(17)).toBe(firstEnergy)

      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "topology/7",
        value: {id: 7, parentAtom: 2, parentTopology: null, kind: "axion", position: 0},
      }]})
      expect(masses.get(17)).toBe(firstMass)
      expect(energies.get(17)).toBe(firstEnergy)
      harness.emit({parts: [{
        part: "graviton",
        op: "replace",
        path: "atom/17",
        value: {
          atom: {id: 17, parentAtom: null, parentTopology: 7, wimp: "owner/process", position: 0},
          continuation: {massBinding: {data: "/mass", directMass: {kind: "whole"}}, energyBinding: {data: "/energy"}},
          values: [],
          valueRecords: [],
          valueItems: [],
          state: {atom: 17, metaState: null},
        },
      }]})
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 2)
      expect(masses.get(17)).toBe(secondMass)
      expect(energies.get(17)).toBe(secondEnergy)
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])
    } finally {
      harness.close()
    }
  })

  test("drops a stale pending grant only when Boundary replaces the affected child Atom", async () => {
    const firstMass: Record<string, unknown> = {owner: "first"}
    const secondMass: Record<string, unknown> = {owner: "second"}
    const firstEnergy: Record<string, unknown> = {owner: "first"}
    const secondEnergy: Record<string, unknown> = {owner: "second"}
    const masses = new Map<number, Record<string, unknown>>([[1, firstMass], [2, secondMass]])
    const energies = new Map<number, Record<string, unknown>>([[1, firstEnergy], [2, secondEnergy]])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => void masses.set(atomId, value),
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => void energies.set(atomId, value),
      release: ({atomId}) => void energies.delete(atomId),
    }
    const harness = createHarness(
      "energy-local",
      {
        atoms: [
          [1, "owner/first"],
          [2, "owner/second"],
          [17, "owner/process", {parentAtom: null, parentTopology: 7}, {
            massBinding: {data: "/mass", directMass: {kind: "whole"}},
            energyBinding: {data: "/energy"},
          }],
        ],
        processes: [processEntry("ready", {
          src: "./actions/rebind-race.ts",
          wrapperSrc: "async ({mass, energy}) => { mass.executions = Number(mass.executions ?? 0) + 1; energy.executed = true }",
          readFields: [],
        })],
      },
      "server",
      massStore,
      energyStore,
    )
    try {
      harness.emit({parts: [{
        part: "graviton", op: "add", path: "topology/7",
        value: {id: 7, parentAtom: 1, parentTopology: null, kind: "axion", position: 0},
      }]})
      const staleExecutionId = "execution-before-reparent"
      harness.emit({parts: [{
        part: "photon", op: "test", path: 17, from: staleExecutionId, value: "ready",
      }]})
      await waitFor(() => collectParts(harness.messages, "z", "test").length === 1)
      expect(masses.get(17)).toBe(firstMass)
      expect(energies.get(17)).toBe(firstEnergy)

      harness.emit({parts: [{
        part: "graviton", op: "replace", path: "topology/7",
        value: {id: 7, parentAtom: 2, parentTopology: null, kind: "axion", position: 0},
      }]})
      expect(masses.get(17)).toBe(firstMass)
      expect(energies.get(17)).toBe(firstEnergy)

      harness.emit({parts: [{
        part: "graviton", op: "replace", path: "atom/17",
        value: {
          atom: {id: 17, parentAtom: null, parentTopology: 7, wimp: "owner/process", position: 0},
          continuation: {massBinding: {data: "/mass", directMass: {kind: "whole"}}, energyBinding: {data: "/energy"}},
          values: [],
          valueRecords: [],
          valueItems: [],
          state: {atom: 17, metaState: null},
        },
      }]})
      expect(masses.get(17)).toBe(secondMass)
      expect(energies.get(17)).toBe(secondEnergy)

      harness.emit({parts: [{
        part: "z", op: "copy", path: 17, from: "energy-local",
        value: {processExecutionId: staleExecutionId, fields: {}},
      }]})
      await sleep(0)
      expect(collectParts(harness.messages, "w+", "replace")).toEqual([])

      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      expect(collectParts(harness.messages, "w-", "replace")).toEqual([])

      expect(secondMass.executions).toBe(1)
      expect(secondEnergy.executed).toBe(true)
      expect(firstMass.executions).toBeUndefined()
      expect(firstEnergy.executed).toBeUndefined()
    } finally {
      harness.close()
    }
  })

  test("does not claim a child until its explicit Energy binding resolves locally", async () => {
    const parentMass: Record<string, unknown> = {}
    const parentEnergy: Record<string, unknown> = {}
    const masses = new Map<number, Record<string, unknown>>([[1, parentMass]])
    const energies = new Map<number, Record<string, unknown>>([[1, parentEnergy]])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        masses.set(atomId, value)
      },
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => {
        energies.set(atomId, value)
      },
      release: ({atomId}) => {
        energies.delete(atomId)
      },
    }
    const harness = createHarness(
      "energy-local",
      {
        atoms: [
          [1, "owner/parent"],
          [17, "owner/process", {parentAtom: 1}, {
            energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
          }],
        ],
        processes: [processEntry("ready", {
          src: "./actions/lazy-binding.ts",
          wrapperSrc: "async ({energy}) => { if (!energy.socket?.ready) throw new Error('missing inherited socket') }",
          readFields: [],
        })],
      },
      "server",
      massStore,
      energyStore,
    )
    try {
      harness.emit({parts: [{
        part: "photon",
        op: "test",
        path: 17,
        from: "execution-before-energy",
        value: "ready",
      }]})
      await sleep(10)
      expect(collectParts(harness.messages, "z", "test")).toEqual([])

      const socket = {ready: true}
      parentEnergy.socket = socket
      await claimAndCopy(harness, "ready", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expect(energies.get(17)).not.toBe(parentEnergy)
      expect(energies.get(17)?.socket).toBe(socket)
    } finally {
      harness.close()
    }
  })

  test("keeps Process-created Energy until destroy and preserves Mass after release", async () => {
    const catalog: TestCatalog = {
      atoms: [[17, "owner/process"]],
      processes: [
        processEntry("init", {
          src: "./actions/init.ts",
          wrapperSrc: "async ({energy, mass}) => { energy.socket = {ready: true}; mass.profile = {id: 'profile-1'} }",
          readFields: [],
        }),
        processEntry("verify", {
          src: "./actions/verify.ts",
          wrapperSrc: "async ({energy, mass}) => { if (!energy.socket?.ready || !mass.profile) throw new Error('lifecycle did not persist') }",
          readFields: [],
        }),
        finallyProcessEntry(
          "destroyed",
          "async ({energy, mass}) => { if (!energy.socket?.ready || !mass.profile) throw new Error('destroy lost domains'); mass.cleaned = true }",
        ),
        processEntry("after", {
          src: "./actions/after.ts",
          wrapperSrc: "async ({energy, mass}) => { if (energy.socket) throw new Error('Energy was not released'); if (!mass.cleaned || !mass.profile) throw new Error('Mass was released with Energy') }",
          readFields: [],
        }),
      ],
    }
    const harness = createHarness("energy-local", catalog)
    try {
      await claimAndCopy(harness, "init", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 1)
      await claimAndCopy(harness, "verify", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 2)
      await claimAndCopy(harness, "destroyed", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 3)
      await claimAndCopy(harness, "after", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length === 4)
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
      {get: () => mass, bind: () => {}},
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

  test("finally Process receives both domains and releases Energy", async () => {
    const mass: Record<string, unknown> = {profile: {id: "profile-1"}}
    const energy: Record<string, unknown> = {socket: {ready: true}}
    let released = false
    const process = finallyProcessEntry(
      "done",
      "async ({energy, mass}) => { if (!energy.socket || !mass.profile) throw new Error('missing lifecycle domain'); energy.closed = true }",
    )
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass, bind: () => {}},
      {
        get: () => energy,
        bind: () => {},
        release: () => {
          released = true
        },
      },
    )
    try {
      await claimAndCopy(harness, "done", {})
      await waitFor(() => collectParts(harness.messages, "w+", "replace").length > 0)
      expect(energy.closed).toBe(true)
      expect(released).toBe(true)
      expect(mass).toEqual({profile: {id: "profile-1"}})
    } finally {
      harness.close()
    }
  })

  test("releases Energy after a failing finally Process without clearing Mass", async () => {
    const mass: Record<string, unknown> = {profile: {id: "profile-1"}}
    const energy: Record<string, unknown> = {socket: {ready: true}}
    let released = false
    const process = finallyProcessEntry(
      "failed",
      "async ({energy, mass}) => { if (!energy.socket || !mass.profile) throw new Error('missing lifecycle domain'); throw new Error('cleanup failed') }",
    )
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass, bind: () => {}},
      {
        get: () => energy,
        bind: () => {},
        release: () => {
          released = true
        },
      },
    )
    try {
      await claimAndCopy(harness, "failed", {})
      await waitFor(() => collectParts(harness.messages, "w-", "replace").length > 0)
      const proposal = collectParts(harness.messages, "w-", "replace")[0]
      expect(proposal?.value).toMatchObject({error: "cleanup failed", fields: {}})
      expect(released).toBe(true)
      expect(mass).toEqual({profile: {id: "profile-1"}})
    } finally {
      harness.close()
    }
  })

  test("releases Energy when finally source cannot become a cleanup function", async () => {
    for (const [state, source] of [["not-function", "42"], ["invalid-source", "(()"]] as const) {
      const mass: Record<string, unknown> = {profile: {id: "profile-1"}}
      const energy: Record<string, unknown> = {socket: {ready: true}}
      let released = false
      const harness = createHarness(
        "energy-local",
        {atoms: [[17, "owner/process"]], processes: [finallyProcessEntry(state, source)]},
        "server",
        {get: () => mass, bind: () => {}},
        {
          get: () => energy,
          bind: () => {},
          release: () => {
            released = true
          },
        },
      )
      try {
        await claimAndCopy(harness, state, {})
        await waitFor(() => collectParts(harness.messages, "w-", "replace").length > 0)
        expect(released).toBe(true)
        expect(mass).toEqual({profile: {id: "profile-1"}})
      } finally {
        harness.close()
      }
    }
  })

  test("keeps filesystem payload in Mass and returns compact proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-energy-tool-"))
    const mass: Record<string, unknown> = {filesystemRoot: root}
    const process = processEntry("ready", {
      src: new URL("../../fixture/tools/filesystem.read.ts", import.meta.url).href,
      readFields: [[2, "path"]],
    })
    const harness = createHarness(
      "energy-local",
      {atoms: [[17, "owner/process"]], processes: [process]},
      "server",
      {get: () => mass, bind: () => {}},
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
