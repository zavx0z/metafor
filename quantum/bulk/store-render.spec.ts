import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {Particle} from "shared/protocol/force/particle"
import snapshotJson from "./fixture/oracle-snapshot.json"
import {buildBulkStore} from "./store.ts"
import {BulkStoreViewportRenderer} from "./store-render.ts"
import {activateBulkStore, applyBulkGluonReplace} from "./store-runtime.ts"
import {BulkVisualSceneLifecycle} from "./visual.ts"
import {prepareBulkInitialVisual} from "./visual-initial.ts"
import type {BulkVisualViewportWithHud} from "./web"

const fixture = () => {
  const lifecycle = new BulkVisualSceneLifecycle()
  lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
  const state = lifecycle.state()
  const visual = prepareBulkInitialVisual(state.manifest, state.projection).payload
  return {
    manifest: state.manifest,
    store: activateBulkStore(buildBulkStore(state.manifest, visual)),
  }
}

describe("Bulk Store exact renderer adapter", () => {
  test("a local Field regroup never presents or replaces the full scene", () => {
    const {manifest, store} = fixture()
    const shared = [...Map.groupBy(
      manifest.fieldParticles.filter((entry) => entry.valueId !== null),
      (entry) => entry.valueId!,
    ).values()].find((entries) => entries.length > 1)
    if (!shared || shared.length < 2) throw new Error("fixture has no shared Value")
    const target = shared[0]!
    const nextValue = Math.max(...manifest.fieldParticles.map((entry) => entry.valueId ?? 0)) + 1_000
    const calls = {
      present: 0,
      regroup: 0,
      dark: 0,
      orbital: 0,
      proxy: 0,
      transition: 0,
      relation: 0,
    }
    const viewport = {
      applyBulkStoreInitialScene() { calls.present += 1 },
      applyBulkStoreFieldRegroup(change: {fields: readonly unknown[]}) {
        calls.regroup += 1
        expect(change.fields.length).toBeGreaterThan(0)
      },
      applyBulkStoreDarkGeometry() { calls.dark += 1 },
      applyBulkStoreOrbitalGeometry() { calls.orbital += 1 },
      applyBulkStoreProxyGeometry() { calls.proxy += 1 },
      applyBulkStoreOrbitalMaterial() {},
      applyBulkStoreProxyMaterial() {},
      rebuildBulkStoreTransitionBatch() { calls.transition += 1 },
      rebuildBulkStoreRelationBatch() { calls.relation += 1 },
      handleForce() {},
    } as unknown as BulkVisualViewportWithHud
    const renderer = new BulkStoreViewportRenderer(store, viewport)
    renderer.present()
    const part: Particle = {
      part: "gluon",
      op: "replace",
      path: target.parentDarkParticleId / 2,
      ts: 1,
      value: {fields: {[String(target.fieldId)]: {valueId: nextValue, value: nextValue}}},
    }

    applyBulkGluonReplace(store, renderer, part)

    expect(calls.present).toBe(1)
    expect(calls.regroup).toBe(1)
    expect(calls.dark).toBeGreaterThan(0)
    expect(calls.orbital).toBeGreaterThan(0)
    expect(calls.proxy).toBeGreaterThan(0)
    expect(calls.transition).toBeGreaterThan(0)
    expect(calls.relation).toBeGreaterThan(0)
  })
})
