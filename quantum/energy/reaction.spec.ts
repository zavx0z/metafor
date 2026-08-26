import {describe, expect, test} from "bun:test"
import type {EnergyForce} from "@energy/types/protocol"
import type {EnergyMassStore} from "@energy/types/mass"
import type {ForceMessage} from "shared/protocol/force/message"
import {
  REACTION_SIGNAL_KIND,
  type ReactionExecutionSignal,
  type ReactionResultProposal,
} from "shared/protocol/force/reaction"
import {EnergyCatalogStore} from "./graph/catalog.ts"
import {startEnergyProtocol} from "./energy.ts"
import {executeReaction, ReactionInvariantError} from "./reaction.ts"

type ParticleInput = Omit<ForceMessage["parts"][0], "ts"> & {ts?: number}
type ForceMessageInput = {parts: [ParticleInput]}

const message = (input: ForceMessageInput): ForceMessage => ({
  parts: [{ts: 1, ...input.parts[0]}] as ForceMessage["parts"],
})

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for Reaction result")
    await Bun.sleep(1)
  }
}

const signal = (overrides: Partial<ReactionExecutionSignal> = {}): ReactionExecutionSignal => ({
  kind: REACTION_SIGNAL_KIND,
  reactionExecutionId: "reaction-execution",
  relationKey: "701:20:10",
  reactionId: 701,
  reactionKey: "remember",
  eventId: "state-event",
  target: {atomId: 20, wimp: "target/meta", stateId: 201, state: "idle"},
  source: {atomId: 10, wimp: "source/meta", stateId: 101, state: "ready"},
  timestamp: 1_700_000_000_000,
  readFields: [[201, "count", 1]],
  writeFields: [[202, "result"]],
  massRead: [],
  massWrite: [],
  updateSource: "({update, value, observation}) => { if (observation.source.state !== 'ready') throw new Error('bad observation'); update({result: value.count + 1}) }",
  ...overrides,
})

describe("Energy Reaction execution", () => {
  test("executes without filter, previous State, Force part or live Energy", async () => {
    const result = await executeReaction(signal({
      updateSource: `({update, value, observation, energy, part}) => {
        if (energy !== undefined || part !== undefined) throw new Error("unexpected runtime input")
        globalThis.__reactionObservation = observation
        update({result: value.count + 1})
      }`,
    }), "energy-test", {get: () => ({}), bind: () => {}})
    const received = (globalThis as Record<string, unknown>).__reactionObservation
    delete (globalThis as Record<string, unknown>).__reactionObservation

    expect(result).toEqual({fields: {"202": 2}})
    expect(received).toEqual({
      id: "state-event",
      source: {atom: "atom:10", meta: "source/meta", state: "ready"},
      timestamp: 1_700_000_000_000,
    })
  })

  test("reads and writes declared Mass without exposing undeclared dependencies", async () => {
    const history = {
      readBytes: async () => new Uint8Array(),
      readText: async () => "",
      readJson: async () => ({count: 1}),
      write: async () => {},
    }
    const result = await executeReaction(signal({
      massRead: ["history"],
      massWrite: ["history"],
      updateSource: "async ({update, mass}) => { if (mass.secret !== undefined) throw new Error('undeclared Mass leaked'); const value = await mass.history.readJson(); await mass.history.write({count: value.count + 1}); update({result: value.count + 1}) }",
    }), "energy-test", {get: () => ({history, secret: history}), bind: () => {}})
    expect(result).toEqual({fields: {"202": 2}})
  })

  test("treats a missing declared Mass dependency as a fatal invariant", async () => {
    await expect(executeReaction(signal({massRead: ["history"]}), "energy-test", {
      get: () => ({}),
      bind: () => {},
    })).rejects.toBeInstanceOf(ReactionInvariantError)
  })

  test("rejects an update key outside the declared Reaction write set", async () => {
    await expect(executeReaction(signal({
      updateSource: "({update}) => update({result: 1, ignored: 9})",
    }), "energy-test", {get: () => ({}), bind: () => {}}))
      .rejects.toThrow('Reaction 701 cannot update undeclared Field "ignored"')
  })
})

describe("Energy Reaction claim protocol", () => {
  const harness = (options: {massStore?: EnergyMassStore; onFatal?(error: Error): void} = {}) => {
    const messages: ForceMessage[] = []
    const force: EnergyForce = {
      onImpulse: () => {},
      impulse(input) {
        messages.push(structuredClone(input))
      },
    }
    const protocol = startEnergyProtocol({
      force,
      catalog: new EnergyCatalogStore(),
      energyId: "energy-reaction",
      runtimeKind: "server",
      ...options,
    })
    return {
      messages,
      emit(input: ForceMessageInput) {
        void force.onImpulse(structuredClone(message(input)))
      },
      quiesce: () => protocol.quiesce(),
      close() {
        protocol.close()
      },
    }
  }

  test("claims, executes and returns identified W+ proposal", async () => {
    const runtime = harness()
    const current = signal()
    try {
      runtime.emit({parts: [{
        part: "photon",
        op: "test",
        path: current.target.atomId,
        from: current.reactionExecutionId,
        value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "z"))
      expect(runtime.messages[0]?.parts[0]).toEqual({
        part: "z",
        op: "test",
        path: current.target.atomId,
        ts: expect.any(Number),
        value: {
          kind: "reaction-claim",
          energy: "energy-reaction",
          reactionExecutionId: current.reactionExecutionId,
        },
      })

      runtime.emit({parts: [{
        part: "z",
        op: "copy",
        path: current.target.atomId,
        from: "energy-reaction",
        value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "w+"))
      expect(runtime.messages.find((item) => item.parts[0]?.part === "w+")?.parts[0]).toEqual({
        part: "w+",
        op: "replace",
        path: current.target.atomId,
        ts: expect.any(Number),
        from: "energy-reaction",
        value: {
          reactionExecutionId: current.reactionExecutionId,
          relationKey: current.relationKey,
          reactionId: current.reactionId,
          fields: {"202": 2},
        } satisfies ReactionResultProposal,
      })
    } finally {
      runtime.close()
    }
  })

  test("reports a missing declared dependency through the fatal path without W-", async () => {
    const failures: Error[] = []
    const runtime = harness({
      massStore: {get: () => ({}), bind: () => {}},
      onFatal: (error) => failures.push(error),
    })
    const current = signal({massRead: ["history"]})
    try {
      runtime.emit({parts: [{
        part: "photon", op: "test", path: current.target.atomId,
        from: current.reactionExecutionId, value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "z"))
      runtime.emit({parts: [{
        part: "z", op: "copy", path: current.target.atomId,
        from: "energy-reaction", value: current,
      }]})
      await waitFor(() => failures.length === 1)
      expect(failures[0]).toBeInstanceOf(ReactionInvariantError)
      expect(runtime.messages.some((item) => item.parts[0]?.part === "w-")).toBe(false)
      await expect(runtime.quiesce()).rejects.toBeInstanceOf(ReactionInvariantError)
    } finally {
      runtime.close()
    }
  })

  test("fails the domain instead of ignoring a malformed Reaction signal", () => {
    const failures: Error[] = []
    const runtime = harness({onFatal: (error) => failures.push(error)})
    const current = signal()
    try {
      expect(() => runtime.emit({parts: [{
        part: "photon", op: "test", path: current.target.atomId,
        from: current.reactionExecutionId, value: {...current, part: {op: "replace"}},
      }]})).toThrow("invalid Reaction execution signal")
      expect(failures).toHaveLength(1)
    } finally {
      runtime.close()
    }
  })

  test("drops a running Reaction result after its target Atom is removed", async () => {
    const runtime = harness()
    const current = signal({
      updateSource: `async ({update}) => {
        globalThis.__reactionStarted = true
        await new Promise((resolve) => { globalThis.__reactionFinish = resolve })
        update({result: 9})
      }`,
    })
    try {
      runtime.emit({parts: [{
        part: "graviton",
        op: "add",
        path: `atom/${current.target.atomId}`,
        value: {
          atom: {
            id: current.target.atomId,
            parentAtom: null,
            parentTopology: null,
            wimp: current.target.wimp,
            position: 0,
          },
          values: [], valueRecords: [], valueItems: [], state: null,
        },
      }]})
      runtime.emit({parts: [{
        part: "photon", op: "test", path: current.target.atomId,
        from: current.reactionExecutionId, value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "z"))
      runtime.emit({parts: [{
        part: "z", op: "copy", path: current.target.atomId,
        from: "energy-reaction", value: current,
      }]})
      await waitFor(() => (globalThis as Record<string, unknown>).__reactionStarted === true)

      runtime.emit({parts: [{part: "graviton", op: "remove", path: `atom/${current.target.atomId}`}]})
      ;((globalThis as Record<string, unknown>).__reactionFinish as () => void)()
      await Bun.sleep(10)
      delete (globalThis as Record<string, unknown>).__reactionStarted
      delete (globalThis as Record<string, unknown>).__reactionFinish

      expect(runtime.messages.filter((item) => ["w+", "w-"].includes(item.parts[0]?.part ?? ""))).toEqual([])
    } finally {
      runtime.close()
    }
  })
})
