import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import {buildBulkManifestation} from "../../../../bulk/manifestation.ts"
import {BulkProjectionStore} from "../../../../bulk/projection.ts"
import {buildStateGraph} from "../../StateGraph.ts"
import {buildStateGraphBranchLayout} from "../../StateGraphLayout.ts"
import {
  buildCenteredNestedVisualScene,
  layoutCenteredNestedFields,
} from "../../CenteredNested.ts"
import {buildOutsideInVisualScene} from "../../OutsideIn.ts"
import {visualOwnerDarkParticleIdFromAtomId} from "../../layout.ts"
import {visualDarkParticleColor} from "../../SemanticVisual.ts"
import {buildVisualSceneRenderPlan} from "../../VisualSceneViewport.ts"
import snapshotJson from "./monad-snapshot.json"

const visualOwners = (
  projection: BulkRuntimeProjection,
  manifest: BulkManifest,
) => projection.atoms.map((atom) => {
  const graph = buildStateGraph(projection, atom.id)
  const ownerDarkParticleId =
    visualOwnerDarkParticleIdFromAtomId(graph.atomId)
  if (!manifest.darkParticles.some((particle) =>
    particle.darkParticleId === ownerDarkParticleId
  )) {
    throw new Error(
      `Expected Dark particle ${ownerDarkParticleId} for Atom ${atom.id}`,
    )
  }
  return {graph, ownerDarkParticleId}
})

describe("Visual playground Monad fixture", () => {
  test("hydrates the complete static tree and builds the production manifestation", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const projection = new BulkProjectionStore()
    projection.hydrate(structuredClone(snapshot.projection))
    const manifest = buildBulkManifestation(projection.view(), snapshot.rootSrc)

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

    const firstCard = buildStateGraphBranchLayout(
      graph,
      graph.states[0]!.id,
    )
    expect(firstCard.levels.map((level) =>
      level.nodeIds.length
    )).toEqual([1, 2, 2, 1])
    expect(firstCard.nodes).toHaveLength(6)
    expect(firstCard.edges.filter((edge) => edge.returning))
      .toHaveLength(2)
  })

  test("composes State sleeves for the root and every nested Atom", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const projection = new BulkProjectionStore()
    projection.hydrate(structuredClone(snapshot.projection))
    const view = projection.view()
    const manifest = buildBulkManifestation(view, snapshot.rootSrc)
    const owners = visualOwners(view, manifest)
    const scene = buildOutsideInVisualScene({manifest, owners})
    const layoutNodes = scene.stateSleeves.flatMap((sleeve) =>
      sleeve.layout.nodes
    )
    const layoutEdges = scene.stateSleeves.flatMap((sleeve) =>
      sleeve.layout.edges
    )

    expect(owners).toHaveLength(5)
    expect(owners.map(({graph}) => graph.states.length))
      .toEqual([4, 7, 6, 3, 3])
    expect(owners[1]?.graph.atomLabel).toBe("lada-auth")
    expect(scene.tori).toHaveLength(5)
    expect(layoutNodes).toHaveLength(129)
    expect(layoutEdges).toHaveLength(165)
    expect(new Set(
      layoutNodes.map((node) => node.stateId),
    ).size)
      .toBe(23)
    expect([...new Set(scene.fields.map((field) => field.radius))])
      .toEqual([11, 5.5, 2.75])
    expect(new Set(scene.fields.map((field) => field.z)))
      .toEqual(new Set([0]))
    expect([...new Set(
      layoutNodes.map((node) => node.fieldRadius),
    )])
      .toEqual([5.5, 2.75, 1.375])

    const authOwnerId = owners[1]!.ownerDarkParticleId
    const authSleeves = scene.stateSleeves.filter((sleeve) =>
      sleeve.ownerDarkParticleId === authOwnerId
    )
    const authTorus = scene.tori.find((torus) =>
      torus.darkParticleId === authOwnerId
    )!
    const authInnerRadius = authTorus.radius - authTorus.tube
    const authStateInnerEdge = Math.min(
      ...authSleeves.flatMap((sleeve) =>
        sleeve.layout.nodes.map((node) =>
          Math.hypot(node.x - authTorus.x, node.y - authTorus.y) - node.radius
        )
      ),
    )
    let minimumCrossSleeveGap = Number.POSITIVE_INFINITY
    let minimumStateNeighbourGap = Number.POSITIVE_INFINITY
    for (let left = 0; left < authSleeves.length; left += 1) {
      const nodesById = new Map(
        authSleeves[left]!.layout.nodes.map((node) =>
          [node.id, node] as const
        ),
      )
      for (const edge of authSleeves[left]!.layout.edges) {
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
        for (const leftNode of authSleeves[left]!.layout.nodes) {
          for (const rightNode of authSleeves[right]!.layout.nodes) {
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
    expect(authStateInnerEdge - authInnerRadius)
      .toBeGreaterThanOrEqual(4.125 - 1e-9)
    expect(minimumStateNeighbourGap).toBeGreaterThan(0)
    expect(minimumCrossSleeveGap).toBeGreaterThanOrEqual(11 - 1e-9)
  })

  test("composes the saved Monad as concentric Value-derived Field bands", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const projection = new BulkProjectionStore()
    projection.hydrate(structuredClone(snapshot.projection))
    const view = projection.view()
    const manifest = buildBulkManifestation(view, snapshot.rootSrc)
    const owners = visualOwners(view, manifest)
    const fields = layoutCenteredNestedFields(manifest, owners)
    const scene = buildCenteredNestedVisualScene({manifest, owners})
    const renderPlan = buildVisualSceneRenderPlan(scene)

    expect(scene.tori).toHaveLength(5)
    expect(new Set(scene.tori.map(({x, y, z}) =>
      `${x}:${y}:${z}`
    ))).toEqual(new Set(["0:0:0"]))
    expect(scene.fields).toHaveLength(28)
    expect(scene.stateSleeves.flatMap((sleeve) =>
      sleeve.layout.nodes
    )).toHaveLength(129)
    expect(scene.stateSleeves.flatMap((sleeve) => sleeve.edges))
      .toHaveLength(165)
    expect(scene.fieldProxies).toHaveLength(315)
    expect(scene.tori.every((torus) =>
      torus.material.glowIntensity === 1.2 &&
      torus.material.opacity === 0.3
    )).toBe(true)
    expect(scene.fields.every((field) =>
      field.material.glowIntensity === 2.8 &&
      field.material.opacity === 0.72
    )).toBe(true)
    expect(new Set(
      scene.orbitals
        .filter((orbital) => orbital.form.kind === "torus")
        .map((orbital) =>
          `${orbital.material.glowIntensity}:${orbital.material.opacity}`
        ),
    )).toEqual(new Set(["4.6:0.82", "3:0.64"]))
    expect(new Set(
      scene.fieldProxies
        .filter((proxy) => proxy.form.kind === "sphere")
        .map((proxy) =>
          `${proxy.material.glowIntensity}:${proxy.material.opacity}`
        ),
    )).toEqual(new Set(["5.2:0.78", "3.4:0.66"]))
    expect(scene.stateSleeves.every((sleeve) =>
      sleeve.edges.every((edge) =>
        edge.transitionChannelId !== null &&
        edge.path.length === 65 &&
        edge.material.glowIntensity === 1.65
      )
    )).toBe(true)
    expect(scene.relationEdges.every((edge) => edge.path.length === 65))
      .toBe(true)
    expect(renderPlan.meshes).toHaveLength(490)
    expect(Object.isFrozen(renderPlan.meshes[0]!.form)).toBe(true)
    expect(renderPlan.meshes.filter((mesh) => mesh.role === "dark"))
      .toHaveLength(scene.tori.length)
    expect(renderPlan.meshes.filter((mesh) => mesh.role === "field"))
      .toHaveLength(scene.fields.length)
    expect(renderPlan.meshes.filter((mesh) => mesh.role === "orbital"))
      .toHaveLength(scene.orbitals.length)
    expect(renderPlan.meshes.filter((mesh) => mesh.role === "field-proxy"))
      .toHaveLength(scene.fieldProxies.length)
    expect(renderPlan.meshes.find((mesh) =>
      mesh.id === `dark:${scene.tori[0]!.darkParticleId}`
    )).toMatchObject({
      material: scene.tori[0]!.material,
      meshDetail: {
        kind: "torus",
        radialSegments: 64,
        tubularSegments: 192,
      },
    })
    expect(renderPlan.meshes.find((mesh) =>
      mesh.id === `orbital:${scene.orbitals[0]!.orbitalParticleId}`
    )).toMatchObject({
      material: scene.orbitals[0]!.material,
      meshDetail: scene.orbitals[0]!.form.kind === "torus"
        ? {
            kind: "torus",
            radialSegments: 32,
            tubularSegments: 192,
          }
        : {
            heightSegments: 24,
            kind: "sphere",
            widthSegments: 32,
          },
    })
    expect(renderPlan.lineBatches.filter((batch) =>
      batch.kind === "transition"
    )).toHaveLength(scene.stateEdgeBatches.length)
    expect(renderPlan.lineBatches.filter((batch) =>
      batch.kind === "relation"
    )).toHaveLength(scene.relationEdgeBatches.length)
    expect(renderPlan.lineBatches).toHaveLength(31)
    expect(renderPlan.lineBatches.flatMap((batch) => batch.paths))
      .toHaveLength(676)
    expect(renderPlan.lineBatches.every((batch) =>
      batch.paths.every((path) => path.points.length === 65)
    )).toBe(true)
    expect(renderPlan.lineBatches[0]!.material)
      .toBe(scene.stateEdgeBatches[0]!.material)
    expect(renderPlan.lineBatches[0]!.paths[0]!.points)
      .toBe(scene.stateEdgeBatches[0]!.edges[0]!.path)
    expect(scene.components.roots).toHaveLength(1)
    expect(
      Math.max(
        ...Map.groupBy(
          scene.stateEdgeBatches,
          (batch) => batch.ownerDarkParticleId,
        ).values().map((batches) => batches.length),
      ),
    ).toBeLessThanOrEqual(2)
    expect(fields.filter((field) => field.bandKind === "root-private"))
      .toHaveLength(1)
    const sharedFields = fields.filter((field) =>
      field.bandKind === "shared"
    )
    expect(sharedFields).toHaveLength(20)
    const privateFields = fields.filter((field) =>
      field.bandKind === "inner-private"
    )
    expect(privateFields).toHaveLength(7)
    const rootParticle = manifest.darkParticles.find((particle) =>
      particle.parentDarkParticleId === null
    )!
    expect(sharedFields.every((field) =>
      field.ownerDarkParticleId === rootParticle.darkParticleId &&
      field.radius === 11 &&
      field.fieldParticleIds.length > 1
    )).toBe(true)
    const particleBySrc = (src: string) =>
      manifest.darkParticles.find((particle) => particle.src === src)!
    expect(scene.tori.map((torus) => torus.color)).toEqual(
      [
        "zavx0z/lada",
        "zavx0z/lada-chat",
        "zavx0z/lada-chat-send",
        "zavx0z/lada-auth",
        "zavx0z/lada-model",
      ].map((src) => {
        const particle = particleBySrc(src)
        return visualDarkParticleColor(particle)
      }),
    )
    const orbitalFields = fields.filter((field) =>
      field.bandKind !== "root-private"
    )
    const fieldOrbits = [...Map.groupBy(
      orbitalFields,
      (field) => field.orbitIndex,
    )]
      .sort(([left], [right]) => left - right)
    expect(fieldOrbits.map(([orbitIndex, orbitFields]) => ({
      count: orbitFields.length,
      deepestOwnerDepths: [...new Set(orbitFields.map((field) =>
        field.deepestOwnerDepth
      ))],
      kinds: [...new Set(orbitFields.map((field) =>
        field.bandKind
      ))],
      orbitIndex,
    }))).toEqual([
      {
        count: 5,
        deepestOwnerDepths: [2],
        kinds: ["shared"],
        orbitIndex: 0,
      },
      {
        count: 15,
        deepestOwnerDepths: [1],
        kinds: ["shared"],
        orbitIndex: 1,
      },
      {
        count: 3,
        deepestOwnerDepths: [1],
        kinds: ["inner-private"],
        orbitIndex: 2,
      },
      {
        count: 2,
        deepestOwnerDepths: [1],
        kinds: ["inner-private"],
        orbitIndex: 3,
      },
      {
        count: 2,
        deepestOwnerDepths: [1],
        kinds: ["inner-private"],
        orbitIndex: 4,
      },
    ])
    const fieldOrbitRadii = fieldOrbits.map(([, orbitFields]) =>
      Math.hypot(
        orbitFields[0]!.x,
        orbitFields[0]!.y,
        orbitFields[0]!.z,
      )
    )
    expect(fieldOrbitRadii[0]).toBeCloseTo(44)
    expect(fieldOrbitRadii[1]).toBeCloseTo(66)
    const rootPrivateOuterExtent = Math.max(...fields
      .filter((field) => field.bandKind === "root-private")
      .map((field) =>
        Math.hypot(field.x, field.y, field.z) + field.radius
      ))
    expect(fieldOrbitRadii[0]! - 11 - rootPrivateOuterExtent)
      .toBeCloseTo(22)
    expect(fieldOrbitRadii[1]! - 11 - (fieldOrbitRadii[0]! + 11))
      .toBeCloseTo(0)
    const deepestOuterExtent = Math.max(...sharedFields
      .filter((field) => field.deepestOwnerDepth === 2)
      .map((field) =>
        Math.hypot(field.x, field.y, field.z) + field.radius
      ))
    const shallowerInnerExtent = Math.min(...sharedFields
      .filter((field) => field.deepestOwnerDepth === 1)
      .map((field) =>
        Math.hypot(field.x, field.y, field.z) - field.radius
      ))
    expect(deepestOuterExtent).toBeLessThanOrEqual(
      shallowerInnerExtent + 1e-9,
    )
    const affinityRuns: number[] = []
    for (
      const field of sharedFields.filter((candidate) =>
        candidate.deepestOwnerDepth === 1
      )
    ) {
      if (
        affinityRuns.at(-1) !== field.affinityOwnerDarkParticleId
      ) affinityRuns.push(field.affinityOwnerDarkParticleId)
    }
    expect(affinityRuns).toEqual([
      particleBySrc("zavx0z/lada-auth").darkParticleId,
      particleBySrc("zavx0z/lada-chat").darkParticleId,
      particleBySrc("zavx0z/lada-model").darkParticleId,
    ])
    expect(privateFields.flatMap((field) => field.fieldKeys)).toEqual([
      "historyCount",
      "eventReady",
      "retryReady",
      "sessionChecked",
      "codeRequested",
      "model",
      "lastMessageId",
    ])
    const torusIndexByPrivateOwner = new Map([
      [particleBySrc("zavx0z/lada-chat").darkParticleId, 1],
      [particleBySrc("zavx0z/lada-auth").darkParticleId, 3],
      [particleBySrc("zavx0z/lada-model").darkParticleId, 4],
    ])
    for (
      const [ownerId, ownerFields] of Map.groupBy(
        privateFields,
        (field) => field.ownerDarkParticleId,
      )
    ) {
      const torusIndex = torusIndexByPrivateOwner.get(ownerId)!
      const privateOuterExtent = Math.max(...ownerFields.map((field) =>
        Math.hypot(field.x, field.y, field.z) + field.radius
      ))
      const ownerTorus = scene.tori[torusIndex]!
      expect(
        ownerTorus.radius - ownerTorus.tube - privateOuterExtent,
      ).toBeCloseTo(4.125)
    }

    const rootOwnerId = owners[0]!.ownerDarkParticleId
    const rootNodes = scene.stateSleeves
      .filter((sleeve) => sleeve.ownerDarkParticleId === rootOwnerId)
      .flatMap((sleeve) => sleeve.layout.nodes)
    const rootStateInnerExtent = Math.min(
      ...rootNodes.map((node) =>
        Math.hypot(node.x, node.y, node.z) - node.radius
      ),
    )
    const rootStateOuterExtent = Math.max(
      ...rootNodes.map((node) =>
        Math.hypot(node.x, node.y, node.z) + node.radius
      ),
    )
    const maximumNestedTorusOuterRadius = Math.max(
      ...scene.tori.slice(1).map((torus) =>
        torus.radius + torus.tube
      ),
    )
    const rootTorus = scene.tori[0]!
    const rootTorusOuterRadius = rootTorus.radius + rootTorus.tube
    expect(rootStateInnerExtent - maximumNestedTorusOuterRadius)
      .toBeCloseTo(8.25)
    expect(rootTorusOuterRadius - rootStateOuterExtent)
      .toBeCloseTo(8.25)

  })
})
