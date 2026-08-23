import {describe, expect, test} from "bun:test"
import type {EnergyForce} from "@metafor/types/energy/protocol"
import type {EnergyMassStore} from "@metafor/types/energy/mass"
import type {ForceMessage} from "shared/protocol/force/message"
import {
  REACTION_SIGNAL_KIND,
  type ReactionExecutionSignal,
  type ReactionResultProposal,
} from "shared/protocol/force/reaction"
import {EnergyCatalogStore} from "./catalog.ts"
import {startEnergyProtocol} from "./energy.ts"
import {executeReaction, matchesCondition} from "./reaction.ts"

type ParticleInput = Omit<ForceMessage["parts"][0], "ts"> & {ts?: number}
type ForceMessageInput = {parts: [ParticleInput]}
const message = (input: ForceMessageInput): ForceMessage => ({parts: [{ts: 1, ...input.parts[0]}] as ForceMessage["parts"]})

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
  reactionId: 701,
  target: {atomId: 20, wimp: "target/meta", state: "idle"},
  source: {
    atomId: 10,
    wimp: "source/meta",
    part: {op: "replace", path: "/context", ts: 1_700_000_000_000, value: {fields: {"1": 2}}},
  },
  value: {count: 1, result: 0},
  writeFields: [[202, "result"]],
  cond: "() => ({meta: 'source/meta', op: 'replace', path: '/context'})",
  update: "({update, value, meta, atom, state}) => { if (meta !== 'source/meta' || atom !== '10' || state !== 'idle') throw new Error('bad source'); update({result: value.count + 1}) }",
  ...overrides,
})

describe("Reaction condition evaluator", () => {
  test("supports direct, string, numeric and collection operators", () => {
    expect(matchesCondition("source/meta", {startsWith: "source", notInclude: "other"})).toBe(true)
    expect(matchesCondition(10, {gte: 5, lt: 11, notEq: 9})).toBe(true)
    expect(matchesCondition([1, 2], {include: 2, notInclude: 3, length: 2})).toBe(true)
    expect(matchesCondition("abc", {pattern: /^a/, length: {min: 2, max: 4}})).toBe(true)
    expect(matchesCondition({a: 1}, {a: 1})).toBe(true)
  })

  test("executes matched update with declared writes and persistent Mass", async () => {
    const mass: Record<string, unknown> = {}
    const result = await executeReaction(signal({
      update: "({update, mass}) => { mass.runs = Number(mass.runs ?? 0) + 1; update({result: mass.runs}) }",
    }), "energy-test", {get: () => mass, bind: () => {}})
    expect(result).toEqual({matched: true, fields: {"202": 1}})
    expect(mass).toEqual({runs: 1})

    const skipped = await executeReaction(signal({
      cond: "() => ({meta: 'different/meta'})",
    }), "energy-test", {get: () => mass, bind: () => {}})
    expect(skipped).toEqual({matched: false, fields: {}})
  })

  test("rejects an update key outside the declared Reaction write set", async () => {
    await expect(executeReaction(signal({
      update: "({update}) => update({result: 1, ignored: 9})",
    }), "energy-test", {get: () => ({}), bind: () => {}}))
      .rejects.toThrow('Reaction 701 cannot update undeclared Field "ignored"')
  })
})

describe("Energy Reaction claim protocol", () => {
  const harness = (massStore?: EnergyMassStore) => {
    const messages: ForceMessage[] = []
    const force: EnergyForce = {
      onImpulse: () => {},
      impulse(message) {
        messages.push(structuredClone(message))
      },
    }
    const protocol = startEnergyProtocol({
      force,
      catalog: new EnergyCatalogStore(),
      energyId: "energy-reaction",
      runtimeKind: "server",
      ...(massStore ? {massStore} : {}),
    })
    return {
      messages,
      emit(input: ForceMessageInput) {
        void force.onImpulse(structuredClone(message(input)))
      },
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
      const proposal = runtime.messages.find((item) => item.parts[0]?.part === "w+")?.parts[0]
      expect(proposal).toEqual({
        part: "w+",
        op: "replace",
        path: current.target.atomId,
        ts: expect.any(Number),
        from: "energy-reaction",
        value: {
          reactionExecutionId: current.reactionExecutionId,
          reactionId: current.reactionId,
          matched: true,
          fields: {"202": 2},
        } satisfies ReactionResultProposal,
      })
    } finally {
      runtime.close()
    }
  })

  test("returns an explicit skipped W- when filter does not match", async () => {
    const runtime = harness()
    const current = signal({cond: "() => ({meta: 'other/meta'})"})
    try {
      runtime.emit({parts: [{
        part: "photon",
        op: "test",
        path: current.target.atomId,
        from: current.reactionExecutionId,
        value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "z"))
      runtime.emit({parts: [{part: "z", op: "copy", path: current.target.atomId, from: "energy-reaction", value: current}]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "w-"))
      expect(runtime.messages.find((item) => item.parts[0]?.part === "w-")?.parts[0]?.value).toEqual({
        reactionExecutionId: current.reactionExecutionId,
        reactionId: current.reactionId,
        matched: false,
        fields: {},
      })
    } finally {
      runtime.close()
    }
  })

  test("drops a running Reaction result after its target Atom is removed", async () => {
    const mass: Record<string, unknown> = {}
    const runtime = harness({get: () => mass, bind: () => {}})
    const current = signal({
      update: `async ({update, mass}) => {
        mass.started = true
        await new Promise((resolve) => { mass.finish = resolve })
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
      await waitFor(() => mass.started === true)

      runtime.emit({parts: [{part: "graviton", op: "remove", path: `atom/${current.target.atomId}`}]})
      ;(mass.finish as () => void)()
      await Bun.sleep(10)

      expect(runtime.messages.filter((item) => ["w+", "w-"].includes(item.parts[0]?.part ?? ""))).toEqual([])
    } finally {
      runtime.close()
    }
  })
})
