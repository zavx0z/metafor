import {expect, test} from "bun:test"
import {parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {createProductRouter, type ProductRouteApplication} from "../main/router"
import {isProductPath, parseProductRoute, productRoutePath, resolveProductRoute, type ProductRouteContext, type ProductRouteResolution} from "../shared/product-route"

const root = parseMetaAddress("@fixture/environment")!
const atom = (id: string, meta = root): RuntimeAtom => ({kind: "atom", ref: `atom:${id}`, declaration: "#/template", meta, state: null, values: {}, mass: []})
function graph(): Graph {
  return {schema: "metafor/graph", root, template: {}, runtime: {roots: [{...atom("root-id"), children: [
    {kind: "topology", ref: "topology:office", topology: "fuzzy", declaration: "#/template", children: [atom("agent:α", parseMetaAddress("@metafor/agent")!)]},
  ]}], reactions: []}}
}
const ready = (): ProductRouteContext => ({status: "ready", verseId: "verse-α", graph: graph(), observedWorld: {root, cutId: "not-a-verse-id"}})

function fixture(path = "/", initial = ready()) {
  let context = initial, index = 0
  const sourceListeners = new Set<() => void>(), events = new EventTarget()
  const entries: {url: URL; state: unknown}[] = [{url: new URL(path, "https://fixture.test"), state: {external: "preserved"}}]
  const current = () => entries[index]!
  let pushes = 0, replaces = 0
  const history = {
    get state() {return current().state},
    pushState(data: unknown, _unused: string, url?: string | URL | null) {
      pushes++; entries.splice(index + 1); entries.push({url: new URL(String(url), current().url), state: structuredClone(data)}); index++
    },
    replaceState(data: unknown, _unused: string, url?: string | URL | null) {
      replaces++; entries[index] = {url: new URL(String(url), current().url), state: structuredClone(data)}
    },
  }
  const applied: {resolution: ProductRouteResolution; application: ProductRouteApplication}[] = []
  const router = createProductRouter({source: {getSnapshot: () => context, subscribe(listener) {sourceListeners.add(listener); return () => {sourceListeners.delete(listener)}}},
    platform: {history, events, location: {get pathname() {return current().url.pathname}, get search() {return current().url.search}, get hash() {return current().url.hash}}},
    applyRoute(resolution, application) {applied.push({resolution, application})},
  })
  return {router, applied, history, entries, get url() {return current().url.pathname + current().url.search + current().url.hash}, get pushes() {return pushes}, get replaces() {return replaces},
    get subscriptions() {return sourceListeners.size}, update(next: ProductRouteContext) {context = next; for (const listener of sourceListeners) listener()},
    back() {if (index > 0) {index--; events.dispatchEvent(new Event("popstate"))}},
    forward() {if (index < entries.length - 1) {index++; events.dispatchEvent(new Event("popstate"))}},
    historyEvent() {events.dispatchEvent(new Event("popstate"))},
  }
}

test("positional opaque codec reserves service owners and rejects malformed paths", () => {
  const route = {kind: "atom", verseId: "verse-α", atomId: "agent:α"} as const
  expect(productRoutePath(route)).toBe("/verse-%CE%B1/agent%3A%CE%B1")
  expect(parseProductRoute(productRoutePath(route))).toEqual(route)
  expect(parseProductRoute("/networks")).toEqual({kind: "networks"})
  for (const path of ["/agents", "/agents/provider", "/oracle/rpc", "/release/metas/apply", "/assets/file", "/@internal/visual", "/clients/socket", "/unknown", "/a/b/c", "/a/", "/a/%2F", "/a/%5C", "/a/%00", "/a/%ZZ", "/a/..", "/networks/atom"]) {
    expect(isProductPath(path), path).toBeFalse()
  }
  expect(() => productRoutePath({kind: "atom", verseId: "agents", atomId: "1"})).toThrow()
})

test("Graph resolution uses exact AtomRef through topology and never causal cut or first Agent", () => {
  const context = ready()
  expect(resolveProductRoute({kind: "root"}, context)).toMatchObject({kind: "atom", ref: "atom:root-id", verseId: "verse-α"})
  expect(resolveProductRoute({kind: "atom", verseId: "verse-α", atomId: "agent:α"}, context)).toMatchObject({kind: "atom", ref: "atom:agent:α"})
  expect(resolveProductRoute({kind: "atom", verseId: "not-a-verse-id", atomId: "root-id"}, context)).toEqual({kind: "noSuchVerse", verseId: "not-a-verse-id"})
  expect(resolveProductRoute({kind: "atom", verseId: "verse-α", atomId: "missing"}, context)).toEqual({kind: "noSuchAtom", verseId: "verse-α", atomId: "missing"})
  context.graph!.runtime.roots = [atom("agent", parseMetaAddress("@metafor/agent")!)]
  expect(resolveProductRoute({kind: "root"}, context)).toEqual({kind: "noSuchAtom", verseId: "verse-α", atomId: null})
})

test("root waits for actual Graph then replaces its own entry exactly once", () => {
  const f = fixture("/", {status: "loading", verseId: null, graph: null})
  f.router.start()
  expect(f.router.getSnapshot()).toEqual({kind: "loading"})
  expect(f.url).toBe("/")
  expect(f.replaces).toBe(0)
  f.update(ready())
  expect(f.url).toBe("/verse-%CE%B1/root-id")
  expect(f.router.getSnapshot()).toMatchObject({kind: "atom", ref: "atom:root-id"})
  expect(f.replaces).toBe(1)
  expect(f.pushes).toBe(0)
  expect(f.history.state).toMatchObject({external: "preserved"})
  f.update(ready())
  expect(f.replaces).toBe(1)
  f.router.dispose()
})

test("deep links, back and forward keep one document and restore Atom presentation", () => {
  const f = fixture("/verse-%CE%B1/agent%3A%CE%B1?inspect=1#panel")
  const stop = f.router.start()
  expect(f.router.getSnapshot()).toMatchObject({kind: "atom", ref: "atom:agent:α"})
  f.router.setPresentation({view: "office", camera: [10, 20, 30], scale: 2})
  expect(f.url).toBe("/verse-%CE%B1/agent%3A%CE%B1?inspect=1#panel")
  expect(f.pushes).toBe(0)
  f.router.navigate({kind: "networks"})
  expect(f.url).toBe("/networks")
  expect(f.router.getSnapshot()).toEqual({kind: "networks"})
  f.back()
  expect(f.router.getSnapshot()).toMatchObject({kind: "atom", ref: "atom:agent:α"})
  expect(f.applied.at(-1)?.application).toEqual({cause: "history", presentation: {view: "office", camera: [10, 20, 30], scale: 2}})
  f.forward()
  expect(f.router.getSnapshot()).toEqual({kind: "networks"})
  expect(f.pushes).toBe(1)
  stop()
})

test("unavailable and unknown deep links remain explicit without retarget or URL rewrite", () => {
  const f = fixture("/verse-%CE%B1/missing")
  f.router.start()
  expect(f.router.getSnapshot()).toEqual({kind: "noSuchAtom", verseId: "verse-α", atomId: "missing"})
  f.update({status: "unavailable", verseId: "verse-α", graph: null, error: "offline"})
  expect(f.router.getSnapshot()).toEqual({kind: "unavailable", error: "offline"})
  expect(f.url).toBe("/verse-%CE%B1/missing")
  f.update(ready())
  expect(f.router.getSnapshot().kind).toBe("noSuchAtom")
  f.router.navigate({kind: "atom", verseId: "other-verse", atomId: "root-id"})
  expect(f.router.getSnapshot()).toEqual({kind: "noSuchVerse", verseId: "other-verse"})
  expect(f.url).toBe("/other-verse/root-id")
  f.router.navigate({kind: "networks"})
  f.update({status: "unavailable", verseId: null, graph: null})
  expect(f.router.getSnapshot()).toEqual({kind: "networks"})
  f.router.dispose()
})

test("initialization is idempotent and dispose removes source/history observers", () => {
  const f = fixture("/unrecognized")
  f.router.start(); f.router.start()
  expect(f.subscriptions).toBe(1)
  expect(f.applied).toHaveLength(1)
  expect(f.router.getSnapshot()).toEqual({kind: "invalidRoute", pathname: "/unrecognized"})
  f.router.dispose(); f.router.dispose()
  expect(f.subscriptions).toBe(0)
  f.update(ready()); f.historyEvent()
  expect(f.applied).toHaveLength(1)
  expect(() => f.router.start()).toThrow("disposed")
  expect(() => f.router.navigate({kind: "networks"})).toThrow("not started")
})
