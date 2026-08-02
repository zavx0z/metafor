import {describe, expect, test} from "bun:test"
import {
  compileVisualComponents,
  createVisualComponentComposer,
} from "../src/VisualComponents.ts"
import {
  visualContextTorusMaterial,
  visualConditionFieldMaterial,
  visualCoreFieldMaterial,
  visualCausalMaterial,
  visualProcessTorusMaterial,
  visualRelationMaterial,
  visualStateTorusMaterial,
  visualTransitionMaterial,
} from "../src/VisualMaterialSpec.ts"
import {defineVisualScene} from "../src/internal/layout.ts"

const pointPath = (y: number) => Object.freeze(
  Array.from({length: 65}, (_, index) =>
    Object.freeze({x: index, y, z: 0})
  ),
)

const curvePath = (y: number) => Object.freeze({
  from: Object.freeze({x: 0, y, z: 0}),
  fromTangent: Object.freeze({x: 64, y: 0, z: 0}),
  to: Object.freeze({x: 64, y, z: 0}),
  toTangent: Object.freeze({x: 64, y: 0, z: 0}),
})

describe("production Visual component model", () => {
  test("recursively owns content and compiles immutable batches once", () => {
    const darkColor = [0.2, 0.3, 0.8] as const
    const fieldColor = [0.1, 0.8, 0.5] as const
    const input = {
      fieldProxies: [{
        color: fieldColor,
        fieldProxyId: "proxy:state:1:field:1",
        form: {kind: "sphere", radius: 0.5},
        material: visualConditionFieldMaterial(fieldColor, true),
        ownerDarkParticleId: 4,
        paintOrbitalParticleId: null,
        stateOrbitalParticleId: "orbital:state:1",
        x: 2,
        y: 0,
        z: 0,
      }],
      fields: [
        {
          color: fieldColor,
          fieldIds: [1],
          fieldKeys: ["root"],
          fieldParticleIds: ["field:root"],
          fieldParticleKind: "string",
          material: visualCoreFieldMaterial(fieldColor),
          ownerDarkParticleId: 2,
          radius: 2,
          sourceOwnerDarkParticleIds: [2],
          valueId: 1,
          valueText: "root",
          x: 0,
          y: 0,
          z: 0,
        },
        {
          color: fieldColor,
          fieldIds: [2],
          fieldKeys: ["nested"],
          fieldParticleIds: ["field:nested"],
          fieldParticleKind: "string",
          material: visualCoreFieldMaterial(fieldColor),
          ownerDarkParticleId: 4,
          radius: 1,
          sourceOwnerDarkParticleIds: [4],
          valueId: 2,
          valueText: "nested",
          x: 3,
          y: 0,
          z: 0,
        },
        {
          color: fieldColor,
          fieldIds: [3],
          fieldKeys: ["root-last"],
          fieldParticleIds: ["field:root-last"],
          fieldParticleKind: "string",
          material: visualCoreFieldMaterial(fieldColor),
          ownerDarkParticleId: 2,
          radius: 2,
          sourceOwnerDarkParticleIds: [2],
          valueId: 3,
          valueText: "root-last",
          x: 1,
          y: 0,
          z: 0,
        },
      ],
      layoutSlug: "centered-nested",
      orbitals: [
        {
          anchorStateOrbitalParticleId: null,
          color: fieldColor,
          form: {kind: "torus", radius: 2, tube: 0.5},
          material: visualStateTorusMaterial(fieldColor, true),
          orbitalParticleId: "orbital:state:1",
          ownerDarkParticleId: 4,
          x: 2,
          y: 0,
          z: 0,
        },
        {
          anchorStateOrbitalParticleId: "orbital:state:1",
          color: fieldColor,
          form: {kind: "torus", radius: 0.3, tube: 0.1},
          material: visualProcessTorusMaterial(fieldColor, true, true),
          orbitalParticleId: "orbital:process:1",
          ownerDarkParticleId: 4,
          x: 3,
          y: 0,
          z: 0,
        },
      ],
      relationEdges: [{
        curves: [curvePath(3), curvePath(3.5)],
        material: visualRelationMaterial(fieldColor, true),
        ownerDarkParticleId: 2,
        path: pointPath(3),
        relationChannelId: "relation:1",
      }],
      stateSleeves: [{
        edges: [
          {
            curve: curvePath(1),
            edgeId: "edge:forward",
            fromNodeId: "state:1",
            material: visualTransitionMaterial(false),
            path: pointPath(1),
            returning: false,
            toNodeId: "state:2",
            transitionChannelId: "transition:1",
            transitionId: 1,
          },
          {
            curve: curvePath(2),
            edgeId: "edge:return",
            fromNodeId: "state:2",
            material: visualTransitionMaterial(true),
            path: pointPath(2),
            returning: true,
            toNodeId: "state:1",
            transitionChannelId: "transition:2",
            transitionId: 2,
          },
        ],
        layout: {
          edges: [],
          levels: [],
          nodes: [{
            color: fieldColor,
            current: true,
            end: "terminal",
            fieldRadius: 0.5,
            fields: [],
            id: "state:1",
            innerRadius: 1,
            label: "State 1",
            radius: 2.5,
            stateId: 1,
            step: 0,
            x: 2,
            y: 0,
            z: 0,
          }],
          rootStateId: 1,
        },
        occurrences: [{
          nodeId: "state:1",
          orbitalParticleId: "orbital:state:1",
        }],
        ownerAtomId: 2,
        ownerDarkParticleId: 4,
        ownerSrc: "owner/nested",
        rootStateId: 1,
      }],
      tori: [
        {
          color: darkColor,
          darkParticleId: 2,
          darkParticleKind: "atom",
          depth: 0,
          material: visualContextTorusMaterial(darkColor),
          parentDarkParticleId: null,
          radius: 10,
          src: "owner/root",
          tube: 2,
          x: 0,
          y: 0,
          z: 0,
        },
        {
          color: darkColor,
          darkParticleId: 4,
          darkParticleKind: "fuzzy",
          depth: 1,
          material: visualContextTorusMaterial(darkColor),
          parentDarkParticleId: 2,
          radius: 6,
          src: "owner/nested",
          tube: 1,
          x: 0,
          y: 0,
          z: 0,
        },
      ],
    } as const
    const composer = createVisualComponentComposer()
    input.tori.forEach(composer.addTorus)
    input.fields.forEach(composer.addField)
    input.stateSleeves.forEach(composer.addStateSleeve)
    input.orbitals.forEach(composer.addOrbital)
    input.fieldProxies.forEach(composer.addFieldProxy)
    input.relationEdges.forEach(composer.addRelation)
    const scene = defineVisualScene({
      components: composer.finish(),
      layoutSlug: input.layoutSlug,
    })

    const first = compileVisualComponents(scene.components)
    const second = compileVisualComponents(scene.components)

    expect(second).toBe(first)
    expect(scene.tori).toBe(first.tori)
    expect(scene.components.roots).toHaveLength(1)
    expect(scene.components.roots[0]!.children).toHaveLength(1)
    expect(scene.components.roots[0]!.core[0]!.value.fieldParticleIds)
      .toEqual(["field:root"])
    expect(scene.components.roots[0]!.children[0]!.core[0]!.value
      .fieldParticleIds).toEqual(["field:nested"])
    const sleeve =
      scene.components.roots[0]!.children[0]!.sleeves[0]!
    expect(sleeve.occurrences[0]!.state!.value.orbitalParticleId)
      .toBe("orbital:state:1")
    expect(sleeve.occurrences[0]!.orbitals[0]!.value.orbitalParticleId)
      .toBe("orbital:process:1")
    expect(sleeve.occurrences[0]!.fieldProxies[0]!.value.fieldProxyId)
      .toBe("proxy:state:1:field:1")
    expect(first.orbitals).toHaveLength(2)
    expect(first.fieldProxies).toHaveLength(1)
    expect(first.fields.map((field) => field.fieldParticleIds[0]))
      .toEqual(["field:root", "field:nested", "field:root-last"])
    expect(first.stateEdgeBatches).toHaveLength(2)
    expect(first.stateEdgeBatches.map((batch) => batch.returning))
      .toEqual([false, true])
    expect(first.relationEdgeBatches).toHaveLength(1)
    expect(Object.isFrozen(scene.components)).toBe(true)
    expect(Object.isFrozen(first.stateEdgeBatches[0]!.edges)).toBe(true)
  })

  test("rejects every occurrence form outside its State sleeve owner", () => {
    const darkColor = [0.2, 0.3, 0.8] as const
    const stateColor = [0.1, 0.8, 0.5] as const
    const createComposer = () => {
      const composer = createVisualComponentComposer()
      composer.addTorus({
        color: darkColor,
        darkParticleId: 2,
        darkParticleKind: "atom",
        depth: 0,
        material: visualContextTorusMaterial(darkColor),
        parentDarkParticleId: null,
        radius: 10,
        src: "owner/root",
        tube: 2,
        x: 0,
        y: 0,
        z: 0,
      })
      composer.addTorus({
        color: darkColor,
        darkParticleId: 4,
        darkParticleKind: "atom",
        depth: 1,
        material: visualContextTorusMaterial(darkColor),
        parentDarkParticleId: 2,
        radius: 6,
        src: "owner/nested",
        tube: 1,
        x: 0,
        y: 0,
        z: 0,
      })
      composer.addStateSleeve({
        edges: [],
        layout: {
          edges: [],
          levels: [],
          nodes: [],
          rootStateId: 1,
        },
        occurrences: [{
          nodeId: "state:1",
          orbitalParticleId: "orbital:state:1",
        }],
        ownerAtomId: 2,
        ownerDarkParticleId: 4,
        ownerSrc: "owner/nested",
        rootStateId: 1,
      })
      return composer
    }

    const cases = [
      [
        "State form orbital:state:1",
        (composer: ReturnType<typeof createComposer>) =>
          composer.addOrbital({
            anchorStateOrbitalParticleId: null,
            color: stateColor,
            form: {kind: "torus", radius: 2, tube: 0.5},
            material: visualStateTorusMaterial(stateColor, true),
            orbitalParticleId: "orbital:state:1",
            ownerDarkParticleId: 2,
            x: 2,
            y: 0,
            z: 0,
          }),
      ],
      [
        "orbital orbital:process:1",
        (composer: ReturnType<typeof createComposer>) =>
          composer.addOrbital({
            anchorStateOrbitalParticleId: "orbital:state:1",
            color: stateColor,
            form: {kind: "sphere", radius: 0.3},
            material: visualCausalMaterial(stateColor, true, true),
            orbitalParticleId: "orbital:process:1",
            ownerDarkParticleId: 2,
            x: 3,
            y: 0,
            z: 0,
          }),
      ],
      [
        "Field proxy proxy:state:1:field:1",
        (composer: ReturnType<typeof createComposer>) =>
          composer.addFieldProxy({
            color: stateColor,
            fieldProxyId: "proxy:state:1:field:1",
            form: {kind: "sphere", radius: 0.5},
            material: visualConditionFieldMaterial(stateColor, true),
            ownerDarkParticleId: 2,
            paintOrbitalParticleId: null,
            stateOrbitalParticleId: "orbital:state:1",
            x: 2,
            y: 0,
            z: 0,
          }),
      ],
    ] as const

    for (const [label, addMismatched] of cases) {
      expect(() => addMismatched(createComposer())).toThrow(
        `${label} owner 2 does not match State sleeve owner 4`,
      )
    }
  })
})
