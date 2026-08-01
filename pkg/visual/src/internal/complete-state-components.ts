import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
  stateGraphFieldSphereLayout,
  stateGraphNodeFormDimensions,
} from "../StateGraphLayout.ts"
import {
  torusFieldRadiusAtLevel,
  torusLevelScale,
} from "../Torus.ts"
import {
  visualFieldParticleColor,
  visualOrbitalParticleColor,
} from "../SemanticVisual.ts"
import {
  visualCausalMaterial,
  visualConditionFieldMaterial,
  visualFieldProxyMaterial,
  visualProcessTorusMaterial,
  visualStateTorusMaterial,
} from "../VisualMaterialSpec.ts"
import {
  buildVisualRelationEdges,
} from "../VisualRelations.ts"
import type {
  VisualComponentComposer,
} from "../VisualComponents.ts"
import type {
  VisualFieldPlacement,
  VisualFieldProxyPlacement,
  VisualOrbitalPlacement,
  VisualStateSleevePlacement,
  VisualTorusPlacement,
} from "./layout.ts"
import type {
  ProcessTorusLayoutIndex,
} from "./process-layout.ts"

export type CompleteVisualStateComponentsInput = Readonly<{
  componentComposer: VisualComponentComposer
  fields: readonly VisualFieldPlacement[]
  manifest: BulkManifest
  processLayouts: ProcessTorusLayoutIndex
  stateSleeves: readonly VisualStateSleevePlacement[]
  tori: readonly VisualTorusPlacement[]
}>

const stablePhase = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

/**
 * Adds the strategy-neutral complete State component geometry after a named
 * layout has placed its owning Tori, Field cores and indivisible sleeves.
 */
export const addCompleteVisualStateComponents = ({
  componentComposer,
  fields,
  manifest,
  processLayouts,
  stateSleeves,
  tori,
}: CompleteVisualStateComponentsInput): void => {
  const orbitalById = new Map(
    (manifest.orbitalParticles ?? []).map((particle) =>
      [particle.orbitalParticleId, particle] as const
    ),
  )
  const statePlacementById = new Map<string, VisualOrbitalPlacement>()
  for (const sleeve of stateSleeves) {
    const nodeById = new Map(sleeve.layout.nodes.map((node) =>
      [node.id, node] as const
    ))
    for (const occurrence of sleeve.occurrences) {
      const node = nodeById.get(occurrence.nodeId)
      const particle = orbitalById.get(occurrence.orbitalParticleId)
      if (!node || !particle || particle.orbitalParticleKind !== "state") {
        throw new Error(
          `Visual State occurrence ${occurrence.orbitalParticleId} has no layout form`,
        )
      }
      const form = stateGraphNodeFormDimensions(
        node.radius,
        node.innerRadius,
      )
      const statePlacement: VisualOrbitalPlacement = {
        anchorStateOrbitalParticleId: null,
        color: node.color,
        form: {
          kind: "torus",
          radius: form.torusRadius,
          tube: form.torusTube,
        },
        orbitalParticleId: occurrence.orbitalParticleId,
        material: visualStateTorusMaterial(
          node.color,
          node.current,
          particle.active,
        ),
        ownerDarkParticleId: sleeve.ownerDarkParticleId,
        x: node.x,
        y: node.y,
        z: node.z,
      }
      statePlacementById.set(occurrence.orbitalParticleId, statePlacement)
      componentComposer.addOrbital(statePlacement)
    }
  }

  const orbitals: VisualOrbitalPlacement[] = [
    ...statePlacementById.values(),
  ]
  const causalSlotByAnchor = new Map<string, number>()
  const processPlacementById = new Map<string, VisualOrbitalPlacement>()
  const torusDepthById = new Map(tori.map((torus) =>
    [torus.darkParticleId, torus.depth] as const
  ))
  for (const particle of (manifest.orbitalParticles ?? [])
    .filter((candidate) => candidate.orbitalParticleKind !== "state")
    .sort((left, right) =>
      left.orbitalParticleId.localeCompare(right.orbitalParticleId)
    )) {
    const anchorId = particle.anchorStateOrbitalParticleId
    const anchor = anchorId === null
      ? undefined
      : statePlacementById.get(anchorId)
    const anchorParticle = anchorId === null
      ? undefined
      : orbitalById.get(anchorId)
    if (
      !anchor ||
      anchor.form.kind !== "torus" ||
      !anchorParticle ||
      anchorParticle.orbitalParticleKind !== "state"
    ) {
      throw new Error(
        `Visual causal occurrence ${particle.orbitalParticleId} has no State anchor`,
      )
    }
    const processLayout = processLayouts.byOrbitalParticleId.get(
      particle.orbitalParticleId,
    )
    if (
      particle.orbitalParticleKind === "process" ||
      particle.orbitalParticleKind === "finally"
    ) {
      if (!processLayout) {
        throw new Error(
          `Visual Process occurrence ${particle.orbitalParticleId} has no Torus layout`,
        )
      }
      const ownerDepth =
        torusDepthById.get(particle.parentDarkParticleId) ?? 0
      const scale = torusLevelScale(ownerDepth)
      const processOuterRadius = processLayout.form.outerRadius * scale
      const orbitRadius = anchor.form.radius
      const processX =
        anchor.x + Math.cos(processLayout.orbitAngle) * orbitRadius
      const processY =
        anchor.y + Math.sin(processLayout.orbitAngle) * orbitRadius
      const processZ = anchor.z
      const radialDistance = Math.hypot(
        processX - anchor.x,
        processY - anchor.y,
      )
      const distanceToStateOrbit = Math.hypot(
        radialDistance - anchor.form.radius,
        processZ - anchor.z,
      )
      if (
        distanceToStateOrbit + processOuterRadius >
          anchor.form.tube + 1e-9
      ) {
        throw new Error(
          `Visual Process ${particle.orbitalParticleId} does not fit in State ${anchorId} Torus volume`,
        )
      }
      const color = visualOrbitalParticleColor(particle)
      const placement: VisualOrbitalPlacement = {
        anchorStateOrbitalParticleId: anchorId,
        color,
        form: {
          kind: "torus",
          radius: processLayout.form.radius * scale,
          tube: processLayout.form.tube * scale,
        },
        material: visualProcessTorusMaterial(
          color,
          particle.current,
          particle.active,
          anchorParticle.active,
        ),
        orbitalParticleId: particle.orbitalParticleId,
        ownerDarkParticleId: particle.parentDarkParticleId,
        x: processX,
        y: processY,
        z: processZ,
      }
      orbitals.push(placement)
      processPlacementById.set(particle.orbitalParticleId, placement)
      componentComposer.addOrbital(placement)
      continue
    }
    if (processLayout) {
      throw new Error(
        `Visual causal occurrence ${particle.orbitalParticleId} has an invalid Process layout`,
      )
    }
    const slot = causalSlotByAnchor.get(anchorId!) ?? 0
    causalSlotByAnchor.set(anchorId!, slot + 1)
    const ownerDepth = torusDepthById.get(particle.parentDarkParticleId) ?? 0
    const radius = torusFieldRadiusAtLevel(ownerDepth) * 0.72
    const angle =
      stablePhase(anchorId!) +
      slot * Math.PI * (3 - Math.sqrt(5))
    const anchorOuterRadius = anchor.form.radius + anchor.form.tube
    const orbitRadius = anchorOuterRadius + radius * 1.8
    const color = visualOrbitalParticleColor(particle)
    orbitals.push({
      anchorStateOrbitalParticleId: anchorId,
      color,
      form: {kind: "sphere", radius},
      material: visualCausalMaterial(
        color,
        particle.current,
        particle.active,
        anchorParticle.active,
      ),
      orbitalParticleId: particle.orbitalParticleId,
      ownerDarkParticleId: particle.parentDarkParticleId,
      x: anchor.x + Math.cos(angle) * orbitRadius,
      y: anchor.y + Math.sin(angle) * orbitRadius,
      z: anchor.z +
        Math.sin(stablePhase(`${particle.orbitalParticleId}:z`)) *
          radius * 0.8,
    })
    componentComposer.addOrbital(orbitals[orbitals.length - 1]!)
  }

  const proxyByStateAndField = new Map<string, Map<number, string>>()
  for (const proxy of manifest.fieldProxies ?? []) {
    const byField = proxyByStateAndField.get(proxy.stateOrbitalParticleId) ??
      new Map<number, string>()
    if (byField.has(proxy.fieldId)) {
      throw new Error(
        `Visual Field proxy ${proxy.stateOrbitalParticleId}/${proxy.fieldId} is duplicated`,
      )
    }
    byField.set(proxy.fieldId, proxy.fieldProxyId)
    proxyByStateAndField.set(proxy.stateOrbitalParticleId, byField)
  }
  const fieldByOwnerAndId = new Map(
    manifest.fieldParticles.map((field) =>
      [`${field.parentDarkParticleId}:${field.fieldId}`, field] as const
    ),
  )
  const proxyById = new Map((manifest.fieldProxies ?? []).map((proxy) =>
    [proxy.fieldProxyId, proxy] as const
  ))
  const fieldProxies: VisualFieldProxyPlacement[] = []
  const consumedProxyIds = new Set<string>()
  for (const processLayout of [...processLayouts.byOrbitalParticleId.values()]
    .sort((left, right) =>
      left.orbitalParticleId.localeCompare(right.orbitalParticleId)
    )) {
    const processParticle = orbitalById.get(processLayout.orbitalParticleId)
    const processPlacement = processPlacementById.get(
      processLayout.orbitalParticleId,
    )
    if (
      !processParticle ||
      !processPlacement ||
      processPlacement.form.kind !== "torus"
    ) {
      throw new Error(
        `Visual Process ${processLayout.orbitalParticleId} has no Torus placement`,
      )
    }
    const scale = torusLevelScale(
      torusDepthById.get(processLayout.ownerDarkParticleId) ?? 0,
    )
    for (const fieldPlacement of processLayout.fieldProxies) {
      const proxy = proxyById.get(fieldPlacement.fieldProxyId)
      const sourceField = proxy
        ? fieldByOwnerAndId.get(
            `${proxy.parentDarkParticleId}:${proxy.fieldId}`,
          )
        : undefined
      const stateParticle = proxy
        ? orbitalById.get(proxy.stateOrbitalParticleId)
        : undefined
      if (
        !proxy ||
        !sourceField ||
        !stateParticle ||
        stateParticle.orbitalParticleKind !== "state" ||
        consumedProxyIds.has(fieldPlacement.fieldProxyId)
      ) {
        throw new Error(
          `Visual Process Field proxy ${fieldPlacement.fieldProxyId} is unresolved`,
        )
      }
      consumedProxyIds.add(fieldPlacement.fieldProxyId)
      const color = visualFieldParticleColor(sourceField)
      fieldProxies.push({
        color,
        fieldProxyId: fieldPlacement.fieldProxyId,
        form: {kind: "sphere", radius: fieldPlacement.radius * scale},
        material: visualFieldProxyMaterial(
          color,
          "sphere",
          processParticle.active,
          stateParticle.active,
        ),
        ownerDarkParticleId: processLayout.ownerDarkParticleId,
        paintOrbitalParticleId: processParticle.orbitalParticleId,
        stateOrbitalParticleId: proxy.stateOrbitalParticleId,
        x: processPlacement.x + fieldPlacement.x * scale,
        y: processPlacement.y + fieldPlacement.y * scale,
        z: processPlacement.z + fieldPlacement.z * scale,
      })
      componentComposer.addFieldProxy(
        fieldProxies[fieldProxies.length - 1]!,
      )
    }
  }
  for (const sleeve of stateSleeves) {
    const occurrenceByNode = new Map(sleeve.occurrences.map((occurrence) =>
      [occurrence.nodeId, occurrence] as const
    ))
    for (const node of sleeve.layout.nodes) {
      const occurrence = occurrenceByNode.get(node.id)
      if (!occurrence) continue
      const stateParticle = orbitalById.get(occurrence.orbitalParticleId)
      if (
        !stateParticle ||
        stateParticle.orbitalParticleKind !== "state"
      ) {
        throw new Error(
          `Visual condition State ${occurrence.orbitalParticleId} is unresolved`,
        )
      }
      for (const fieldPlacement of stateGraphFieldSphereLayout(
        node.fields,
        node.fieldRadius,
      )) {
        const proxyId = proxyByStateAndField
          .get(occurrence.orbitalParticleId)
          ?.get(fieldPlacement.id)
        const sourceField = fieldByOwnerAndId.get(
          `${sleeve.ownerDarkParticleId}:${fieldPlacement.id}`,
        )
        if (proxyId && consumedProxyIds.has(proxyId)) continue
        if (!proxyId || !sourceField) {
          throw new Error(
            `Visual condition Field proxy ${occurrence.orbitalParticleId}/${fieldPlacement.id} is unresolved`,
          )
        }
        consumedProxyIds.add(proxyId)
        const color = visualFieldParticleColor(sourceField)
        fieldProxies.push({
          color,
          fieldProxyId: proxyId,
          form: {kind: "sphere", radius: fieldPlacement.radius},
          material: visualConditionFieldMaterial(
            color,
            node.current,
            stateParticle.active,
          ),
          ownerDarkParticleId: sleeve.ownerDarkParticleId,
          paintOrbitalParticleId: null,
          stateOrbitalParticleId: occurrence.orbitalParticleId,
          x: node.x + fieldPlacement.x,
          y: node.y + fieldPlacement.y,
          z: node.z + fieldPlacement.z,
        })
        componentComposer.addFieldProxy(
          fieldProxies[fieldProxies.length - 1]!,
        )
      }
    }
  }
  for (const [proxyId, proxy] of proxyById) {
    if (consumedProxyIds.has(proxyId)) continue
    const state = statePlacementById.get(proxy.stateOrbitalParticleId)
    const sourceField = fieldByOwnerAndId.get(
      `${proxy.parentDarkParticleId}:${proxy.fieldId}`,
    )
    if (!state || state.form.kind !== "torus" || !sourceField) {
      throw new Error(`Visual Field proxy ${proxyId} has no State form`)
    }
    const angle = stablePhase(proxyId)
    const elevation = Math.sin(stablePhase(`${proxyId}:z`)) * 0.55
    const radial = Math.sqrt(Math.max(0, 1 - elevation * elevation))
    const stateOuterRadius = state.form.radius + state.form.tube
    const radius = Math.max(
      torusFieldRadiusAtLevel(
        torusDepthById.get(proxy.parentDarkParticleId) ?? 0,
      ) * 0.42,
      stateOuterRadius * 0.1,
    )
    const color = visualFieldParticleColor(sourceField)
    const stateParticle = orbitalById.get(proxy.stateOrbitalParticleId)
    fieldProxies.push({
      color,
      fieldProxyId: proxyId,
      form: {kind: "torus", radius, tube: radius * 0.16},
      material: visualFieldProxyMaterial(
        color,
        "torus",
        stateParticle?.active ?? false,
        stateParticle?.active ?? false,
      ),
      ownerDarkParticleId: proxy.parentDarkParticleId,
      paintOrbitalParticleId: null,
      stateOrbitalParticleId: proxy.stateOrbitalParticleId,
      x: state.x + Math.cos(angle) * radial * stateOuterRadius * 0.78,
      y: state.y + Math.sin(angle) * radial * stateOuterRadius * 0.78,
      z: state.z + elevation * stateOuterRadius * 0.78,
    })
    componentComposer.addFieldProxy(
      fieldProxies[fieldProxies.length - 1]!,
    )
  }

  const relationEdges = buildVisualRelationEdges(manifest, {
    fieldProxies,
    fields,
    orbitals,
  })
  relationEdges.forEach(componentComposer.addRelation)
}
