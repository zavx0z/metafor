import {beforeEach, expect, test} from "bun:test"
import type {Force} from "shared/transport/force"
import type {ForceMessage, ForceMessageInput} from "shared/protocol/force/message"
import type {BoundaryInitialState} from "shared/protocol/boundary/initial"
import {REACTION_STATE_COMMIT_KIND, isReactionTriggerRequest} from "shared/protocol/force/reaction"
import {weak$} from "./weak"
import {prepareMatrixBirth} from "./birth"

beforeEach(() => weak$.dispose())

const initial = (): BoundaryInitialState => ({version: 3, pendingProcessExecutions: [], unfinishedReactionExecutions: [],
  atoms: [
    {id: 17, wimp: "owner/source", state: 201, values: [{field: 101, valueId: 1001, value: 0}]},
    {id: 18, wimp: "owner/observer", state: 301, values: []},
  ],
  declarations: [
    {src: "owner/source", section: "fields", localId: "1", value: {id: 101, key: "input", type: "number", default: 0, position: 0}},
    ...["idle", "awaiting-oracle", "ready"].map((name, index) => ({src: "owner/source", section: "states" as const, localId: String(index + 1), value: {id: 201 + index, name, position: index}})),
    {src: "owner/source", section: "transitions", localId: "1", value: {id: 401, fromState: 201, toState: 202, position: 0}},
    {src: "owner/source", section: "transitions", localId: "2", value: {id: 402, fromState: 202, toState: 203, position: 1}},
    {src: "owner/source", section: "conditions", localId: "1", value: {id: 501, transition: 401, field: 101, position: 0, predicate: {gt: 10}}},
    {src: "owner/source", section: "conditions", localId: "2", value: {id: 502, transition: 402, field: 101, position: 0, predicate: {gt: 11}}},
    {src: "owner/observer", section: "states", localId: "1", value: {id: 301, name: "listening", position: 0}},
  ],
  reactionRelations: [{kind: "reaction-relation", key: "601:18:17", reactionId: 601, reactionKey: "observe", target: {atomId: 18, wimp: "owner/observer", stateIds: [301]},
    source: {atomId: 17, wimp: "owner/source", states: [{id: 202, name: "awaiting-oracle"}, {id: 203, name: "ready"}]}}],
})

test.each(["fields", "process-alias"] as const)("actual Matrix routes delayed Boundary confirmations exactly once after %s ticks", async mode => {
  const previous = Bun.env.METAFOR_WEAK_BACKEND
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
  try {
    const snapshot = initial()
    if (mode === "process-alias") {
      snapshot.declarations.find(declaration => declaration.section === "conditions" && declaration.value.id === 502)!.value.predicate = {gt: 10}
      snapshot.atoms.push({id: 19, wimp: "owner/process", state: 401, values: [{field: 102, valueId: 1001, value: 0}]})
      snapshot.declarations.push(
        {src: "owner/process", section: "fields", localId: "1", value: {id: 102, key: "ack", type: "number", default: 0, position: 0}},
        {src: "owner/process", section: "states", localId: "1", value: {id: 401, name: "observe", position: 0}},
        {src: "owner/process", section: "processes", localId: "1", value: {id: 501, key: "observe", state: "observe"}},
      )
      snapshot.pendingProcessExecutions = [{executionId: "old-observe-execution", atom: 19, process: 501, state: "observe"}]
    }
    await prepareMatrixBirth(snapshot)
    const runtime = await import(`./matrix.ts?state-confirmation=${crypto.randomUUID()}`)
    const emitted: ForceMessageInput[] = []
    const port: Pick<Force, "onImpulse" | "onImpulseError" | "impulse"> = {onImpulse: () => {}, onImpulseError: () => {}, impulse: message => {emitted.push(structuredClone(message))}}
    await runtime.startMatrixForce(() => port)
    const receive = (message: ForceMessage) => Promise.resolve(port.onImpulse!(message))
    const tick = (value: number) => receive({parts: [{part: "gluon", op: "replace", path: 17, ts: value, value: {fields: {"101": value}}}]})
    const parentState = () => runtime.matrix$.getStateName(runtime.gravity$.getBraneIndexByAtomId(17)!, runtime.matrix$.states[runtime.gravity$.getBraneIndexByAtomId(17)!]!)
    if (mode === "fields") {await tick(11); await tick(12)}
    else {
      const execution = emitted.flatMap(message => message.parts).find(part => part.part === "photon" && part.op === "test" && part.path === 19)!
      await receive({parts: [{part: "z", op: "test", path: 19, ts: 10, value: {energy: "energy-test", processExecutionId: execution.from}}]})
      // Child's own canonical write shares valueId with the parent ACK. The
      // later alias copy must not produce a second tick for that same value.
      await receive({parts: [{part: "gluon", op: "replace", path: 19, ts: 11, from: execution.from!, value: {fields: {"102": 11}}}]})
      expect(parentState()).toBe("awaiting-oracle")
      await receive({parts: [{part: "gluon", op: "replace", path: 17, ts: 12, from: execution.from!, value: {fields: {"101": 11}}}]})
      expect(parentState()).toBe("awaiting-oracle")
      await receive({parts: [{part: "w+", op: "copy", path: 19, ts: 13, from: execution.from!, value: {processExecutionId: execution.from, processId: 501, energy: "energy-test"}}]})
      expect(parentState()).toBe("ready")
    }
    const photons = emitted.flatMap(message => message.parts).filter(part => part.part === "photon" && part.op === "replace" && part.path === 17)
    expect(photons.map(part => part.value)).toEqual(["awaiting-oracle", "ready"])
    const confirm = (index: number): ForceMessage => ({parts: [{part: "photon", op: "copy", by: "boundary", path: 17, ts: 20 + index, from: photons[index]!.from!, value: {
      kind: REACTION_STATE_COMMIT_KIND, eventId: photons[index]!.from!, atomId: 17, wimp: "owner/source", stateId: 202 + index, state: photons[index]!.value,
    }}]})
    await receive(confirm(0))
    await receive(confirm(1))
    const triggers = () => emitted.flatMap(message => message.parts).map(part => part.value).filter(isReactionTriggerRequest)
    expect(triggers().map(request => [request.source.stateId, request.eventId])).toEqual([[202, String(photons[0]!.from)], [203, String(photons[1]!.from)]])
    await receive(confirm(0))
    expect(triggers()).toHaveLength(2)
    const mismatch = structuredClone(confirm(0))
    const mismatchedState = mismatch.parts[0].value as {state: string}
    mismatchedState.state = "foreign"
    await expect(receive(mismatch)).rejects.toThrow("exact published event")
    const unknown = structuredClone(confirm(1))
    unknown.parts[0].from = "unpublished-event"
    const unknownState = unknown.parts[0].value as {eventId: string}
    unknownState.eventId = "unpublished-event"
    await expect(receive(unknown)).rejects.toThrow("exact published event")
    const foreignPacket = structuredClone(confirm(1))
    foreignPacket.parts[0].path = 18
    await expect(receive(foreignPacket)).rejects.toThrow("invalid confirmed Reaction State")
    expect(triggers()).toHaveLength(2)
    expect(runtime.matrix$.getStateName(runtime.gravity$.getBraneIndexByAtomId(17)!, runtime.matrix$.states[runtime.gravity$.getBraneIndexByAtomId(17)!]!)).toBe("ready")
  } finally {
    weak$.dispose()
    if (previous === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
    else Bun.env.METAFOR_WEAK_BACKEND = previous
  }
})
