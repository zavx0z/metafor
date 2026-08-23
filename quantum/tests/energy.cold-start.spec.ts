import {Buffer} from "node:buffer"
import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {EnergyRuntimeStore} from "@metafor/types/energy/energy"
import type {EnergyMassStore} from "@metafor/types/energy/mass"
import {BOUNDARY_INITIAL_PROJECTION_METHOD, type BoundaryInitialProjection} from "@metafor/types/boundary/initial"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {open, type BoundaryDatabase} from "./quantum/boundary/sqlite.ts"
import {birthEnergyRuntime, type EnergyRuntimeForce} from "./quantum/energy/birth.ts"
import {EnergyOracle} from "./quantum/energy/oracle.ts"

type TestForce = EnergyRuntimeForce & {
  readonly sent: ForceMessage[]
  readonly received: Particle[]
  connect(): void
  receive(part: Particle): void
}

const createForce = (events: string[]): TestForce => {
  let connectionHandler: (connected: boolean) => void = () => {}
  const force: TestForce = {
    connected: false,
    sent: [],
    received: [],
    onImpulse: () => {},
    get onConnectionChange() {
      return connectionHandler
    },
    set onConnectionChange(handler) {
      connectionHandler = handler
      handler(force.connected)
    },
    impulse(message) {
      force.sent.push(structuredClone(message))
    },
    connect() {
      events.push("force.connected")
      Object.defineProperty(force, "connected", {value: true, configurable: true})
      connectionHandler(true)
    },
    receive(part) {
      force.received.push(structuredClone(part))
      void force.onImpulse({parts: [structuredClone(part)]})
    },
  }
  return force
}

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for Energy cold-start effect")
    await Bun.sleep(0)
  }
}

describe("Energy cold start", () => {
  const resources: Array<{boundary: BoundaryDatabase | undefined; directory: string}> = []

  afterEach(async () => {
    for (const resource of resources.splice(0)) {
      await resource.boundary?.close()
      await rm(resource.directory, {recursive: true, force: true})
    }
  })

  test("hydrates persisted Atom topology Process and both bindings before Force, then claims without a new Graviton", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-energy-cold-start-"))
    const filename = join(directory, "boundary.sqlite")
    const resource: {boundary: BoundaryDatabase | undefined; directory: string} = {boundary: undefined, directory}
    resources.push(resource)
    let boundary = await open(filename)
    resource.boundary = boundary

    const apply = async (path: "wimp" | "field" | "matter" | "process", value: Record<string, unknown>) => {
      const commit = await boundary.materialize({parts: [{part: "inflaton", op: "add", path, value, by: "dark", ts: 1}]})
      if (!commit) throw new Error(`Boundary did not materialize ${path}`)
      return commit
    }

    await apply("wimp", {src: "owner/root", name: "Root", desc: null})
    await apply("field", {
      wimp: "owner/root", id: 1, key: "slots", type: "array", required: true, default: ["one"],
    })
    await apply("matter", {
      wimp: "owner/root", id: 1, parent: null, edgeSlot: "root", position: 0, kind: "macho",
      collectionBinding: {data: "slots"},
    })
    await apply("matter", {
      wimp: "owner/root", id: 2, parent: 1, edgeSlot: "child", position: 0, kind: "wimp",
      src: "owner/child",
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
      energyBinding: {data: "/energy"},
    })
    await apply("wimp", {src: "owner/child", name: "Child", desc: null})
    await apply("field", {
      wimp: "owner/child", id: 1, key: "command", type: "string", required: true, default: "launch",
    })
    const action = Buffer.from(
      "export default async function({mass,energy,field,value}){mass.command=value.command;energy.fieldType=field.command.type}",
    ).toString("base64")
    await apply("process", {
      wimp: "owner/child", id: 1, key: "ready", type: "action", env: ["server"],
      action: {
        src: `data:application/javascript;base64,${action}`,
        read: [1],
      },
      success: null,
      error: null,
    })

    const rows = await boundary.projection.sql<Array<{
      rootId: number
      childId: number
      topologyId: number
      processId: number
      fieldId: number
      massBinding: number
      energyBinding: number
    }>>`
      SELECT root.id AS rootId, child.id AS childId, topology.id AS topologyId,
             process.id AS processId, field.id AS fieldId, edge.mass_binding AS massBinding,
             edge.energy_binding AS energyBinding
        FROM atom AS root
        JOIN topology ON topology.parent_atom = root.id
        JOIN atom AS child ON child.parent_topology = topology.id
        JOIN process ON process.wimp = child.wimp
        JOIN field ON field.wimp = child.wimp AND field.local_id = 1
        JOIN matter_particle_wimp AS edge ON edge.src = child.wimp
       WHERE root.wimp = ${"owner/root"} AND child.wimp = ${"owner/child"}
       LIMIT 1
    `
    expect(rows).toHaveLength(1)
    const persisted = rows[0]!
    for (const value of Object.values(persisted)) expect(Number.isSafeInteger(value) && value > 0).toBe(true)

    await boundary.close()
    resource.boundary = undefined
    boundary = await open(filename)
    resource.boundary = boundary

    const events: string[] = []
    const parentMass: Record<string, unknown> = {cache: {ready: true}}
    const parentEnergy: Record<string, unknown> = {socket: {ready: true}}
    const masses = new Map<number, Record<string, unknown>>([[persisted.rootId, parentMass]])
    const energies = new Map<number, Record<string, unknown>>([[persisted.rootId, parentEnergy]])
    const massStore: EnergyMassStore = {
      get: ({atomId}) => masses.get(atomId) ?? {},
      bind: ({atomId}, value) => void masses.set(atomId, value),
    }
    const energyStore: EnergyRuntimeStore = {
      get: ({atomId}) => energies.get(atomId) ?? {},
      bind: ({atomId}, value) => void energies.set(atomId, value),
      release: ({atomId}) => void energies.delete(atomId),
    }
    let force: TestForce | undefined
    const oracle = new EnergyOracle()
    const initialProjection = await boundary.initialProjection()
    let resolveProjection: ((projection: BoundaryInitialProjection) => void) | undefined
    const projection = new Promise<BoundaryInitialProjection>((resolve) => {
      resolveProjection = resolve
    })
    const rpcCalls: unknown[] = []
    const birth = birthEnergyRuntime({
      oracle,
      openOracle: async () => {
        events.push("oracle.open")
      },
      peer: {
        async call(target: string, method: string, params: unknown, options: unknown) {
          events.push("boundary.initialProjection.read")
          rpcCalls.push({target, method, params, options})
          return await projection
        },
      } as never,
      createForce() {
        expect(oracle.catalog.atoms.size).toBe(2)
        expect(oracle.catalog.topologies.size).toBe(1)
        expect(oracle.catalog.processes.size).toBe(1)
        expect(oracle.catalog.fieldSchema("owner/child")).toEqual({
          command: {type: "string", required: true, default: "launch"},
        })
        expect(oracle.catalog.continuations.size).toBe(1)
        expect(oracle.catalog.parentAtom(persisted.childId)?.id).toBe(persisted.rootId)
        expect(oracle.catalog.continuation(persisted.childId)).toEqual({
          massBinding: {data: "/mass", directMass: {kind: "whole"}},
          energyBinding: {data: "/energy"},
        })
        events.push("force.create")
        force = createForce(events)
        return force
      },
      protocol: {energyId: "energy-cold", runtimeKind: "server", massStore, energyStore},
    })

    await waitFor(() => resolveProjection !== undefined)
    expect(force).toBeUndefined()
    expect(events).toEqual(["oracle.open", "boundary.initialProjection.read"])
    expect(rpcCalls).toEqual([{
      target: "boundary",
      method: BOUNDARY_INITIAL_PROJECTION_METHOD,
      params: {},
      options: {waitMs: 30_000},
    }])
    resolveProjection!(initialProjection)
    const runtime = await birth

    expect(events).toEqual([
      "oracle.open",
      "boundary.initialProjection.read",
      "force.create",
    ])
    expect(runtime.summary).toEqual({
      atoms: 2, topologies: 1, fields: 2, variants: 0, processes: 1, continuations: 1,
    })
    expect(oracle.catalog.parentAtom(persisted.childId)?.id).toBe(persisted.rootId)
    expect(oracle.catalog.continuation(persisted.childId)).toEqual({
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
      energyBinding: {data: "/energy"},
    })
    expect(await oracle.onHealthRequested().json()).toMatchObject({initialized: false, rpc: "prepared"})

    force!.connect()
    expect(events.at(-1)).toBe("force.connected")
    expect(await oracle.onHealthRequested().json()).toMatchObject({initialized: true, rpc: "ready"})

    const executionId = "cold-start-execution"
    force!.receive({
      part: "photon", op: "test", path: persisted.childId, by: "matrix", ts: 2,
      from: executionId, value: "ready",
    })
    await waitFor(() => force!.sent.some((message) => message.parts[0].part === "z"))
    expect(force!.sent.at(-1)?.parts[0]).toMatchObject({
      part: "z", op: "test", path: persisted.childId,
      value: {energy: "energy-cold", processExecutionId: executionId},
    })
    expect(masses.get(persisted.childId)).toBe(parentMass)
    expect(energies.get(persisted.childId)).toBe(parentEnergy)

    force!.receive({
      part: "z", op: "copy", path: persisted.childId, by: "matrix", ts: 3,
      from: "energy-cold", value: {
        processExecutionId: executionId,
        fields: {[String(persisted.fieldId)]: "launch"},
      },
    })
    await waitFor(() => force!.sent.some((message) => message.parts[0].part === "w+" || message.parts[0].part === "w-"))
    expect(force!.sent.find((message) => message.parts[0].part === "w-")).toBeUndefined()
    expect(parentMass.command).toBe("launch")
    expect(parentEnergy.fieldType).toBe("string")
    expect(rpcCalls).toHaveLength(1)
    expect(force!.received.map((part) => part.part)).toEqual(["photon", "z"])
    expect(force!.received.some((part) => part.part === "graviton")).toBe(false)
    expect(force!.sent.some((message) => message.parts[0].part === "graviton")).toBe(false)

    runtime.protocol.close()
  })
})
