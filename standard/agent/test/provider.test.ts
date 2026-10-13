import {expect, test} from "bun:test"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import type {AtomBrowserConnection, AtomContext, AtomViewSnapshot} from "../atom"
import type {AtomRef} from "@metafor/types/metafor/graph"
import type {ProviderCatalogEntry} from "@metafor/types/metafor/providers"
import {useProvider} from "../provider"
import {DEFAULT_AGENT_PRESENTATION} from "../presentation"

function fixture() {
  const ref = "atom:agent" as AtomRef
  const entry: ProviderCatalogEntry = {id: "one", service: "capsule", host: "remote", remotePeerId: "remote-one", executorId: "executor-one",
    source: {kind: "native-bootstrap", assignmentId: "assigned", remoteGraph: "unknown"}, resolution: "unknown", connection: "unknown",
    checks: {status: "unknown", checkedAt: null, message: null}, capabilities: {modelTurn: true, browserPreview: true, browserControl: true}}
  const registry = createProviderRegistry()
  registry.entries.push(entry)
  let snapshot: AtomViewSnapshot = {ref, revision: "one", state: "idle", configuration: {id: "assistant", atom: {kind: "atom", scope: "owner"},
    presentation: DEFAULT_AGENT_PRESENTATION, tools: [], displays: []}, chat: [], provider: null, providers: {ref: "atom:provider" as AtomRef, registry}, operations: [], context: null}
  let closed = 0
  const connection: AtomBrowserConnection = {binding: entry, iceServers: [], client: {async describe() {return {instanceId: "instance", profile: "saved", controlEnabled: false}}, socket() {throw new Error("unused")}, async close() {closed++}}}
  let complete!: (value: AtomBrowserConnection) => void
  const atom: AtomContext = {ref, getSnapshot: () => snapshot, subscribe: () => () => {}, actions: {connectBrowser: () => new Promise(resolve => {complete = resolve})}}
  return {atom, entry, registry, connection, finish: () => complete(connection), closeCount: () => closed,
    replaceEntry(next: ProviderCatalogEntry) {snapshot = {...snapshot, providers: {ref: snapshot.providers!.ref, registry: {...registry, entries: [next]}}}}}
}

test("explicit Provider view reads canonical registry identity and never rewrites model selection", async () => {
  const f = fixture(), provider = useProvider(f.atom)
  expect(provider.getSnapshot()?.registry).toBe(f.registry)
  const request = provider.connectBrowser("one", new AbortController().signal)
  f.finish()
  expect(await request).toBe(f.connection)
  expect(f.registry.settings.selectedId).toBeNull()
  await expect(provider.connectBrowser("unknown", new AbortController().signal)).rejects.toThrow("not assigned")
})

test("replacement or cancellation during grant acquisition releases the exact returned client", async () => {
  const f = fixture(), provider = useProvider(f.atom)
  const request = provider.connectBrowser("one", new AbortController().signal)
  f.replaceEntry({...f.entry, executorId: "replacement"})
  f.finish()
  await expect(request).rejects.toThrow("binding changed")
  expect(f.closeCount()).toBe(1)
  const cancelled = fixture(), abort = new AbortController()
  const pending = useProvider(cancelled.atom).connectBrowser("one", abort.signal)
  abort.abort()
  cancelled.finish()
  await expect(pending).rejects.toThrow()
  expect(cancelled.closeCount()).toBe(1)
})
