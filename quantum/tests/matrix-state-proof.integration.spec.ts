import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {Force} from "shared/transport/force"
import {OracleRpcPeer} from "shared/transport/oracle"
import {DARK_FORCE_HISTORY_READ_METHOD, type DarkForceHistoryReadReceipt} from "shared/protocol/metafor/observation"
import {isReactionStateCommit, type ReactionStateCommit} from "shared/protocol/force/reaction"
import type {ForceMessage, ForceMessageInput} from "shared/protocol/force/message"
import type {SourcedParticle} from "shared/protocol/force/particle"
import {MetaFor} from "../../create-metafor/dsl/metafor"
import {open} from "../boundary/sqlite"
import {matterParticles} from "../dark/dark"
import {DarkForceHistory} from "../dark/force/history"
import {DarkForceHistoryReadService} from "../dark/oracle/history"
import {createLocalOracleChannelPair} from "../dark/oracle/local"
import {OracleRouter} from "../dark/oracle/router"
import {prepareMatrixBirth} from "../matrix/birth"
import {weak$} from "../matrix/weak"
import {proveMatrixStatePublication} from "../matrix/state-proof"

const ROOT = "intel-macos-chrome-studio"
const proofRpc = (history: DarkForceHistory, mutate?: (receipt: DarkForceHistoryReadReceipt) => DarkForceHistoryReadReceipt) => {
  const calls: unknown[] = []
  const dark = createLocalOracleChannelPair("dark", () => [DARK_FORCE_HISTORY_READ_METHOD])
  const matrix = createLocalOracleChannelPair("matrix", () => [])
  const service = new DarkForceHistoryReadService(history)
  const server = new OracleRpcPeer(dark.peer), client = new OracleRpcPeer(matrix.peer)
  server.expose(DARK_FORCE_HISTORY_READ_METHOD, input => {calls.push(structuredClone(input)); const result = service.read(input); return mutate ? mutate(result) : result})
  const router = new OracleRouter()
  router.attach(dark.router)
  router.attach(matrix.router)
  return {client, service, calls, async close() {server.close(); client.close(); await dark.peer.close(); await matrix.peer.close()}}
}

const confirmation = (event: ReactionStateCommit, ts = 11): ForceMessage => ({parts: [{part: "photon", op: "copy", by: "boundary", path: event.atomId, from: event.eventId, ts, value: event}]})

test("cold Matrix restores persisted State11 intent/confirmation while actual Boundary snapshot already stores State12, including identical reconfirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "matrix-cold-state-proof-"))
  const previous = Bun.env.METAFOR_WEAK_BACKEND
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
  weak$.dispose()
  const boundary = await open(join(directory, "boundary.sqlite"))
  const journal = join(directory, "history")
  const history = new DarkForceHistory(journal, {cutId: "cold-state-cut"})
  const root = MetaFor("Desktop proof").fields(() => ({})).superposition({
    s1: null, s2: null, s3: null, s4: null, s5: null, s6: null, s7: null, s8: null, s9: null, s10: null,
    "awaiting-oracle": null, ready: null,
  }).mass(() => ({})).energy().processes().reactions().matter().bulk()
  let rpc: ReturnType<typeof proofRpc> | undefined
  try {
    for await (const particle of matterParticles(ROOT, async () => root)) await boundary.materialize({parts: [particle]})
    const events: ReactionStateCommit[] = []
    for (const [index, state] of ["awaiting-oracle", "ready"].entries()) {
      const source: SourcedParticle = {part: "photon", op: "replace", path: 1, by: "matrix", from: `old-publication-${11 + index}`, ts: 11 + index, value: state}
      history.accept(source)
      const committed = await boundary.materialize({parts: [source]})
      const copy = committed?.messages.map(message => message.parts[0]).find(part => isReactionStateCommit(part.value))
      if (!copy || !isReactionStateCommit(copy.value)) throw new Error("Boundary did not commit exact State")
      history.accept({...copy, by: "boundary"})
      events.push(copy.value)
    }
    const snapshot = await boundary.initialState()
    expect(events.map(event => event.stateId)).toEqual([11, 12])
    expect(snapshot.atoms[0]?.state).toBe(12)
    // A new reader reloads the actual immutable history bytes, with no local
    // publication map or previous Matrix process surviving this birth.
    const persisted = new DarkForceHistory(journal)
    rpc = proofRpc(persisted)
    const birth = rpc.service.read({contractVersion: 1, query: {kind: "frontier"}}).frontier
    persisted.accept(confirmation(events[1]!, 12).parts[0] as SourcedParticle)
    for (let incarnation = 0; incarnation < 2; incarnation++) {
      weak$.dispose()
      await prepareMatrixBirth(snapshot)
      const runtime = await import(`../matrix/matrix.ts?cold-state-proof=${crypto.randomUUID()}`)
      const emitted: ForceMessageInput[] = []
      const port: Pick<Force, "onImpulse" | "onImpulseError" | "impulse"> = {onImpulse() {}, onImpulseError() {}, impulse: message => {emitted.push(message)}}
      await runtime.startMatrixForce(() => port, {recoverStatePublication: (event: ReactionStateCommit) => proveMatrixStatePublication(rpc!.client, birth, event)})
      expect(emitted).toEqual([])
      const wrongSource = confirmation(events[0]!, 11)
      wrongSource.parts[0].by = "energy"
      await expect(Promise.resolve(port.onImpulse!(wrongSource))).rejects.toThrow("invalid confirmed Reaction State")
      await expect(Promise.resolve(port.onImpulse!(confirmation({...events[0]!, wimp: "foreign/meta"}, 11)))).rejects.toThrow("born Atom declaration")
      await port.onImpulse!(confirmation(events[0]!, 11))
      await port.onImpulse!(confirmation(events[1]!, 12))
      await port.onImpulse!(confirmation(events[1]!, 12))
      expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("ready")
      expect(emitted).toEqual([])
    }
    expect(rpc.calls).toHaveLength(4)
    expect(rpc.calls.every(input => (input as {query: {kind: string}}).query.kind === "origin")).toBeTrue()
  } finally {
    weak$.dispose()
    await rpc?.close()
    await boundary.close()
    await rm(directory, {recursive: true, force: true})
    if (previous === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
    else Bun.env.METAFOR_WEAK_BACKEND = previous
  }
})

test.each(["missing", "conflict", "ambiguous", "foreign-source", "truncated", "wrong-cut", "live-only"] as const)("cold publication proof refuses %s history without a State fallback", async failure => {
  const directory = await mkdtemp(join(tmpdir(), "matrix-state-proof-deny-"))
  const history = new DarkForceHistory(join(directory, "history"), {cutId: "proof-cut"})
  const event: ReactionStateCommit = {kind: "state-commit", eventId: "old-event", atomId: 1, wimp: ROOT, stateId: 11, state: "awaiting-oracle"}
  if (failure !== "missing") history.accept({part: "photon", op: "replace", path: 1, ts: 11, by: failure === "foreign-source" ? "energy" : "matrix", from: event.eventId, value: event.state})
  const copy = confirmation(failure === "conflict" ? {...event, stateId: 12} : event).parts[0] as SourcedParticle
  history.accept(copy)
  if (failure === "ambiguous") history.accept({part: "photon", op: "replace", path: 1, ts: 11, by: "matrix", from: event.eventId, value: event.state})
  const rpc = proofRpc(history, failure === "truncated" ? receipt => ({...receipt, range: {...receipt.range!, truncated: true}})
    : failure === "wrong-cut" ? receipt => ({...receipt, frontier: {...receipt.frontier, cutId: "other-cut"}}) : undefined)
  try {
    const birth = {cutId: "proof-cut", throughSequence: failure === "live-only" ? 0 : history.status().sequence, retroactiveComplete: false as const}
    await expect(proveMatrixStatePublication(rpc.client, birth, event)).rejects.toThrow()
    expect(rpc.calls).toHaveLength(1)
  } finally {await rpc.close(); await rm(directory, {recursive: true, force: true})}
})

test("a late first confirmation already represented by the born Process State does not create another execution", async () => {
  weak$.dispose()
  const previous = Bun.env.METAFOR_WEAK_BACKEND
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
  try {
    await prepareMatrixBirth({version: 3, pendingProcessExecutions: [], unfinishedReactionExecutions: [], reactionRelations: [],
      atoms: [{id: 1, wimp: ROOT, state: 12, values: []}],
      declarations: [
        {src: ROOT, section: "states", localId: "1", value: {id: 11, name: "observing", position: 0}},
        {src: ROOT, section: "states", localId: "2", value: {id: 12, name: "ready", position: 1}},
        {src: ROOT, section: "processes", localId: "1", value: {id: 21, key: "ready", state: "ready"}},
      ],
    })
    const runtime = await import(`../matrix/matrix.ts?already-hydrated-late-state=${crypto.randomUUID()}`)
    const emitted: ForceMessageInput[] = []
    const port: Pick<Force, "onImpulse" | "onImpulseError" | "impulse"> = {onImpulse() {}, onImpulseError() {}, impulse: message => {emitted.push(message)}}
    await runtime.startMatrixForce(() => port, {recoverStatePublication: async () => ({confirmedBeforeBirth: false})})
    await port.onImpulse!(confirmation({kind: "state-commit", eventId: "old-ready", atomId: 1, wimp: ROOT, stateId: 12, state: "ready"}))
    expect(emitted).toEqual([])
    expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("ready")
    expect(runtime.matrix$.branes[0]?.lock).toBeFalse()
  } finally {
    weak$.dispose()
    if (previous === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
    else Bun.env.METAFOR_WEAK_BACKEND = previous
  }
})
