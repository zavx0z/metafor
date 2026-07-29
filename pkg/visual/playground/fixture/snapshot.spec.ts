import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {buildBulkManifestation} from "../../../../bulk/manifestation.ts"
import {BulkProjectionStore} from "../../../../bulk/projection.ts"
import {DEFAULT_BULK_SETTINGS} from "../../../../bulk/settings.ts"
import {buildStateGraph} from "../../StateGraph.ts"
import {buildStateGraphRootLayout} from "../../StateGraphLayout.ts"
import {buildOutsideInVisualScene} from "../../OutsideIn.ts"
import snapshotJson from "./monad-snapshot.json"

describe("Visual playground Monad fixture", () => {
  test("hydrates the complete static tree and builds the production manifestation", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const projection = new BulkProjectionStore()
    projection.hydrate(structuredClone(snapshot.projection))
    const manifest = buildBulkManifestation(
      projection.view(),
      snapshot.rootSrc,
      DEFAULT_BULK_SETTINGS.layout,
    )

    expect(snapshot).toMatchObject({
      version: 1,
      rootSrc: "zavx0z/lada",
      projection: {
        runtime: {
          atoms: {length: 5},
          fields: {length: 54},
          states: {length: 23},
          transitions: {length: 32},
          processes: {length: 13},
        },
        declarations: {length: 174},
      },
    })
    expect(manifest.rootSrc).toBe(snapshot.rootSrc)
    expect(manifest.darkParticles.length).toBeGreaterThanOrEqual(5)
    expect(manifest.fieldParticles.length).toBe(54)
    expect(manifest.orbitalParticles?.length).toBeGreaterThan(23)
    expect(manifest.transitionChannels?.length).toBeGreaterThan(32)
  })

  test("produces four State graph cards containing five possible paths", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const projection = new BulkProjectionStore()
    projection.hydrate(structuredClone(snapshot.projection))
    const view = projection.view()
    const lada = view.atoms.find((atom) => atom.wimp === snapshot.rootSrc)
    expect(lada).toBeDefined()

    const graph = buildStateGraph(view, lada!.id)
    const pathsByRoot = new Map<number, number>()
    for (const sleeve of graph.sleeves) {
      pathsByRoot.set(
        sleeve.rootStateId,
        (pathsByRoot.get(sleeve.rootStateId) ?? 0) + 1,
      )
    }

    expect(graph.states).toHaveLength(4)
    expect(graph.sleeves).toHaveLength(5)
    expect([...pathsByRoot.values()].sort()).toEqual([1, 1, 1, 2])

    const firstCard = buildStateGraphRootLayout(graph, graph.states[0]!.id)
    expect(firstCard.levels).toHaveLength(3)
    expect(firstCard.levels[0]?.nodeIds).toHaveLength(1)
    expect(firstCard.levels[1]?.nodeIds).toHaveLength(2)
  })

  test("composes State sleeves for the root and every nested Atom", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const projection = new BulkProjectionStore()
    projection.hydrate(structuredClone(snapshot.projection))
    const view = projection.view()
    const manifest = buildBulkManifestation(
      view,
      snapshot.rootSrc,
      DEFAULT_BULK_SETTINGS.layout,
    )
    const owners = view.atoms.map((atom) => {
      const graph = buildStateGraph(view, atom.id)
      return {
        atomSrc: atom.wimp,
        layouts: graph.states.map((state) =>
          buildStateGraphRootLayout(graph, state.id)
        ),
      }
    })
    const scene = buildOutsideInVisualScene(manifest, owners)

    expect(owners).toHaveLength(5)
    expect(owners.map(({layouts}) => layouts.length)).toEqual([4, 7, 6, 3, 3])
    expect(scene.context.tori).toHaveLength(5)
    expect(scene.layout.nodes).toHaveLength(98)
    expect(scene.layout.edges).toHaveLength(130)
    expect(new Set(scene.layout.nodes.map((node) => node.stateId)).size).toBe(23)
  })
})
