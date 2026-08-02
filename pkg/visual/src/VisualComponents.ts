import type {
  VisualFieldPlacement,
  VisualFieldProxyPlacement,
  VisualOrbitalPlacement,
  VisualStateEdgePlacement,
  VisualStateOccurrenceIdentity,
  VisualStateSleevePlacement,
  VisualTorusPlacement,
} from "./internal/layout.ts"
import type {StateGraphRootLayout} from "./StateGraphLayout.ts"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "./VisualMaterialSpec.ts"
import type {VisualRelationEdgePlacement} from "./VisualRelations.ts"
import type {HermiteEdgeCurve} from "./HermiteEdge.ts"

type Indexed<T> = Readonly<{
  renderIndex: number
  value: T
}>

/**
 * One State occurrence inside one causal sleeve. The State form, its anchored
 * causal particles and every Field projection on that State are one ownership
 * unit and therefore receive the same sleeve transform.
 */
export type VisualStateOccurrenceComponent = Readonly<{
  fieldProxies: readonly Indexed<VisualFieldProxyPlacement>[]
  identity: VisualStateOccurrenceIdentity
  orbitals: readonly Indexed<VisualOrbitalPlacement>[]
  state: Indexed<VisualOrbitalPlacement> | null
}>

/** One indivisible State sleeve, including forms, Fields and sampled edges. */
export type VisualStateSleeveComponent = Readonly<{
  occurrences: readonly VisualStateOccurrenceComponent[]
  sleeve: Indexed<VisualStateSleevePlacement>
}>

/**
 * One immutable recursive rendering unit. The semantic owner is data; the
 * repeated production structure is always the same:
 * Torus form → local core → State sleeves → nested Torus components.
 */
export type VisualTorusComponent = Readonly<{
  children: readonly VisualTorusComponent[]
  core: readonly Indexed<VisualFieldPlacement>[]
  kind: "torus-component"
  sleeves: readonly VisualStateSleeveComponent[]
  torus: Indexed<VisualTorusPlacement>
}>

export type VisualStateEdgeBatch = Readonly<{
  batchId: string
  edges: readonly VisualStateEdgePlacement[]
  material: VisualLineMaterial
  ownerDarkParticleId: number
  returning: boolean
}>

export type VisualRelationEdgeBatch = Readonly<{
  batchId: string
  edges: readonly VisualRelationEdgePlacement[]
  material: VisualLineMaterial
  ownerDarkParticleId: number
}>

export type VisualCompiledComponents = Readonly<{
  fields: readonly VisualFieldPlacement[]
  fieldProxies: readonly VisualFieldProxyPlacement[]
  orbitals: readonly VisualOrbitalPlacement[]
  relationEdgeBatches: readonly VisualRelationEdgeBatch[]
  relationEdges: readonly VisualRelationEdgePlacement[]
  stateEdgeBatches: readonly VisualStateEdgeBatch[]
  stateSleeves: readonly VisualStateSleevePlacement[]
  tori: readonly VisualTorusPlacement[]
}>

export type VisualComponentForest = Readonly<{
  kind: "visual-component-forest"
  relations: readonly Indexed<VisualRelationEdgePlacement>[]
  roots: readonly VisualTorusComponent[]
}>

export type VisualComponentComposer = Readonly<{
  addField(value: VisualFieldPlacement): void
  addFieldProxy(value: VisualFieldProxyPlacement): void
  addOrbital(value: VisualOrbitalPlacement): void
  addRelation(value: VisualRelationEdgePlacement): void
  addStateSleeve(value: VisualStateSleevePlacement): void
  addTorus(value: VisualTorusPlacement): void
  finish(options?: Readonly<{
    requireCompleteStateForms?: boolean
  }>): VisualComponentForest
}>

type MutableStateOccurrence = {
  fieldProxies: Indexed<VisualFieldProxyPlacement>[]
  identity: VisualStateOccurrenceIdentity
  orbitals: Indexed<VisualOrbitalPlacement>[]
  ownerDarkParticleId: number
  state: Indexed<VisualOrbitalPlacement> | null
}

type MutableStateSleeve = {
  occurrences: MutableStateOccurrence[]
  sleeve: Indexed<VisualStateSleevePlacement>
}

type MutableTorusComponent = {
  children: MutableTorusComponent[]
  core: Indexed<VisualFieldPlacement>[]
  sleeves: MutableStateSleeve[]
  torus: Indexed<VisualTorusPlacement>
}

const freezeRgb = (
  color: readonly [number, number, number],
): readonly [number, number, number] =>
  Object.freeze([...color]) as readonly [number, number, number]

const freezeRgba = (
  color: readonly [number, number, number, number],
): readonly [number, number, number, number] =>
  Object.freeze([...color]) as readonly [number, number, number, number]

const freezeQuantumMaterial = (
  material: VisualQuantumMaterial,
): VisualQuantumMaterial => Object.freeze({
  ...material,
  color: freezeRgb(material.color),
})

const freezeLineMaterial = (
  material: VisualLineMaterial,
): VisualLineMaterial => Object.freeze({
  ...material,
  color: freezeRgba(material.color),
  glowColor: freezeRgba(material.glowColor),
})

const freezeStateGraphLayout = (
  layout: StateGraphRootLayout,
): StateGraphRootLayout => Object.freeze({
  rootStateId: layout.rootStateId,
  edges: Object.freeze(layout.edges.map((edge) => Object.freeze({
    ...edge,
    conditionFieldIds: Object.freeze([...edge.conditionFieldIds]),
  }))),
  levels: Object.freeze(layout.levels.map((level) => Object.freeze({
    ...level,
    nodeIds: Object.freeze([...level.nodeIds]),
  }))),
  nodes: Object.freeze(layout.nodes.map((node) => Object.freeze({
    ...node,
    color: freezeRgb(node.color),
    fields: Object.freeze(node.fields.map((field) =>
      Object.freeze({...field})
    )),
  }))),
})

const freezeTorus = (
  value: VisualTorusPlacement,
): VisualTorusPlacement => Object.freeze({
  ...value,
  color: freezeRgb(value.color),
  material: freezeQuantumMaterial(value.material),
})

const freezeField = (
  value: VisualFieldPlacement,
): VisualFieldPlacement => Object.freeze({
  ...value,
  color: freezeRgb(value.color),
  fieldIds: Object.freeze([...value.fieldIds]),
  fieldKeys: Object.freeze([...value.fieldKeys]),
  fieldParticleIds: Object.freeze([...value.fieldParticleIds]),
  material: freezeQuantumMaterial(value.material),
  sourceOwnerDarkParticleIds:
    Object.freeze([...value.sourceOwnerDarkParticleIds]),
})

const freezeOrbital = (
  value: VisualOrbitalPlacement,
): VisualOrbitalPlacement => Object.freeze({
  ...value,
  color: freezeRgb(value.color),
  form: Object.freeze({...value.form}),
  material: freezeQuantumMaterial(value.material),
})

const freezeFieldProxy = (
  value: VisualFieldProxyPlacement,
): VisualFieldProxyPlacement => Object.freeze({
  ...value,
  color: freezeRgb(value.color),
  form: Object.freeze({...value.form}),
  material: freezeQuantumMaterial(value.material),
})

const freezeHermiteCurve = (curve: HermiteEdgeCurve): HermiteEdgeCurve =>
  Object.freeze({
    from: Object.freeze({...curve.from}),
    fromTangent: Object.freeze({...curve.fromTangent}),
    to: Object.freeze({...curve.to}),
    toTangent: Object.freeze({...curve.toTangent}),
  })

const freezeStateEdge = (
  edge: VisualStateEdgePlacement,
): VisualStateEdgePlacement => Object.freeze({
  ...edge,
  curve: freezeHermiteCurve(edge.curve),
  material: freezeLineMaterial(edge.material),
  path: Object.freeze(edge.path.map((point) => Object.freeze({...point}))),
})

const freezeSleeve = (
  value: VisualStateSleevePlacement,
): VisualStateSleevePlacement => Object.freeze({
  ...value,
  edges: Object.freeze(value.edges.map(freezeStateEdge)),
  layout: freezeStateGraphLayout(value.layout),
  occurrences: Object.freeze(value.occurrences.map((occurrence) =>
    Object.freeze({...occurrence})
  )),
})

const freezeRelation = (
  value: VisualRelationEdgePlacement,
): VisualRelationEdgePlacement => Object.freeze({
  ...value,
  curves: Object.freeze(value.curves.map(freezeHermiteCurve)) as readonly [
    HermiteEdgeCurve,
    HermiteEdgeCurve,
  ],
  material: freezeLineMaterial(value.material),
  path: Object.freeze(value.path.map((point) => Object.freeze({...point}))),
})

const indexed = <T>(renderIndex: number, value: T): Indexed<T> =>
  Object.freeze({renderIndex, value})

const ownerComponent = (
  byId: ReadonlyMap<number, MutableTorusComponent>,
  ownerDarkParticleId: number,
  label: string,
): MutableTorusComponent => {
  const component = byId.get(ownerDarkParticleId)
  if (!component) {
    throw new Error(
      `Visual component ${label} has no Torus owner ${ownerDarkParticleId}`,
    )
  }
  return component
}

const freezeStateOccurrence = (
  occurrence: MutableStateOccurrence,
  requireCompleteStateForms: boolean,
): VisualStateOccurrenceComponent => {
  if (requireCompleteStateForms && occurrence.state === null) {
    throw new Error(
      `Visual State occurrence ${occurrence.identity.orbitalParticleId} has no State form`,
    )
  }
  return Object.freeze({
    fieldProxies: Object.freeze([...occurrence.fieldProxies]),
    identity: Object.freeze({...occurrence.identity}),
    orbitals: Object.freeze([...occurrence.orbitals]),
    state: occurrence.state,
  })
}

const freezeStateSleeve = (
  sleeve: MutableStateSleeve,
  requireCompleteStateForms: boolean,
): VisualStateSleeveComponent => Object.freeze({
  occurrences: Object.freeze(sleeve.occurrences.map((occurrence) =>
    freezeStateOccurrence(occurrence, requireCompleteStateForms)
  )),
  sleeve: sleeve.sleeve,
})

const freezeComponent = (
  component: MutableTorusComponent,
  requireCompleteStateForms: boolean,
  visiting: Set<number>,
  visited: Set<number>,
): VisualTorusComponent => {
  const id = component.torus.value.darkParticleId
  if (visiting.has(id)) {
    throw new Error(`Visual component Torus parent cycle at ${id}`)
  }
  visiting.add(id)
  const frozen = Object.freeze({
    children: Object.freeze(
      component.children
        .map((child) => freezeComponent(
          child,
          requireCompleteStateForms,
          visiting,
          visited,
        )),
    ),
    core: Object.freeze([...component.core]),
    kind: "torus-component" as const,
    sleeves: Object.freeze(
      [...component.sleeves]
        .map((sleeve) =>
          freezeStateSleeve(sleeve, requireCompleteStateForms)
        ),
    ),
    torus: component.torus,
  })
  visiting.delete(id)
  visited.add(id)
  return frozen
}

/**
 * Stateful only while one named layout is being built. `finish()` seals the
 * recursive forest and rejects any later mutation. Layouts add geometry
 * directly to its semantic component instead of creating a flat scene first.
 */
export const createVisualComponentComposer = (): VisualComponentComposer => {
  const byId = new Map<number, MutableTorusComponent>()
  const roots: MutableTorusComponent[] = []
  const occurrenceByOrbitalId =
    new Map<string, MutableStateOccurrence>()
  const relations: Indexed<VisualRelationEdgePlacement>[] = []
  let torusIndex = 0
  let fieldIndex = 0
  let orbitalIndex = 0
  let fieldProxyIndex = 0
  let sleeveIndex = 0
  let relationIndex = 0
  let finished = false

  const mutable = (): void => {
    if (finished) {
      throw new Error("Visual component composer is already finished")
    }
  }

  const requireOccurrenceOwner = (
    occurrence: MutableStateOccurrence,
    ownerDarkParticleId: number,
    label: string,
  ): void => {
    if (ownerDarkParticleId !== occurrence.ownerDarkParticleId) {
      throw new Error(
        `Visual ${label} owner ${ownerDarkParticleId} does not match State sleeve owner ${occurrence.ownerDarkParticleId}`,
      )
    }
  }

  const addTorus = (value: VisualTorusPlacement): void => {
    mutable()
    if (byId.has(value.darkParticleId)) {
      throw new Error(
        `Visual component Torus ${value.darkParticleId} is duplicated`,
      )
    }
    const torus = indexed(torusIndex++, freezeTorus(value))
    byId.set(value.darkParticleId, {
      children: [],
      core: [],
      sleeves: [],
      torus,
    })
  }

  const addField = (value: VisualFieldPlacement): void => {
    mutable()
    ownerComponent(byId, value.ownerDarkParticleId, "Field").core.push(
      indexed(fieldIndex++, freezeField(value)),
    )
  }

  const addStateSleeve = (value: VisualStateSleevePlacement): void => {
    mutable()
    const owner = ownerComponent(
      byId,
      value.ownerDarkParticleId,
      "State sleeve",
    )
    const frozen = freezeSleeve(value)
    const occurrences = frozen.occurrences.map((identity) => {
      if (occurrenceByOrbitalId.has(identity.orbitalParticleId)) {
        throw new Error(
          `Visual State occurrence ${identity.orbitalParticleId} is duplicated`,
        )
      }
      const occurrence: MutableStateOccurrence = {
        fieldProxies: [],
        identity,
        orbitals: [],
        ownerDarkParticleId: value.ownerDarkParticleId,
        state: null,
      }
      occurrenceByOrbitalId.set(identity.orbitalParticleId, occurrence)
      return occurrence
    })
    owner.sleeves.push({
      occurrences,
      sleeve: indexed(sleeveIndex++, frozen),
    })
  }

  const addOrbital = (value: VisualOrbitalPlacement): void => {
    mutable()
    const stateOccurrence = occurrenceByOrbitalId.get(
      value.orbitalParticleId,
    )
    if (stateOccurrence) {
      requireOccurrenceOwner(
        stateOccurrence,
        value.ownerDarkParticleId,
        `State form ${value.orbitalParticleId}`,
      )
      if (stateOccurrence.state !== null) {
        throw new Error(
          `Visual State form ${value.orbitalParticleId} is duplicated`,
        )
      }
      stateOccurrence.state =
        indexed(orbitalIndex++, freezeOrbital(value))
      return
    }
    if (value.anchorStateOrbitalParticleId !== null) {
      const anchor = occurrenceByOrbitalId.get(
        value.anchorStateOrbitalParticleId,
      )
      if (!anchor) {
        throw new Error(
          `Visual orbital ${value.orbitalParticleId} has no State component anchor`,
        )
      }
      requireOccurrenceOwner(
        anchor,
        value.ownerDarkParticleId,
        `orbital ${value.orbitalParticleId}`,
      )
      anchor.orbitals.push(
        indexed(orbitalIndex++, freezeOrbital(value)),
      )
      return
    }
    throw new Error(
      `Visual orbital ${value.orbitalParticleId} is outside a State sleeve`,
    )
  }

  const addFieldProxy = (value: VisualFieldProxyPlacement): void => {
    mutable()
    const occurrence = occurrenceByOrbitalId.get(
      value.stateOrbitalParticleId,
    )
    if (!occurrence) {
      throw new Error(
        `Visual Field proxy ${value.fieldProxyId} has no State component`,
      )
    }
    requireOccurrenceOwner(
      occurrence,
      value.ownerDarkParticleId,
      `Field proxy ${value.fieldProxyId}`,
    )
    occurrence.fieldProxies.push(
      indexed(fieldProxyIndex++, freezeFieldProxy(value)),
    )
  }

  const addRelation = (value: VisualRelationEdgePlacement): void => {
    mutable()
    ownerComponent(
      byId,
      value.ownerDarkParticleId,
      "relation",
    )
    relations.push(indexed(relationIndex++, freezeRelation(value)))
  }

  const finish = (
    options: Readonly<{requireCompleteStateForms?: boolean}> = {},
  ): VisualComponentForest => {
    mutable()
    finished = true
    for (const component of byId.values()) {
      const parentId = component.torus.value.parentDarkParticleId
      if (parentId === null) {
        roots.push(component)
      } else {
        ownerComponent(byId, parentId, "nested Torus")
          .children.push(component)
      }
    }
    const visited = new Set<number>()
    const requireCompleteStateForms =
      options.requireCompleteStateForms ?? true
    const frozenRoots = roots.map((root) => freezeComponent(
        root,
        requireCompleteStateForms,
        new Set(),
        visited,
      ))
    if (visited.size !== byId.size) {
      throw new Error("Visual component forest contains an unreachable Torus")
    }
    return Object.freeze({
      kind: "visual-component-forest",
      relations: Object.freeze([...relations]),
      roots: Object.freeze(frozenRoots),
    })
  }

  return Object.freeze({
    addField,
    addFieldProxy,
    addOrbital,
    addRelation,
    addStateSleeve,
    addTorus,
    finish,
  })
}

const compiledCache =
  new WeakMap<VisualComponentForest, VisualCompiledComponents>()

const materialKey = (material: VisualLineMaterial): string =>
  JSON.stringify(material)

/**
 * Identity of one Transition line batch.
 *
 * A batch is exactly the set of edges a renderer can draw with a single line
 * material, so the material belongs in the identity: two batches of the same
 * owner and direction that paint differently are two different GPU buffers.
 * Exported because a Store that repaints a branch has to name the batches it
 * produces under the same law the strategy used, or the renderer would see an
 * unrelated identity and rebuild geometry that never moved.
 */
export const visualStateEdgeBatchId = (
  ownerDarkParticleId: number,
  returning: boolean,
  material: VisualLineMaterial,
): string =>
  [
    ownerDarkParticleId,
    returning ? "return" : "forward",
    materialKey(material),
  ].join(":")

/** Identity of one relation line batch, under the same law. */
export const visualRelationEdgeBatchId = (
  ownerDarkParticleId: number,
  material: VisualLineMaterial,
): string => [ownerDarkParticleId, materialKey(material)].join(":")

/**
 * Flattens the recursive model once into stable renderer indexes. The cached
 * result is reused by all consumers of the same immutable scene; no renderer
 * frame traverses or reconstructs component geometry.
 */
export const compileVisualComponents = (
  forest: VisualComponentForest,
): VisualCompiledComponents => {
  const cached = compiledCache.get(forest)
  if (cached) return cached

  const tori: Indexed<VisualTorusPlacement>[] = []
  const fields: Indexed<VisualFieldPlacement>[] = []
  const orbitals: Indexed<VisualOrbitalPlacement>[] = []
  const fieldProxies: Indexed<VisualFieldProxyPlacement>[] = []
  const stateSleeves: Indexed<VisualStateSleevePlacement>[] = []
  const relationEdges = [...forest.relations]
  const edgeBatches = new Map<string, {
    edges: VisualStateEdgePlacement[]
    material: VisualLineMaterial
    ownerDarkParticleId: number
    returning: boolean
  }>()
  const relationBatches = new Map<string, {
    edges: VisualRelationEdgePlacement[]
    material: VisualLineMaterial
    ownerDarkParticleId: number
  }>()

  const visit = (component: VisualTorusComponent): void => {
    tori.push(component.torus)
    fields.push(...component.core)
    for (const sleeve of component.sleeves) {
      stateSleeves.push(sleeve.sleeve)
      for (const occurrence of sleeve.occurrences) {
        if (occurrence.state !== null) orbitals.push(occurrence.state)
        orbitals.push(...occurrence.orbitals)
        fieldProxies.push(...occurrence.fieldProxies)
      }
      for (const edge of sleeve.sleeve.value.edges) {
        const key = visualStateEdgeBatchId(
          sleeve.sleeve.value.ownerDarkParticleId,
          edge.returning,
          edge.material,
        )
        const batch = edgeBatches.get(key)
        if (batch) {
          batch.edges.push(edge)
        } else {
          edgeBatches.set(key, {
            edges: [edge],
            material: edge.material,
            ownerDarkParticleId:
              sleeve.sleeve.value.ownerDarkParticleId,
            returning: edge.returning,
          })
        }
      }
    }
    component.children.forEach(visit)
  }
  forest.roots.forEach(visit)

  for (const relation of relationEdges) {
    const edge = relation.value
    const key = visualRelationEdgeBatchId(
      edge.ownerDarkParticleId,
      edge.material,
    )
    const batch = relationBatches.get(key)
    if (batch) {
      batch.edges.push(edge)
    } else {
      relationBatches.set(key, {
        edges: [edge],
        material: edge.material,
        ownerDarkParticleId: edge.ownerDarkParticleId,
      })
    }
  }

  /**
   * Order inside a batch follows the canonical channel identity rather than the
   * order the traversal happened to reach each edge.
   *
   * Membership decides content: a batch that gains an edge because a branch
   * changed colour must lay out identically whether it was assembled by walking
   * the forest or by a Store regrouping the paths it already holds. Leaving the
   * order to the traversal would make those two routes produce different
   * fingerprints for the same picture.
   */
  for (const batch of edgeBatches.values()) {
    batch.edges.sort((left, right) =>
      (left.transitionChannelId ?? left.edgeId) <
          (right.transitionChannelId ?? right.edgeId)
        ? -1
        : 1
    )
  }
  for (const batch of relationBatches.values()) {
    batch.edges.sort((left, right) =>
      left.relationChannelId < right.relationChannelId ? -1 : 1
    )
  }

  const ordered = <T>(
    entries: readonly Indexed<T>[],
    label: string,
  ): readonly T[] => {
    const values = new Array<T>(entries.length)
    for (const entry of entries) {
      if (
        entry.renderIndex < 0 ||
        entry.renderIndex >= values.length ||
        values[entry.renderIndex] !== undefined
      ) {
        throw new Error(
          `Visual component ${label} render index ${entry.renderIndex} is invalid`,
        )
      }
      values[entry.renderIndex] = entry.value
    }
    if (values.some((value) => value === undefined)) {
      throw new Error(`Visual component ${label} render index is missing`)
    }
    return Object.freeze(values)
  }
  const compiled: VisualCompiledComponents = Object.freeze({
    fields: ordered(fields, "Field"),
    fieldProxies: ordered(fieldProxies, "Field proxy"),
    orbitals: ordered(orbitals, "orbital"),
    relationEdgeBatches: Object.freeze(
      [...relationBatches.entries()].map(([batchId, batch]) =>
        Object.freeze({
          batchId,
          edges: Object.freeze([...batch.edges]),
          material: batch.material,
          ownerDarkParticleId: batch.ownerDarkParticleId,
        })
      ),
    ),
    relationEdges: ordered(relationEdges, "relation"),
    stateEdgeBatches: Object.freeze(
      [...edgeBatches.entries()].map(([batchId, batch]) =>
        Object.freeze({
          batchId,
          edges: Object.freeze([...batch.edges]),
          material: batch.material,
          ownerDarkParticleId: batch.ownerDarkParticleId,
          returning: batch.returning,
        })
      ),
    ),
    stateSleeves: ordered(stateSleeves, "State sleeve"),
    tori: ordered(tori, "Torus"),
  })
  compiledCache.set(forest, compiled)
  return compiled
}
