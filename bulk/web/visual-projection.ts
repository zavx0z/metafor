import type {BulkRenderManifest} from "@metafor/types/bulk/manifest"
import type {
  BulkVisualFieldAlias,
  BulkVisualLineMaterial,
  BulkVisualQuantumMaterial,
  BulkVisualRenderManifest,
} from "@metafor/types/bulk/visual"

const uniqueIds = (
  ids: readonly string[],
  label: string,
): ReadonlySet<string> => {
  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    throw new Error(`Bulk Visual ${label} identity is duplicated`)
  }
  return unique
}

const assertFiniteNumber = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`Bulk Visual ${label} must be finite`)
  }
}

const assertPositiveNumber = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Bulk Visual ${label} must be finite and positive`)
  }
}

const assertColor = (
  color: Readonly<{colorR: number; colorG: number; colorB: number}>,
  label: string,
): void => {
  for (const [channel, value] of [
    ["R", color.colorR],
    ["G", color.colorG],
    ["B", color.colorB],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(
        `Bulk Visual ${label} color ${channel} must be within [0, 1]`,
      )
    }
  }
}

const assertPoint = (
  point: Readonly<{localX: number; localY: number; localZ: number}>,
  label: string,
): void => {
  assertFiniteNumber(point.localX, `${label} localX`)
  assertFiniteNumber(point.localY, `${label} localY`)
  assertFiniteNumber(point.localZ, `${label} localZ`)
}

const assertUnitInterval = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Bulk Visual ${label} must be within [0, 1]`)
  }
}

const assertQuantumMaterial = (
  material: BulkVisualQuantumMaterial,
  label: string,
): void => {
  if (material.kind !== "quantum") {
    throw new Error(`Bulk Visual ${label} must be a quantum material`)
  }
  material.color.forEach((value, index) =>
    assertUnitInterval(value, `${label} color ${index}`)
  )
  assertFiniteNumber(material.glowIntensity, `${label} glow intensity`)
  assertUnitInterval(material.opacity, `${label} opacity`)
  if (
    material.glowIntensity < 0 ||
    material.highlightSize < 0 ||
    !Number.isFinite(material.highlightSize)
  ) {
    throw new Error(`Bulk Visual ${label} has invalid quantum parameters`)
  }
}

const assertQuantumForm = (
  material: BulkVisualQuantumMaterial,
  expected: "sphere" | "torus",
  label: string,
): void => {
  const expectedHighlight = expected === "sphere" ? 1 : 0
  if (
    material.form !== expected ||
    material.highlightSize !== expectedHighlight
  ) {
    throw new Error(
      `Bulk Visual ${label} must use ${expected} quantum form with highlight ${expectedHighlight}`,
    )
  }
}

const assertLineMaterial = (
  material: BulkVisualLineMaterial,
  label: string,
): void => {
  if (
    material.kind !== "line-glow" ||
    !["scene", "overlay"].includes(material.visibilityMode)
  ) {
    throw new Error(`Bulk Visual ${label} must be a line-glow material`)
  }
  ;[...material.color, ...material.glowColor].forEach((value, index) =>
    assertUnitInterval(value, `${label} color ${index}`)
  )
  assertFiniteNumber(material.glowIntensity, `${label} glow intensity`)
  assertUnitInterval(material.opacity, `${label} opacity`)
  if (material.glowIntensity < 0) {
    throw new Error(`Bulk Visual ${label} glow intensity must be non-negative`)
  }
}

const assertMaterialCoverage = (
  projection: BulkVisualRenderManifest,
): void => {
  const exactCoverage = (
    actual: readonly string[],
    expected: readonly string[],
    label: string,
  ): void => {
    const actualIds = uniqueIds(actual, `${label} material`)
    const expectedIds = new Set(expected)
    if (
      actualIds.size !== expectedIds.size ||
      [...expectedIds].some((id) => !actualIds.has(id))
    ) {
      throw new Error(`Bulk Visual ${label} material coverage is not exact`)
    }
  }
  const darkIds = projection.darkMaterials.map((entry) =>
    String(entry.darkParticleId)
  )
  exactCoverage(
    darkIds,
    projection.manifest.darkParticles.map((particle) =>
      String(particle.darkParticleId)
    ),
    "Dark",
  )
  projection.darkMaterials.forEach((entry) => {
    assertQuantumMaterial(
      entry.material,
      `Dark ${entry.darkParticleId} material`,
    )
    assertQuantumForm(
      entry.material,
      "torus",
      `Dark ${entry.darkParticleId} material`,
    )
  })
  exactCoverage(
    projection.fieldMaterials.map((entry) => entry.fieldParticleId),
    projection.manifest.fieldParticles.map((field) => field.fieldParticleId),
    "Field",
  )
  projection.fieldMaterials.forEach((entry) => {
    assertQuantumMaterial(
      entry.material,
      `Field ${entry.fieldParticleId} material`,
    )
    assertQuantumForm(
      entry.material,
      "sphere",
      `Field ${entry.fieldParticleId} material`,
    )
  })
  exactCoverage(
    projection.orbitalMaterials.map((entry) => entry.orbitalParticleId),
    projection.manifest.orbitalParticles.map((orbital) =>
      orbital.orbitalParticleId
    ),
    "orbital",
  )
  const orbitalById = new Map(
    projection.manifest.orbitalParticles.map((particle) =>
      [particle.orbitalParticleId, particle] as const
    ),
  )
  projection.orbitalMaterials.forEach((entry) => {
    assertQuantumMaterial(
      entry.material,
      `orbital ${entry.orbitalParticleId} material`,
    )
    const particle = orbitalById.get(entry.orbitalParticleId)
    assertQuantumForm(
      entry.material,
      particle?.orbitalParticleKind === "state" ? "torus" : "sphere",
      `orbital ${entry.orbitalParticleId} material`,
    )
  })
  exactCoverage(
    projection.fieldProxyMaterials.map((entry) => entry.fieldProxyId),
    projection.manifest.fieldProxies.map((proxy) => proxy.fieldProxyId),
    "Field proxy",
  )
  const proxyTorusIds = new Set(
    projection.fieldProxyTori.map((form) => form.fieldProxyId),
  )
  projection.fieldProxyMaterials.forEach((entry) => {
    assertQuantumMaterial(
      entry.material,
      `Field proxy ${entry.fieldProxyId} material`,
    )
    assertQuantumForm(
      entry.material,
      proxyTorusIds.has(entry.fieldProxyId) ? "torus" : "sphere",
      `Field proxy ${entry.fieldProxyId} material`,
    )
  })
}

const assertSampledPaths = (
  projection: BulkVisualRenderManifest,
): void => {
  const darkIds = new Set(
    projection.manifest.darkParticles.map((particle) =>
      particle.darkParticleId
    ),
  )
  const assertPaths = (
    paths: readonly (BulkVisualRenderManifest["transitionPaths"][number] |
      BulkVisualRenderManifest["relationPaths"][number])[],
    expectedIds: readonly string[],
    id: (path: typeof paths[number]) => string,
    label: string,
  ): void => {
    const ids = uniqueIds(paths.map(id), `${label} sampled path`)
    if (
      ids.size !== expectedIds.length ||
      expectedIds.some((expectedId) => !ids.has(expectedId))
    ) {
      throw new Error(`Bulk Visual ${label} sampled path coverage is not exact`)
    }
    for (const path of paths) {
      if (
        path.batchId.length === 0 ||
        !/^[0-9a-f]{16}$/.test(path.batchFingerprint) ||
        !darkIds.has(path.ownerDarkParticleId) ||
        path.path.length !== 65
      ) {
        throw new Error(
          `Bulk Visual ${label} ${id(path)} has invalid component batch geometry`,
        )
      }
      path.path.forEach((point, index) => {
        assertFiniteNumber(point.x, `${label} ${id(path)} point ${index} x`)
        assertFiniteNumber(point.y, `${label} ${id(path)} point ${index} y`)
        assertFiniteNumber(point.z, `${label} ${id(path)} point ${index} z`)
      })
      assertLineMaterial(path.material, `${label} ${id(path)} material`)
    }
    const batches = new Map<string, typeof paths[number]>()
    for (const path of paths) {
      const first = batches.get(path.batchId)
      if (
        first &&
        (
          first.ownerDarkParticleId !== path.ownerDarkParticleId ||
          first.batchFingerprint !== path.batchFingerprint ||
          JSON.stringify(first.material) !== JSON.stringify(path.material)
        )
      ) {
        throw new Error(
          `Bulk Visual ${label} batch ${path.batchId} is not homogeneous`,
        )
      }
      batches.set(path.batchId, first ?? path)
    }
  }
  assertPaths(
    projection.transitionPaths,
    projection.manifest.transitionChannels.map((channel) =>
      channel.transitionChannelId
    ),
    (path) => "transitionChannelId" in path
      ? path.transitionChannelId
      : path.relationChannelId,
    "Transition",
  )
  const transitionBatchByOwnerAndDirection = new Map<string, string>()
  const transitionDirectionByBatch = new Map<string, boolean>()
  const transitionBatchesByOwner = new Map<number, Set<string>>()
  for (const path of projection.transitionPaths) {
    const direction = transitionDirectionByBatch.get(path.batchId)
    if (direction !== undefined && direction !== path.returning) {
      throw new Error(
        `Bulk Visual Transition batch ${path.batchId} mixes forward and return paths`,
      )
    }
    transitionDirectionByBatch.set(path.batchId, path.returning)
    const ownerDirection =
      `${path.ownerDarkParticleId}:${path.returning ? "return" : "forward"}`
    const directionBatch =
      transitionBatchByOwnerAndDirection.get(ownerDirection)
    if (directionBatch !== undefined && directionBatch !== path.batchId) {
      throw new Error(
        `Bulk Visual Transition owner ${path.ownerDarkParticleId} has more than one ${path.returning ? "return" : "forward"} batch`,
      )
    }
    transitionBatchByOwnerAndDirection.set(ownerDirection, path.batchId)
    const ownerBatches = transitionBatchesByOwner.get(
      path.ownerDarkParticleId,
    ) ?? new Set<string>()
    ownerBatches.add(path.batchId)
    transitionBatchesByOwner.set(path.ownerDarkParticleId, ownerBatches)
  }
  for (const [ownerDarkParticleId, batches] of transitionBatchesByOwner) {
    if (batches.size > 2) {
      throw new Error(
        `Bulk Visual Transition owner ${ownerDarkParticleId} exceeds two component batches`,
      )
    }
  }
  assertPaths(
    projection.relationPaths,
    projection.manifest.relationChannels.map((channel) =>
      channel.relationChannelId
    ),
    (path) => "relationChannelId" in path
      ? path.relationChannelId
      : path.transitionChannelId,
    "relation",
  )
}

const assertRenderGeometry = (
  projection: BulkVisualRenderManifest,
): void => {
  if (
    projection.darkTorusMeshDetail.radialSegments !== 64 ||
    projection.darkTorusMeshDetail.tubularSegments !== 192
  ) {
    throw new Error(
      "Bulk Visual Dark Torus mesh detail must be fixed at 64 × 192",
    )
  }
  if (
    projection.embeddedTorusMeshDetail.radialSegments !== 32 ||
    projection.embeddedTorusMeshDetail.tubularSegments !== 192
  ) {
    throw new Error(
      "Bulk Visual embedded Torus mesh detail must be fixed at 32 × 192",
    )
  }
  if (
    projection.sphereMeshDetail.widthSegments !== 32 ||
    projection.sphereMeshDetail.heightSegments !== 24
  ) {
    throw new Error("Bulk Visual Sphere mesh detail must be fixed at 32 × 24")
  }
  if (
    projection.sourceStats.rootSrc !== projection.manifest.rootSrc ||
    projection.sourceStats.rootSrc.length === 0
  ) {
    throw new Error("Bulk Visual source stats root must match render root")
  }
  for (const [label, count] of [
    ["Dark count", projection.sourceStats.darkParticleCount],
    ["Field count", projection.sourceStats.fieldParticleCount],
    ["orbital count", projection.sourceStats.orbitalParticleCount],
    ["Transition count", projection.sourceStats.transitionChannelCount],
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Bulk Visual source ${label} must be a non-negative integer`)
    }
  }
  for (const particle of projection.manifest.darkParticles) {
    const label = `Dark particle ${particle.darkParticleId}`
    assertPoint(particle, label)
    assertPositiveNumber(particle.torusRadius, `${label} Torus radius`)
    assertPositiveNumber(particle.torusTube, `${label} Torus tube`)
    assertColor(particle, label)
  }
  for (const field of projection.manifest.fieldParticles) {
    const label = `Field ${field.fieldParticleId}`
    assertPoint(field, label)
    assertPositiveNumber(field.sphereRadius, `${label} Sphere radius`)
    assertColor(field, label)
  }
  for (const particle of projection.manifest.orbitalParticles) {
    const label = `orbital ${particle.orbitalParticleId}`
    assertPoint(particle, label)
    assertColor(particle, label)
  }
  for (const proxy of projection.manifest.fieldProxies) {
    const label = `Field proxy ${proxy.fieldProxyId}`
    assertPoint(proxy, label)
    assertColor(proxy, label)
  }
  for (const channel of projection.manifest.transitionChannels) {
    assertColor(channel, `Transition ${channel.transitionChannelId}`)
  }
  for (const channel of projection.manifest.relationChannels) {
    assertColor(channel, `relation ${channel.relationChannelId}`)
  }
  for (const form of projection.orbitalSpheres) {
    assertPositiveNumber(
      form.radius,
      `orbital ${form.orbitalParticleId} Sphere radius`,
    )
  }
  for (const form of projection.orbitalTori) {
    assertPositiveNumber(
      form.radius,
      `orbital ${form.orbitalParticleId} Torus radius`,
    )
    assertPositiveNumber(
      form.tube,
      `orbital ${form.orbitalParticleId} Torus tube`,
    )
  }
  for (const form of projection.fieldProxySpheres) {
    assertPositiveNumber(
      form.radius,
      `Field proxy ${form.fieldProxyId} Sphere radius`,
    )
  }
  for (const form of projection.fieldProxyTori) {
    assertPositiveNumber(
      form.radius,
      `Field proxy ${form.fieldProxyId} Torus radius`,
    )
    assertPositiveNumber(
      form.tube,
      `Field proxy ${form.fieldProxyId} Torus tube`,
    )
  }
}

const assertRenderParents = (manifest: BulkRenderManifest): void => {
  const darkIds = new Set<number>()
  for (const particle of manifest.darkParticles) {
    if (darkIds.has(particle.darkParticleId)) {
      throw new Error(
        `Bulk Visual Dark particle ${particle.darkParticleId} is duplicated`,
      )
    }
    darkIds.add(particle.darkParticleId)
  }
  for (const particle of manifest.darkParticles) {
    if (
      particle.parentDarkParticleId !== null &&
      !darkIds.has(particle.parentDarkParticleId)
    ) {
      throw new Error(
        `Bulk Visual Dark particle ${particle.darkParticleId} has no render parent ${particle.parentDarkParticleId}`,
      )
    }
  }
  const parentById = new Map(manifest.darkParticles.map((particle) =>
    [particle.darkParticleId, particle.parentDarkParticleId] as const
  ))
  const resolved = new Set<number>()
  const visiting = new Set<number>()
  const visit = (id: number): void => {
    if (resolved.has(id)) return
    if (visiting.has(id)) {
      throw new Error(`Bulk Visual Dark parent cycle at ${id}`)
    }
    visiting.add(id)
    const parentId = parentById.get(id)
    if (parentId !== null && parentId !== undefined) visit(parentId)
    visiting.delete(id)
    resolved.add(id)
  }
  for (const id of darkIds) visit(id)
  const assertOwner = (ownerId: number, label: string): void => {
    if (!darkIds.has(ownerId)) {
      throw new Error(`Bulk Visual ${label} has no render parent ${ownerId}`)
    }
  }
  for (const field of manifest.fieldParticles) {
    assertOwner(field.parentDarkParticleId, `Field ${field.fieldParticleId}`)
  }
  for (const particle of manifest.orbitalParticles) {
    assertOwner(
      particle.parentDarkParticleId,
      `orbital ${particle.orbitalParticleId}`,
    )
  }
  for (const proxy of manifest.fieldProxies) {
    assertOwner(
      proxy.parentDarkParticleId,
      `Field proxy ${proxy.fieldProxyId}`,
    )
  }
  for (const channel of manifest.transitionChannels) {
    assertOwner(
      channel.parentDarkParticleId,
      `Transition ${channel.transitionChannelId}`,
    )
  }
  for (const channel of manifest.relationChannels) {
    assertOwner(
      channel.parentDarkParticleId,
      `relation ${channel.relationChannelId}`,
    )
  }
}

/** Fail-closed proof for the geometry-only renderer boundary. */
export const assertBulkVisualProjectionBoundary = (
  projection: BulkVisualRenderManifest,
): void => {
  const manifest = projection.manifest
  assertRenderGeometry(projection)
  assertMaterialCoverage(projection)
  assertSampledPaths(projection)
  if (
    manifest.darkParticles.some((particle) =>
      particle.darkParticleKind === "axion"
    ) ||
    manifest.orbitalParticles.some((particle) =>
      particle.orbitalParticleKind === "axion"
    ) ||
    manifest.relationChannels.some((channel) =>
      channel.relationKind === "axion-read"
    )
  ) {
    throw new Error("Bulk Visual renderer received deferred Axion geometry")
  }
  assertRenderParents(manifest)

  const orbitalIds = uniqueIds(
    manifest.orbitalParticles.map((particle) => particle.orbitalParticleId),
    "orbital",
  )
  const orbitalSphereIds = uniqueIds(
    projection.orbitalSpheres.map((form) => form.orbitalParticleId),
    "orbital Sphere form",
  )
  const orbitalTorusIds = uniqueIds(
    projection.orbitalTori.map((form) => form.orbitalParticleId),
    "orbital Torus form",
  )
  for (const particle of manifest.orbitalParticles) {
    const sphere = orbitalSphereIds.has(particle.orbitalParticleId)
    const torus = orbitalTorusIds.has(particle.orbitalParticleId)
    if (
      Number(sphere) + Number(torus) !== 1 ||
      (particle.orbitalParticleKind === "state") !== torus
    ) {
      throw new Error(
        `Bulk Visual orbital ${particle.orbitalParticleId} must have exactly one semantic form`,
      )
    }
  }
  if (
    [...orbitalSphereIds, ...orbitalTorusIds].some((id) =>
      !orbitalIds.has(id)
    )
  ) {
    throw new Error("Bulk Visual orbital form has no render occurrence")
  }
  const fieldIds = uniqueIds(
    manifest.fieldParticles.map((field) => field.fieldParticleId),
    "Field",
  )
  uniqueIds(
    manifest.transitionChannels.map((channel) =>
      channel.transitionChannelId
    ),
    "Transition",
  )
  for (const channel of manifest.transitionChannels) {
    if (
      !orbitalIds.has(channel.fromOrbitalParticleId) ||
      !orbitalIds.has(channel.toOrbitalParticleId)
    ) {
      throw new Error(
        `Bulk Visual Transition ${channel.transitionChannelId} has unresolved endpoints`,
      )
    }
  }

  const proxyIds = uniqueIds(
    manifest.fieldProxies.map((proxy) => proxy.fieldProxyId),
    "Field proxy",
  )
  const proxySphereIds = uniqueIds(
    projection.fieldProxySpheres.map((form) => form.fieldProxyId),
    "Field proxy Sphere form",
  )
  const proxyTorusIds = uniqueIds(
    projection.fieldProxyTori.map((form) => form.fieldProxyId),
    "Field proxy Torus form",
  )
  for (const id of proxyIds) {
    if (
      Number(proxySphereIds.has(id)) + Number(proxyTorusIds.has(id)) !== 1
    ) {
      throw new Error(
        `Bulk Visual Field proxy ${id} must have exactly one form`,
      )
    }
  }
  if (
    [...proxySphereIds, ...proxyTorusIds].some((id) => !proxyIds.has(id))
  ) {
    throw new Error("Bulk Visual Field proxy form has no render occurrence")
  }
  uniqueIds(
    manifest.relationChannels.map((channel) => channel.relationChannelId),
    "relation",
  )
  const hasEndpoint = (kind: "field" | "field-proxy" | "orbital", id: string):
    boolean => kind === "field"
      ? fieldIds.has(id)
      : kind === "field-proxy"
        ? proxyIds.has(id)
        : orbitalIds.has(id)
  for (const channel of manifest.relationChannels) {
    if (
      !hasEndpoint(channel.fromKind, channel.fromId) ||
      !hasEndpoint(channel.toKind, channel.toId)
    ) {
      throw new Error(
        `Bulk Visual relation ${channel.relationChannelId} has unresolved endpoints`,
      )
    }
  }
}

export const bulkVisualFieldSourceAddress = (
  parentDarkParticleId: number,
  fieldId: number,
): string => `${parentDarkParticleId}:${fieldId}`

export const indexBulkVisualFieldAliases = (
  aliases: readonly BulkVisualFieldAlias[],
): ReadonlyMap<string, string> => {
  const byAddress = new Map<string, string>()
  for (const alias of aliases) {
    const address = bulkVisualFieldSourceAddress(
      alias.sourceParentDarkParticleId,
      alias.sourceFieldId,
    )
    if (byAddress.has(address)) {
      throw new Error(
        `Bulk Visual Field source address ${address} is duplicated`,
      )
    }
    byAddress.set(address, alias.visualFieldParticleId)
  }
  return byAddress
}

export const changedBulkVisualShapeIds = <Value>(
  current: ReadonlyMap<string, Value>,
  next: ReadonlyMap<string, Value>,
  same: (left: Value, right: Value) => boolean,
): ReadonlySet<string> => new Set(
  [...new Set([...current.keys(), ...next.keys()])].filter((id) => {
    const left = current.get(id)
    const right = next.get(id)
    return left === undefined ||
      right === undefined ||
      !same(left, right)
  }),
)

const sameQuantumMaterial = (
  left: BulkVisualQuantumMaterial,
  right: BulkVisualQuantumMaterial,
): boolean =>
  left.kind === right.kind &&
  left.form === right.form &&
  left.glowIntensity === right.glowIntensity &&
  left.highlightSize === right.highlightSize &&
  left.opacity === right.opacity &&
  left.color.every((channel, index) => channel === right.color[index])

/**
 * Detects package-owned material changes that are not necessarily represented
 * by a change in the corresponding flat render record.
 */
export const changedBulkVisualQuantumMaterialIds = (
  current: ReadonlyMap<string, BulkVisualQuantumMaterial>,
  next: ReadonlyMap<string, BulkVisualQuantumMaterial>,
): ReadonlySet<string> =>
  changedBulkVisualShapeIds(current, next, sameQuantumMaterial)
