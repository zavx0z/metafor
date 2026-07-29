import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {buildBulkManifestation} from "../../../../bulk/manifestation.ts"
import {BulkProjectionStore} from "../../../../bulk/projection.ts"
import {DEFAULT_BULK_SETTINGS} from "../../../../bulk/settings.ts"
import {buildStateGraph} from "../../StateGraph.ts"
import {buildStateGraphRootLayout} from "../../StateGraphLayout.ts"
import {
  buildCenteredNestedVisualScene,
  layoutCenteredNestedFields,
} from "../../CenteredNested.ts"
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

    const sharedValues = Map.groupBy(
      manifest.fieldParticles.filter((field) => field.valueId !== null),
      (field) => field.valueId,
    )
    expect(
      [...sharedValues.values()].filter((fields) =>
        new Set(fields.map((field) => field.parentDarkParticleId)).size > 1
      ),
    ).toHaveLength(20)
    expect(
      [...sharedValues.values()].some((fields) =>
        fields.some((field) => field.fieldKey === "authError") &&
        fields.some((field) => field.fieldKey === "error")
      ),
    ).toBe(true)
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
    expect(owners[1]?.atomSrc).toBe("zavx0z/lada-auth")
    expect(scene.context.tori).toHaveLength(5)
    expect(scene.layout.nodes).toHaveLength(98)
    expect(scene.layout.edges).toHaveLength(130)
    expect(new Set(scene.layout.nodes.map((node) => node.stateId)).size)
      .toBe(23)
    expect([...new Set(scene.context.fields.map((field) => field.radius))])
      .toEqual([11, 5.5, 2.75])
    expect(new Set(scene.context.fields.map((field) => field.z)))
      .toEqual(new Set([0]))
    expect([...new Set(scene.layout.nodes.map((node) => node.fieldRadius))])
      .toEqual([5.5, 2.75, 1.375])

    const rootNodeCount = owners[0]!.layouts.reduce(
      (count, layout) => count + layout.nodes.length,
      0,
    )
    let authNodeCursor = rootNodeCount
    const authSleeves = owners[1]!.layouts.map((layout) => {
      const nodes = scene.layout.nodes.slice(
        authNodeCursor,
        authNodeCursor + layout.nodes.length,
      )
      authNodeCursor += layout.nodes.length
      return nodes
    })
    const authTorus = scene.context.tori[1]!
    const authInnerRadius = authTorus.radius - authTorus.tube
    const authStateInnerEdge = Math.min(
      ...authSleeves.flatMap((nodes) =>
        nodes.map((node) =>
          Math.hypot(node.x - authTorus.x, node.y - authTorus.y) - node.radius
        )
      ),
    )
    let minimumCrossSleeveGap = Number.POSITIVE_INFINITY
    let minimumStateNeighbourGap = Number.POSITIVE_INFINITY
    for (let left = 0; left < authSleeves.length; left += 1) {
      const nodesById = new Map(
        authSleeves[left]!.map((node) => [node.id, node] as const),
      )
      for (const edge of owners[1]!.layouts[left]!.edges) {
        const from = nodesById.get(edge.fromNodeId)
        const to = nodesById.get(edge.toNodeId)
        if (!from || !to) continue
        minimumStateNeighbourGap = Math.min(
          minimumStateNeighbourGap,
          Math.hypot(
            from.x - to.x,
            from.y - to.y,
            from.z - to.z,
          ) - from.radius - to.radius,
        )
      }
      for (let right = left + 1; right < authSleeves.length; right += 1) {
        for (const leftNode of authSleeves[left]!) {
          for (const rightNode of authSleeves[right]!) {
            minimumCrossSleeveGap = Math.min(
              minimumCrossSleeveGap,
              Math.hypot(
                leftNode.x - rightNode.x,
                leftNode.y - rightNode.y,
                leftNode.z - rightNode.z,
              ) - leftNode.radius - rightNode.radius,
            )
          }
        }
      }
    }
    expect(
      manifest.darkParticles.filter((particle) =>
        particle.parentDarkParticleId ===
          manifest.darkParticles.find((candidate) =>
            candidate.src === "zavx0z/lada-auth"
          )?.darkParticleId
      ),
    ).toHaveLength(0)
    expect(authStateInnerEdge - authInnerRadius).toBeLessThan(20)
    expect(minimumStateNeighbourGap).toBeGreaterThanOrEqual(11 - 1e-9)
    expect(minimumCrossSleeveGap).toBeGreaterThanOrEqual(11 - 1e-9)
  })

  test("composes the saved Monad as concentric Value-derived Field bands", () => {
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
    const fields = layoutCenteredNestedFields(manifest)
    const scene = buildCenteredNestedVisualScene(manifest, owners)

    expect(scene.context.tori).toHaveLength(5)
    expect(new Set(scene.context.tori.map(({x, y, z}) =>
      `${x}:${y}:${z}`
    ))).toEqual(new Set(["0:0:0"]))
    expect(scene.context.fields).toHaveLength(54)
    expect(scene.layout.nodes).toHaveLength(98)
    expect(fields.filter((field) => field.bandKind === "root-private"))
      .toHaveLength(1)
    expect(fields.filter((field) => field.bandKind === "shared"))
      .toHaveLength(46)
    expect(fields.filter((field) => field.bandKind === "inner-private"))
      .toHaveLength(7)

    const sharedOuter = Math.max(...fields
      .filter((field) => field.band === 1)
      .map((field) => Math.hypot(field.x, field.y) + field.radius))
    const innerPrivate = Math.min(...fields
      .filter((field) => field.band === 2)
      .map((field) => Math.hypot(field.x, field.y) - field.radius))
    expect(innerPrivate - sharedOuter).toBeCloseTo(11)
  })
})
