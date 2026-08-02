import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {layoutFieldsInPseudoCircle} from "./FieldsLayout.ts"
import {
  TORUS_LAYOUT_BASELINE,
  defineTorusComposition,
  resolveContentTorusForm,
  type TorusComposition,
  type TorusPlacement,
} from "./Torus.ts"
import {
  visualDarkParticleColor,
  visualFieldParticleColor,
} from "./SemanticVisual.ts"
import {
  visualContextTorusMaterial,
  visualCoreFieldMaterial,
} from "./VisualMaterialSpec.ts"
import {createVisualComponentComposer} from "./VisualComponents.ts"
import {
  buildDarkParticleForest,
  type DarkTreeNode,
} from "./internal/dark-tree.ts"
import {
  addCompleteVisualStateComponents,
} from "./internal/complete-state-components.ts"
import {
  buildProcessTorusLayoutIndex,
} from "./internal/process-layout.ts"
import {
  defineVisualScene,
  defineVisualLayout,
  type VisualFieldPlacement,
  type VisualLayoutInput,
  type VisualScene,
  type VisualStateSleevePlacement,
  type VisualTorusPlacement,
} from "./internal/layout.ts"
import {
  buildStateSleeveEdges,
  indexOwnerStateLayouts,
  indexStateSleeveOccurrences,
  indexStateSleeveTransitions,
  identifyStateLayoutOccurrences,
  packStateSleeves,
  placeStateLayout,
  prepareStateLayout,
  stateSleevePhase,
  stateInnerOrbitRadius,
  stateNodeSurfaceGap,
  worldPoint,
  type OwnerStateLayouts,
  type PreparedStateLayout,
  type StatePlacement,
  type WorldTransform,
} from "./internal/state-sleeves.ts"

type DarkParticle = BulkManifest["darkParticles"][number]
type FieldParticle = BulkManifest["fieldParticles"][number]
type PositionedField = Readonly<{
  field: FieldParticle
  radius: number
  x: number
  y: number
  z: number
}>

type DarkTorusPayload = Readonly<{
  ownerAtomId: number | null
  particle: DarkParticle
  states: readonly StatePlacement[]
}>

type DarkTorus = TorusComposition<DarkTorusPayload, PositionedField>
type DarkTorusPlacement = TorusPlacement<DarkTorusPayload, PositionedField>

export type OutsideInVisualScene = VisualScene

const fieldNucleusExtent = (
  fields: readonly PositionedField[],
): number => fields.length === 0
  ? 0
  : Math.max(...fields.map((field) =>
    Math.hypot(field.x, field.y, field.z) + field.radius
  ))

const placeFieldsInPseudoCircle = (
  fields: readonly FieldParticle[],
  markerRadius: number,
): readonly PositionedField[] => {
  const layout = layoutFieldsInPseudoCircle(
    fields.length,
    markerRadius,
  )
  return fields.map((field, index) => ({
    field,
    x: layout.points[index]?.x ?? 0,
    y: layout.points[index]?.y ?? 0,
    z: layout.points[index]?.z ?? 0,
    radius: markerRadius,
  }))
}

const sourceChildPhase = (
  children: readonly DarkTorus[],
): number => {
  const identity = children.map((child) =>
    child.payload.particle.darkParticleId
  ).join(":")
  if (identity.length === 0) return 0
  let hash = 2166136261
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const siblingOrbitRadius = (
  count: number,
  maximumExtent: number,
  gap: number,
): number => count <= 1
  ? 0
  : (maximumExtent + gap * 0.5) / Math.sin(Math.PI / count)

const buildDarkParticleTori = (
  manifest: BulkManifest,
  layoutsByOwner: ReadonlyMap<number, OwnerStateLayouts>,
): readonly DarkTorus[] => {
  const roots = buildDarkParticleForest(manifest)
  const fieldsByParent = new Map<number, FieldParticle[]>()
  for (const field of manifest.fieldParticles) {
    const fields = fieldsByParent.get(field.parentDarkParticleId)
    if (fields) fields.push(field)
    else fieldsByParent.set(field.parentDarkParticleId, [field])
  }
  const resolve = (node: DarkTreeNode): DarkTorus => {
    const particle = node.particle
    const sourceFields = fieldsByParent.get(particle.darkParticleId) ?? []
    const markerRadius = TORUS_LAYOUT_BASELINE.rootFieldRadius
    const fields = placeFieldsInPseudoCircle(sourceFields, markerRadius)
    const gap = Math.max(
      0.001,
      markerRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius,
    )
    const coreExtent = fieldNucleusExtent(fields)
    const coreForm = resolveContentTorusForm({
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius,
      coreExtent,
      gap,
    })
    const innerRadius = coreForm.innerRadius
    const childTori = node.children.map(resolve)
    const maximumChildExtent = Math.max(
      0,
      ...childTori.map((child) =>
        child.form.outerRadius * TORUS_LAYOUT_BASELINE.levelScale
      ),
    )
    const matterOrbitRadius = childTori.length === 0
      ? 0
      : Math.max(
        innerRadius + gap + maximumChildExtent,
        siblingOrbitRadius(
          childTori.length,
          maximumChildExtent,
          gap,
        ),
      )
    const childPhase = sourceChildPhase(childTori)
    const childPlacements: DarkTorusPlacement[] = childTori.map((child, index) => {
      const angle = childPhase + index * Math.PI * 2 / childTori.length
      return {
        torus: child,
        scale: TORUS_LAYOUT_BASELINE.levelScale,
        x: Math.cos(angle) * matterOrbitRadius,
        y: Math.sin(angle) * matterOrbitRadius,
        z: 0,
      }
    })
    const matterOuterRadius = childTori.length === 0
      ? innerRadius
      : Math.max(...childTori.map((child) =>
        matterOrbitRadius +
          child.form.outerRadius * TORUS_LAYOUT_BASELINE.levelScale
      ))
    const ownerStateLayouts = layoutsByOwner.get(particle.darkParticleId)
    const preparedStates =
      (ownerStateLayouts?.layouts ?? [])
      .map(prepareStateLayout)
      .filter((layout): layout is PreparedStateLayout => layout !== null)
    const statePhase = stateSleevePhase(particle, preparedStates)
    const statePacking = packStateSleeves(
      preparedStates,
      preparedStates.length === 0
        ? 0
        : stateInnerOrbitRadius(
          preparedStates,
          matterOuterRadius,
          gap,
        ),
      stateNodeSurfaceGap(markerRadius),
      statePhase,
    )
    const statePlacements = preparedStates.map((prepared, index) => ({
      angle: statePacking.angles[index] ?? statePhase,
      orbitRadius: statePacking.orbitRadius,
      prepared,
    }))
    const stateOuterRadius = statePlacements.length === 0
      ? matterOuterRadius
      : Math.max(...statePlacements.flatMap(({orbitRadius, prepared}) =>
        prepared.offsets.map((offset) =>
          Math.hypot(
            orbitRadius + offset.x,
            offset.y,
            offset.z,
          ) + offset.node.radius
        )
      ))
    const form = resolveContentTorusForm({
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius,
      coreExtent,
      gap,
      occupiedOuterExtent: Math.max(matterOuterRadius, stateOuterRadius),
    })
    return defineTorusComposition({
      id: `${particle.darkParticleKind}:${particle.darkParticleId}`,
      role: particle.darkParticleKind,
      payload: {
        ownerAtomId: ownerStateLayouts?.ownerAtomId ?? null,
        particle,
        states: statePlacements,
      },
      core: fields,
      innerRadius: form.innerRadius,
      outerRadius: form.outerRadius,
      children: childPlacements,
    })
  }

  return roots.map(resolve)
}

export const buildOutsideInVisualScene = (
  {manifest, owners}: VisualLayoutInput,
): OutsideInVisualScene => {
  const componentComposer = createVisualComponentComposer()
  const occurrenceIndex = indexStateSleeveOccurrences(manifest)
  const transitions = indexStateSleeveTransitions(manifest)
  const processLayouts = buildProcessTorusLayoutIndex(manifest)
  const layoutsByOwner = indexOwnerStateLayouts(
    manifest,
    owners,
    true,
    processLayouts.stateOrbitalContentByOwner,
  )
  const tori: VisualTorusPlacement[] = []
  const fields: VisualFieldPlacement[] = []
  const stateSleeves: VisualStateSleevePlacement[] = []
  const visit = (
    torus: DarkTorus,
    transform: WorldTransform,
  ): void => {
    const torusColor = visualDarkParticleColor(torus.payload.particle)
    tori.push({
      darkParticleId: torus.payload.particle.darkParticleId,
      darkParticleKind: torus.payload.particle.darkParticleKind,
      depth: torus.payload.particle.depth,
      parentDarkParticleId:
        torus.payload.particle.parentDarkParticleId,
      src: torus.payload.particle.src,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      radius: torus.form.radius * transform.scale,
      tube: torus.form.tube * transform.scale,
      color: torusColor,
      material: visualContextTorusMaterial(torusColor),
    })
    componentComposer.addTorus(tori[tori.length - 1]!)
    for (const field of torus.core) {
      const fieldColor = visualFieldParticleColor(field.field)
      fields.push({
        ...worldPoint(
          transform,
          field.x,
          field.y,
          field.z,
        ),
        fieldIds: [field.field.fieldId],
        fieldKeys: [field.field.fieldKey],
        fieldParticleIds: [field.field.fieldParticleId],
        fieldParticleKind: field.field.fieldParticleKind,
        ownerDarkParticleId: field.field.parentDarkParticleId,
        sourceOwnerDarkParticleIds: [field.field.parentDarkParticleId],
        valueId: field.field.valueId,
        valueText: field.field.valueText,
        radius: field.radius * transform.scale,
        color: fieldColor,
        material: visualCoreFieldMaterial(fieldColor),
      })
      componentComposer.addField(fields[fields.length - 1]!)
    }
    for (const placement of torus.payload.states) {
      const ownerSrc = torus.payload.particle.src
      const ownerAtomId = torus.payload.ownerAtomId
      if (ownerSrc === null || ownerAtomId === null) continue
      const layout = placeStateLayout(placement, transform)
      const occurrences = identifyStateLayoutOccurrences(
        occurrenceIndex,
        ownerAtomId,
        torus.payload.particle.darkParticleId,
        layout,
      )
      stateSleeves.push({
        edges: buildStateSleeveEdges(
          transitions,
          torus.payload.particle.darkParticleId,
          layout,
          occurrences,
        ),
        layout,
        occurrences,
        ownerAtomId,
        ownerDarkParticleId:
          torus.payload.particle.darkParticleId,
        ownerSrc,
        rootStateId: placement.prepared.layout.rootStateId,
      })
      componentComposer.addStateSleeve(
        stateSleeves[stateSleeves.length - 1]!,
      )
    }
    for (const child of torus.children) {
      const point = worldPoint(transform, child.x, child.y, child.z)
      visit(child.torus, {
        ...point,
        scale: transform.scale * child.scale,
      })
    }
  }

  for (const root of buildDarkParticleTori(manifest, layoutsByOwner)) {
    const particle = root.payload.particle
    visit(root, {
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
    })
  }

  addCompleteVisualStateComponents({
    componentComposer,
    fields,
    manifest,
    processLayouts,
    stateSleeves,
    tori,
  })
  return defineVisualScene({
    components: componentComposer.finish({
      requireCompleteStateForms: true,
    }),
    layoutSlug: "outside-in",
  })
}

export const OutsideIn = defineVisualLayout({
  slug: "outside-in",
  label: "Снаружи → внутрь",
  status: "ready",
  description:
    "Полный Bulk scene snapshot от корневого Atom внутрь каждого рекурсивного Atom.",
  /**
   * Every Field sits in its own owner's core and `valueId` travels as data, so
   * rebinding a Value repaints a marker without moving it.
   */
  placement: {currentState: false, fieldValue: false},
  buildScene: buildOutsideInVisualScene,
})
