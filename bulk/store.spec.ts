import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {
  BULK_STORE_RELATION_CONTROL_STRIDE,
  BULK_STORE_TRANSITION_CONTROL_STRIDE,
} from "@metafor/types/bulk/store"
import snapshotJson from "./fixture/oracle-snapshot.json"
import {BulkVisualSceneLifecycle} from "./visual.ts"
import {prepareBulkInitialVisual} from "./visual-initial.ts"
import {
  BULK_STORE_RELATION_KIND,
  isBulkStore,
} from "./store.ts"
import {buildDirectBulkStore} from "./store-direct.ts"

const fixture = () => {
  const lifecycle = new BulkVisualSceneLifecycle()
  lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
  const state = lifecycle.state()
  const visual = prepareBulkInitialVisual(state.manifest, state.projection).payload
  const root = state.projection.atoms.find((atom) =>
    atom.parentAtom === null && atom.parentTopology === null)
  if (!root) throw new Error("Bulk Store fixture has no root Atom")
  return {state, visual, store: buildDirectBulkStore(state.projection, root.id)}
}

describe("Bulk Store initial foundation", () => {
  test("is one flat numeric Store with visible text and canonical WIMP keys", () => {
    const {store} = fixture()
    expect(isBulkStore(store)).toBe(true)
    expect(Object.keys(store).sort()).toEqual([
      "batch",
      "conditionSource",
      "dark",
      "field",
      "fieldAlias",
      "fieldSource",
      "layout",
      "orbital",
      "orbitalRelatedState",
      "processField",
      "processSource",
      "proxy",
      "reactionField",
      "reactionSource",
      "reactionState",
      "relation",
      "root",
      "stateSource",
      "text",
      "transition",
      "transitionSource",
      "wimp",
    ])
    const serialized = JSON.stringify(store)
    for (const forbidden of [
      '"graph"',
      '"manifest"',
      '"path"',
      '"paths"',
      '"readyScene"',
      '"throughTs"',
      '"version"',
      '"points"',
      '"view_css"',
      '"viewCss"',
    ]) expect(serialized).not.toContain(forbidden)
  })

  test("preserves every visible Lada row with numeric cross-references", () => {
    const {store, visual} = fixture()
    expect(store.dark.id).toHaveLength(visual.tori.length)
    expect(store.field.id).toHaveLength(visual.fields.length)
    expect(store.fieldAlias.atom).toHaveLength(visual.fieldAliases.length)
    expect(store.orbital.id).toHaveLength(visual.orbitals.length)
    expect(store.proxy.id).toHaveLength(visual.fieldProxies.length)
    expect(store.transition.id).toHaveLength(
      visual.transitionBatches.reduce((sum, batch) => sum + batch.paths.length, 0),
    )
    expect(store.transition.control).toHaveLength(
      store.transition.id.length * BULK_STORE_TRANSITION_CONTROL_STRIDE,
    )
    const renderedRelations = store.relation.controlStart.filter((start) => start >= 0)
    expect(store.relation.control).toHaveLength(
      renderedRelations.length * BULK_STORE_RELATION_CONTROL_STRIDE,
    )
  })

  test("stores entanglement as one canonical symmetric pair", () => {
    const {store} = fixture()
    let count = 0
    for (let slot = 0; slot < store.relation.id.length; slot++) {
      if (store.relation.kind[slot] !== BULK_STORE_RELATION_KIND["field-entanglement"]) continue
      count += 1
      const left = [store.relation.aKind[slot], store.relation.a[slot]]
      const right = [store.relation.bKind[slot], store.relation.b[slot]]
      expect(left[0]! < right[0]! || (left[0] === right[0] && left[1]! <= right[1]!)).toBe(true)
      expect(store.relation.batch[slot]).toBe(0)
      expect(store.relation.controlStart[slot]).toBe(-1)
    }
    expect(count).toBeGreaterThan(0)
  })

  test("is materially smaller than the previous ready-scene JSON", () => {
    const {state, visual, store} = fixture()
    const previous = JSON.stringify({
      kind: "bulk-ready-scene",
      version: 1,
      throughTs: state.throughTs,
      rootSrc: state.rootSrc,
      visual: {kind: "visual-prepared-scene", version: 1, layoutSlug: visual.layoutSlug, payload: visual},
      session: "baseline",
    })
    const current = JSON.stringify({session: "baseline", store})
    expect(Buffer.byteLength(current)).toBeLessThan(Buffer.byteLength(previous))
  })

  test("rejects extra envelopes and malformed column strides", () => {
    const {store} = fixture()
    expect(isBulkStore({...store, graph: {}})).toBe(false)
    expect(isBulkStore({...store, version: 1})).toBe(false)
    expect(isBulkStore({
      ...store,
      transition: {...store.transition, control: store.transition.control.slice(1)},
    })).toBe(false)
  })
})
