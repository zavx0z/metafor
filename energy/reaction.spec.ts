import {describe, expect, test} from "bun:test"
import type {EnergyForce} from "@metafor/types/energy/protocol"
import type {ForceMessage} from "@metafor/types/force/message"
import {
  REACTION_SIGNAL_KIND,
  type ReactionExecutionSignal,
  type ReactionResultProposal,
} from "@metafor/types/force/reaction"
import {startEnergyProtocol} from "./energy.ts"
import {executeReaction, matchesCondition} from "./reaction.ts"

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
  target: {actorId: 20, wimp: "target/meta", state: "idle"},
  source: {
    actorId: 10,
    wimp: "source/meta",
    timestamp: 1_700_000_000_000,
    part: {op: "replace", path: "/context", value: {fields: {"1": 2}}},
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
      update: "({update, mass}) => { mass.runs = Number(mass.runs ?? 0) + 1; update({result: mass.runs, ignored: 9}) }",
    }), "energy-test", {get: () => mass})
    expect(result).toEqual({matched: true, fields: {"202": 1}})
    expect(mass).toEqual({runs: 1})

    const skipped = await executeReaction(signal({
      cond: "() => ({meta: 'different/meta'})",
    }), "energy-test", {get: () => mass})
    expect(skipped).toEqual({matched: false, fields: {}})
  })
})

describe("Energy Reaction claim protocol", () => {
  const harness = () => {
    const messages: ForceMessage[] = []
    const force: EnergyForce = {
      onImpulse: () => {},
      impulse(message) {
        messages.push(structuredClone(message))
      },
    }
    const protocol = startEnergyProtocol({force, energyId: "energy-reaction", runtimeKind: "server"})
    return {
      messages,
      emit(message: ForceMessage) {
        void force.onImpulse(structuredClone(message))
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
        path: current.target.actorId,
        from: current.reactionExecutionId,
        value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "z"))
      expect(runtime.messages[0]?.parts[0]).toEqual({
        part: "z",
        op: "test",
        path: current.target.actorId,
        value: {
          kind: "reaction-claim",
          energy: "energy-reaction",
          reactionExecutionId: current.reactionExecutionId,
        },
      })

      runtime.emit({parts: [{
        part: "z",
        op: "copy",
        path: current.target.actorId,
        from: "energy-reaction",
        value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "w+"))
      const proposal = runtime.messages.find((item) => item.parts[0]?.part === "w+")?.parts[0]
      expect(proposal).toEqual({
        part: "w+",
        op: "replace",
        path: current.target.actorId,
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
        path: current.target.actorId,
        from: current.reactionExecutionId,
        value: current,
      }]})
      await waitFor(() => runtime.messages.some((item) => item.parts[0]?.part === "z"))
      runtime.emit({parts: [{part: "z", op: "copy", path: current.target.actorId, from: "energy-reaction", value: current}]})
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
})
