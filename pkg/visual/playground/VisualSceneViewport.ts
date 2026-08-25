import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  Matrix4,
  Mesh,
  Object3D,
  Renderer,
  Space,
  SphereGeometry,
  Text,
  TextMaterial,
  TorusGeometry,
  type TrueTypeFont,
  Vector3,
  ViewPoint,
} from "@engine/core"
import {loadSharedFont} from "@engine/core/default-font"
import type {
  VisualParticleForm,
  VisualScene,
} from "../src/internal/layout.ts"
import type {
  VisualPayloadEdgeBatch,
  VisualScenePayload,
} from "../src/ScenePayload.ts"
import {visualPayloadHermiteCurve} from "../src/ScenePayload.ts"
import {sampleHermiteEdgeCurve} from "../src/HermiteEdge.ts"
import {SPHERE_MESH_DETAIL} from "../src/MeshDetail.ts"
import {
  DARK_TORUS_MESH_DETAIL,
  EMBEDDED_TORUS_MESH_DETAIL,
} from "../src/Torus.ts"
import {
  createVisualLineMaterial,
  createVisualQuantumMaterial,
  applyVisualLineMaterial,
  applyVisualQuantumMaterial,
} from "./VisualMaterial.ts"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "../src/VisualMaterialSpec.ts"

const BACKGROUND = new Color(0.012, 0.03, 0.05)
const FRAME_PADDING = 1.3
const LABEL_FONT_SIZE_TO_SCENE_RADIUS = 0.03

export type VisualSceneView =
  | "back"
  | "bottom"
  | "front"
  | "left"
  | "right"
  | "side-profile"
  | "top"

export type VisualSceneViewportPose = Readonly<{
  aspect: number
  far: number
  fov: number
  near: number
  position: Readonly<{x: number; y: number; z: number}>
  target: Readonly<{x: number; y: number; z: number}>
  up: Readonly<{x: number; y: number; z: number}>
}>

export type VisualSceneViewport = Readonly<{
  applyScene(scene: VisualScene): void
  capturePng(): Promise<Blob | null>
  dispose(): void
  getPose(): VisualSceneViewportPose
  setSize(width: number, height: number): void
  setView(view: VisualSceneView): void
}>

/**
 * Either source of a complete frame. `scene` is the in-process component scene;
 * `payload` is the serializable form a server can prepare. Exactly one is given.
 */
export type CreateVisualSceneViewportOptions = Readonly<{
  canvas: HTMLCanvasElement
  height: number
  payload?: VisualScenePayload
  scene?: VisualScene
  showLabels?: boolean
  width: number
}>

export type VisualSceneRenderMesh = Readonly<{
  form: VisualParticleForm
  id: string
  material: VisualQuantumMaterial
  meshDetail:
    | Readonly<{
        heightSegments: number
        kind: "sphere"
        widthSegments: number
      }>
    | Readonly<{
        kind: "torus"
        radialSegments: number
        tubularSegments: number
      }>
  role: "dark" | "field" | "field-proxy" | "orbital"
  x: number
  y: number
  z: number
}>

export type VisualSceneRenderPath = Readonly<{
  id: string
  points: readonly Readonly<{x: number; y: number; z: number}>[]
}>

export type VisualSceneRenderLineBatch = Readonly<{
  batchId: string
  kind: "relation" | "transition"
  material: VisualLineMaterial
  ownerDarkParticleId: number
  paths: readonly VisualSceneRenderPath[]
}>

export type VisualSceneRenderLabel = Readonly<{
  color: readonly [number, number, number]
  id: string
  outerRadius: number
  text: string
  x: number
  y: number
  z: number
}>

export type VisualSceneRenderPlan = Readonly<{
  labels: readonly VisualSceneRenderLabel[]
  lineBatches: readonly VisualSceneRenderLineBatch[]
  meshes: readonly VisualSceneRenderMesh[]
}>

export type VisualSceneProfileAxes = Readonly<{
  cameraDirection: Readonly<{x: number; y: number; z: 0}>
  rowDirection: Readonly<{x: number; y: number; z: 0}>
}>

/**
 * Finds the longest unchanged orbital-Torus axis in the scene plane and puts
 * the profile camera exactly perpendicular to it. The camera changes no scene
 * coordinate: it only maximizes the sleeves' horizontal screen separation.
 */
export const visualSceneProfileAxes = (
  plan: VisualSceneRenderPlan,
): VisualSceneProfileAxes => {
  const orbitals = plan.meshes.filter((mesh) =>
    mesh.role === "orbital" && mesh.form.kind === "torus"
  )
  let deltaX = 1
  let deltaY = 0
  let maximumDistanceSquared = 0
  for (let left = 0; left < orbitals.length; left++) {
    for (let right = left + 1; right < orbitals.length; right++) {
      const x = orbitals[right]!.x - orbitals[left]!.x
      const y = orbitals[right]!.y - orbitals[left]!.y
      const distanceSquared = x * x + y * y
      if (distanceSquared <= maximumDistanceSquared) continue
      maximumDistanceSquared = distanceSquared
      deltaX = x
      deltaY = y
    }
  }
  const length = Math.hypot(deltaX, deltaY)
  const rowDirection = Object.freeze({
    x: deltaX / length,
    y: deltaY / length,
    z: 0 as const,
  })
  return Object.freeze({
    cameraDirection: Object.freeze({
      x: rowDirection.y,
      y: -rowDirection.x,
      z: 0 as const,
    }),
    rowDirection,
  })
}

const linePathAppearanceKey = (
  batch: VisualSceneRenderLineBatch,
  path: VisualSceneRenderPath,
): string => JSON.stringify({
  kind: batch.kind,
  ownerDarkParticleId: batch.ownerDarkParticleId,
  pathId: path.id,
})

const appearanceOnlyGeometry = (plan: VisualSceneRenderPlan): string =>
  JSON.stringify({
    labels: plan.labels,
    linePaths: plan.lineBatches.flatMap((batch) => batch.paths.map((path) => ({
      id: path.id,
      kind: batch.kind,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      points: path.points,
    }))).sort((left, right) => left.id.localeCompare(right.id)),
    meshes: plan.meshes.map((mesh) => ({
      form: mesh.form,
      id: mesh.id,
      meshDetail: mesh.meshDetail,
      role: mesh.role,
      x: mesh.x,
      y: mesh.y,
      z: mesh.z,
    })),
  })

const sphereDetail = Object.freeze({
  heightSegments: SPHERE_MESH_DETAIL.heightSegments,
  kind: "sphere" as const,
  widthSegments: SPHERE_MESH_DETAIL.widthSegments,
})

const darkTorusDetail = Object.freeze({
  kind: "torus" as const,
  radialSegments: DARK_TORUS_MESH_DETAIL.radialSegments,
  tubularSegments: DARK_TORUS_MESH_DETAIL.tubularSegments,
})

const embeddedTorusDetail = Object.freeze({
  kind: "torus" as const,
  radialSegments: EMBEDDED_TORUS_MESH_DETAIL.radialSegments,
  tubularSegments: EMBEDDED_TORUS_MESH_DETAIL.tubularSegments,
})

const fieldIdentity = (fieldParticleIds: readonly string[]): string =>
  fieldParticleIds.map((id) => `${id.length}:${id}`).join("")

const renderMesh = (
  value: Readonly<{
    form: VisualParticleForm
    id: string
    material: VisualQuantumMaterial
    role: VisualSceneRenderMesh["role"]
    x: number
    y: number
    z: number
  }>,
): VisualSceneRenderMesh => Object.freeze({
  ...value,
  form: Object.freeze({...value.form}),
  meshDetail: value.form.kind === "sphere"
    ? sphereDetail
    : value.role === "dark"
      ? darkTorusDetail
      : embeddedTorusDetail,
})

const renderPath = (
  id: string,
  points: readonly Readonly<{x: number; y: number; z: number}>[],
): VisualSceneRenderPath => {
  if (points.length < 2) {
    throw new Error(`Visual viewport path ${id} has fewer than two points`)
  }
  return Object.freeze({id, points})
}

/**
 * Resolves a payload's local-frame positions into world positions.
 *
 * A payload stores each entity relative to its owner Torus, and each Torus
 * relative to its parent, so world placement is one walk down the parent chain.
 */
const resolveWorldTorusCenters = (
  payload: VisualScenePayload,
): ReadonlyMap<number, Readonly<{x: number; y: number; z: number}>> => {
  const byId = new Map(
    payload.tori.map((torus) => [torus.darkParticleId, torus] as const),
  )
  const centers = new Map<
    number,
    Readonly<{x: number; y: number; z: number}>
  >()
  const resolve = (
    id: number,
    seen: ReadonlySet<number>,
  ): Readonly<{x: number; y: number; z: number}> => {
    const known = centers.get(id)
    if (known) return known
    const torus = byId.get(id)
    if (!torus) throw new Error(`Visual payload Torus ${id} is absent`)
    if (seen.has(id)) {
      throw new Error(`Visual payload Torus ${id} is part of a cycle`)
    }
    const parentId = torus.parentDarkParticleId
    const origin = parentId === null
      ? {x: 0, y: 0, z: 0}
      : resolve(parentId, new Set([...seen, id]))
    const center = Object.freeze({
      x: origin.x + torus.localX,
      y: origin.y + torus.localY,
      z: origin.z + torus.localZ,
    })
    centers.set(id, center)
    return center
  }
  for (const torus of payload.tori) resolve(torus.darkParticleId, new Set())
  return centers
}

/**
 * Pure one-shot conversion from the serializable payload to GPU records.
 *
 * This is the thin-renderer entry: the payload already carries every form,
 * material and compact curve. It resolves owner-local coordinates and evaluates
 * the versioned Hermite law on the browser CPU; no layout or batching occurs.
 */
export const buildVisualPayloadRenderPlan = (
  payload: VisualScenePayload,
): VisualSceneRenderPlan => {
  const centers = resolveWorldTorusCenters(payload)
  const ownerCenter = (
    ownerDarkParticleId: number,
  ): Readonly<{x: number; y: number; z: number}> => {
    const center = centers.get(ownerDarkParticleId)
    if (!center) {
      throw new Error(
        `Visual payload owner ${ownerDarkParticleId} has no resolved center`,
      )
    }
    return center
  }

  const labels = payload.tori.flatMap((torus) => {
    if (torus.src === null) return []
    const center = ownerCenter(torus.darkParticleId)
    return [Object.freeze({
      color: Object.freeze([...torus.color]) as
        readonly [number, number, number],
      id: `dark-label:${torus.darkParticleId}`,
      outerRadius: torus.radius + torus.tube,
      text: torus.src,
      x: center.x,
      y: center.y,
      z: center.z,
    })]
  })

  const meshes = [
    ...payload.tori.map((torus) => {
      const center = ownerCenter(torus.darkParticleId)
      return renderMesh({
        form: {kind: "torus", radius: torus.radius, tube: torus.tube},
        id: `dark:${torus.darkParticleId}`,
        material: torus.material,
        role: "dark",
        x: center.x,
        y: center.y,
        z: center.z,
      })
    }),
    ...payload.fields.map((field) => {
      const owner = ownerCenter(field.ownerDarkParticleId)
      return renderMesh({
        form: {kind: "sphere", radius: field.radius},
        id: `field:${field.fieldParticleId}`,
        material: field.material,
        role: "field",
        x: owner.x + field.localX,
        y: owner.y + field.localY,
        z: owner.z + field.localZ,
      })
    }),
    ...payload.orbitals.map((orbital) => {
      const owner = ownerCenter(orbital.ownerDarkParticleId)
      return renderMesh({
        form: orbital.form,
        id: `orbital:${orbital.orbitalParticleId}`,
        material: orbital.material,
        role: "orbital",
        x: owner.x + orbital.localX,
        y: owner.y + orbital.localY,
        z: owner.z + orbital.localZ,
      })
    }),
    ...payload.fieldProxies.map((proxy) => {
      const owner = ownerCenter(proxy.ownerDarkParticleId)
      return renderMesh({
        form: proxy.form,
        id: `field-proxy:${proxy.fieldProxyId}`,
        material: proxy.material,
        role: "field-proxy",
        x: owner.x + proxy.localX,
        y: owner.y + proxy.localY,
        z: owner.z + proxy.localZ,
      })
    }),
  ]

  const payloadBatch = (
    batch: VisualPayloadEdgeBatch,
    kind: "relation" | "transition",
  ): VisualSceneRenderLineBatch => {
    const owner = ownerCenter(batch.ownerDarkParticleId)
    return Object.freeze({
      batchId: batch.batchId,
      kind,
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      paths: Object.freeze(batch.paths.map((entry) => {
        const points: Array<Readonly<{x: number; y: number; z: number}>> = []
        for (const [curveIndex, compactCurve] of entry.curves.entries()) {
          const curvePoints = sampleHermiteEdgeCurve(
            visualPayloadHermiteCurve(compactCurve),
          )
          for (const point of curvePoints.slice(curveIndex === 0 ? 0 : 1)) {
            points.push(Object.freeze({
              x: owner.x + point.x,
              y: owner.y + point.y,
              z: owner.z + point.z,
            }))
          }
        }
        return renderPath(entry.channelId, Object.freeze(points))
      })),
    })
  }

  return Object.freeze({
    labels: Object.freeze(labels),
    lineBatches: Object.freeze([
      ...payload.transitionBatches.map((batch) =>
        payloadBatch(batch, "transition")
      ),
      ...payload.relationBatches.map((batch) =>
        payloadBatch(batch, "relation")
      ),
    ]),
    meshes: Object.freeze(meshes),
  })
}

/**
 * Pure one-shot conversion from the immutable component scene to GPU records.
 * It preserves every package placement, material and sampled path; no layout,
 * endpoint lookup, curve building or renderer-owned batching occurs here.
 */
export const buildVisualSceneRenderPlan = (
  scene: VisualScene,
): VisualSceneRenderPlan => {
  const labels = scene.tori.flatMap((torus) =>
    torus.src === null
      ? []
      : [Object.freeze({
          color: Object.freeze([...torus.color]) as
            readonly [number, number, number],
          id: `dark-label:${torus.darkParticleId}`,
          outerRadius: torus.radius + torus.tube,
          text: torus.src,
          x: torus.x,
          y: torus.y,
          z: torus.z,
        })]
  )
  const meshes = [
    ...scene.tori.map((torus) => renderMesh({
      form: {
        kind: "torus",
        radius: torus.radius,
        tube: torus.tube,
      },
      id: `dark:${torus.darkParticleId}`,
      material: torus.material,
      role: "dark",
      x: torus.x,
      y: torus.y,
      z: torus.z,
    })),
    ...scene.fields.map((field) => renderMesh({
      form: {kind: "sphere", radius: field.radius},
      id: `field:${fieldIdentity(field.fieldParticleIds)}`,
      material: field.material,
      role: "field",
      x: field.x,
      y: field.y,
      z: field.z,
    })),
    ...scene.orbitals.map((orbital) => renderMesh({
      form: orbital.form,
      id: `orbital:${orbital.orbitalParticleId}`,
      material: orbital.material,
      role: "orbital",
      x: orbital.x,
      y: orbital.y,
      z: orbital.z,
    })),
    ...scene.fieldProxies.map((proxy) => renderMesh({
      form: proxy.form,
      id: `field-proxy:${proxy.fieldProxyId}`,
      material: proxy.material,
      role: "field-proxy",
      x: proxy.x,
      y: proxy.y,
      z: proxy.z,
    })),
  ]
  const lineBatches = [
    ...scene.stateEdgeBatches.map((batch) => Object.freeze({
      batchId: batch.batchId,
      kind: "transition" as const,
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      paths: Object.freeze(batch.edges.map((edge) =>
        renderPath(
          edge.transitionChannelId ?? edge.edgeId,
          edge.path,
        )
      )),
    })),
    ...scene.relationEdgeBatches.map((batch) => Object.freeze({
      batchId: batch.batchId,
      kind: "relation" as const,
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      paths: Object.freeze(batch.edges.map((edge) =>
        renderPath(edge.relationChannelId, edge.path)
      )),
    })),
  ]
  return Object.freeze({
    labels: Object.freeze(labels),
    lineBatches: Object.freeze(lineBatches),
    meshes: Object.freeze(meshes),
  })
}

type GeometryCache = Readonly<{
  spheres: Map<string, SphereGeometry>
  tori: Map<string, TorusGeometry>
}>

const geometryKey = (...values: number[]): string =>
  values.map((value) => value.toPrecision(12)).join(":")

const meshGeometry = (
  cache: GeometryCache,
  mesh: VisualSceneRenderMesh,
): SphereGeometry | TorusGeometry => {
  if (mesh.form.kind === "sphere") {
    if (mesh.meshDetail.kind !== "sphere") {
      throw new Error(`Visual viewport mesh ${mesh.id} has mismatched detail`)
    }
    const key = geometryKey(
      mesh.form.radius,
      mesh.meshDetail.widthSegments,
      mesh.meshDetail.heightSegments,
    )
    const cached = cache.spheres.get(key)
    if (cached) return cached
    const geometry = new SphereGeometry({
      radius: mesh.form.radius,
      widthSegments: mesh.meshDetail.widthSegments,
      heightSegments: mesh.meshDetail.heightSegments,
    })
    cache.spheres.set(key, geometry)
    return geometry
  }
  if (mesh.meshDetail.kind !== "torus") {
    throw new Error(`Visual viewport mesh ${mesh.id} has mismatched detail`)
  }
  const key = geometryKey(
    mesh.form.radius,
    mesh.form.tube,
    mesh.meshDetail.radialSegments,
    mesh.meshDetail.tubularSegments,
  )
  const cached = cache.tori.get(key)
  if (cached) return cached
  const geometry = new TorusGeometry({
    radius: mesh.form.radius,
    tube: mesh.form.tube,
    radialSegments: mesh.meshDetail.radialSegments,
    tubularSegments: mesh.meshDetail.tubularSegments,
  })
  cache.tori.set(key, geometry)
  return geometry
}

const lineGeometry = (
  paths: readonly VisualSceneRenderPath[],
): BufferGeometry => {
  const segmentCount = paths.reduce(
    (total, path) => total + path.points.length - 1,
    0,
  )
  const positions = new Float32Array(segmentCount * 6)
  let offset = 0
  for (const path of paths) {
    for (let index = 1; index < path.points.length; index++) {
      const from = path.points[index - 1]!
      const to = path.points[index]!
      positions[offset++] = from.x
      positions[offset++] = from.y
      positions[offset++] = from.z
      positions[offset++] = to.x
      positions[offset++] = to.y
      positions[offset++] = to.z
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))
  return geometry
}

const fitPlan = (
  plan: VisualSceneRenderPlan,
  aspect: number,
  fov: number,
): Readonly<{distance: number; radius: number; target: Vector3}> => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  const include = (
    x: number,
    y: number,
    z: number,
    radiusX = 0,
    radiusY = radiusX,
    radiusZ = radiusX,
  ): void => {
    minX = Math.min(minX, x - radiusX)
    minY = Math.min(minY, y - radiusY)
    minZ = Math.min(minZ, z - radiusZ)
    maxX = Math.max(maxX, x + radiusX)
    maxY = Math.max(maxY, y + radiusY)
    maxZ = Math.max(maxZ, z + radiusZ)
  }
  for (const mesh of plan.meshes) {
    if (mesh.form.kind === "sphere") {
      include(mesh.x, mesh.y, mesh.z, mesh.form.radius)
    } else {
      include(
        mesh.x,
        mesh.y,
        mesh.z,
        mesh.form.radius + mesh.form.tube,
        mesh.form.radius + mesh.form.tube,
        mesh.form.tube,
      )
    }
  }
  for (const batch of plan.lineBatches) {
    for (const path of batch.paths) {
      for (const point of path.points) {
        include(point.x, point.y, point.z)
      }
    }
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    minX = minY = minZ = -1
    maxX = maxY = maxZ = 1
  }
  const target = new Vector3(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  )
  const radius = Math.max(
    1,
    new Vector3(maxX, maxY, maxZ).sub(target).length(),
  )
  const verticalTan = Math.tan(fov / 2)
  const horizontalTan = verticalTan * Math.max(0.1, aspect)
  return {
    distance: radius /
      Math.max(0.01, Math.min(verticalTan, horizontalTan)) *
      FRAME_PADDING,
    radius,
    target,
  }
}

type LabelTracker = Readonly<{
  anchor: Vector3
  container: Object3D
  offset: number
}>

const textCenter = (text: Text): Readonly<{x: number; y: number}> => {
  const positions = text.coverGeometry.attributes.position?.array
  if (!positions || positions.length < 3) return {x: 0, y: 0}
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < positions.length; index += 3) {
    const x = Number(positions[index])
    const y = Number(positions[index + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    return {x: 0, y: 0}
  }
  return {x: (minX + maxX) / 2, y: (minY + maxY) / 2}
}

const labelColor = (
  color: readonly [number, number, number],
): Color => new Color(
  0.55 + color[0] * 0.45,
  0.55 + color[1] * 0.45,
  0.55 + color[2] * 0.45,
)

const addLabel = (
  space: Space,
  font: TrueTypeFont,
  record: VisualSceneRenderLabel,
  fontSize: number,
): LabelTracker => {
  const text = new Text(
    record.text,
    font,
    fontSize,
    new TextMaterial({
      color: labelColor(record.color),
      opacity: 1,
      depthWrite: false,
    }),
  )
  const center = textCenter(text)
  text.position.set(-center.x, -center.y, 0)
  text.frustumCulled = false
  text.updateMatrix()
  const container = new Object3D()
  container.frustumCulled = false
  container.add(text)
  container.updateMatrix()
  space.add(container)
  return {
    anchor: new Vector3(record.x, record.y, record.z),
    container,
    offset: record.outerRadius + fontSize * 0.75,
  }
}

export const createVisualSceneViewport = async ({
  canvas,
  height,
  payload,
  scene,
  showLabels = true,
  width,
}: CreateVisualSceneViewportOptions): Promise<VisualSceneViewport> => {
  if ((scene === undefined) === (payload === undefined)) {
    throw new Error(
      "Visual viewport requires exactly one of scene or payload",
    )
  }
  let plan = scene !== undefined
    ? buildVisualSceneRenderPlan(scene)
    : buildVisualPayloadRenderPlan(payload!)
  const renderer = new Renderer()
  await renderer.init(canvas)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  renderer.setSize(width, height)
  const space = new Space()
  space.background = BACKGROUND.clone()
  const geometryCache: GeometryCache = {
    spheres: new Map(),
    tori: new Map(),
  }
  const lineGeometries: BufferGeometry[] = []
  const meshMaterials = new Map<
    string,
    ReturnType<typeof createVisualQuantumMaterial>
  >()
  const lineMaterials = new Map<
    string,
    ReturnType<typeof createVisualLineMaterial>
  >()

  for (const record of plan.meshes) {
    const material = createVisualQuantumMaterial(record.material)
    meshMaterials.set(record.id, material)
    const node = new Mesh(
      meshGeometry(geometryCache, record),
      material,
    )
    node.position.set(record.x, record.y, record.z)
    node.updateMatrix()
    space.add(node)
  }
  for (const batch of plan.lineBatches) {
    for (const path of batch.paths) {
      const geometry = lineGeometry([path])
      lineGeometries.push(geometry)
      const material = createVisualLineMaterial(batch.material)
      lineMaterials.set(linePathAppearanceKey(batch, path), material)
      const line = new LineSegments(geometry, material)
      line.updateMatrix()
      space.add(line)
    }
  }

  const fov = Math.PI / 3.2
  const fit = fitPlan(plan, width / Math.max(1, height), fov)
  const viewPoint = new ViewPoint({
    element: canvas,
    far: Math.max(10000, fit.distance + fit.radius * 4),
    fov,
    near: 0.01,
    position: {
      x: fit.target.x,
      y: fit.target.y,
      z: fit.target.z + fit.distance,
    },
    target: fit.target,
  })
  viewPoint.getUp().set(0, 1, 0)
  viewPoint.setAspectRatio(width / Math.max(1, height))
  viewPoint.update()

  const labels: LabelTracker[] = []
  const labelFontSize = fit.radius * LABEL_FONT_SIZE_TO_SCENE_RADIUS
  if (showLabels && plan.labels.length > 0) {
    const font = await loadSharedFont(
      "/engine-static/jetbrains-mono-bold.ttf",
    )
    labels.push(...plan.labels.map((label) =>
      addLabel(space, font, label, labelFontSize)
    ))
  }
  const labelBasis = new Matrix4()
  const labelNormal = new Vector3()
  const labelRight = new Vector3()
  const labelUp = new Vector3()
  const labelOffset = new Vector3()
  const updateLabels = (): void => {
    for (const label of labels) {
      labelNormal.copy(viewPoint.position).sub(label.anchor)
      if (labelNormal.length() < 1e-6) labelNormal.set(0, 0, 1)
      else labelNormal.normalize()
      labelUp.copy(viewPoint.getUp()).normalize()
      labelRight.crossVectors(labelUp, labelNormal)
      if (labelRight.length() < 1e-6) {
        labelUp.set(0, 1, 0)
        labelRight.crossVectors(labelUp, labelNormal)
      }
      labelRight.normalize()
      labelUp.crossVectors(labelNormal, labelRight).normalize()
      label.container.position
        .copy(label.anchor)
        .add(labelOffset.copy(labelUp).multiplyScalar(label.offset))
        .add(labelOffset.copy(labelNormal).multiplyScalar(labelFontSize * 0.2))
      const elements = labelBasis.elements
      elements[0] = labelRight.x
      elements[1] = labelRight.y
      elements[2] = labelRight.z
      elements[3] = 0
      elements[4] = labelUp.x
      elements[5] = labelUp.y
      elements[6] = labelUp.z
      elements[7] = 0
      elements[8] = labelNormal.x
      elements[9] = labelNormal.y
      elements[10] = labelNormal.z
      elements[11] = 0
      elements[12] = 0
      elements[13] = 0
      elements[14] = 0
      elements[15] = 1
      label.container.quaternion.setFromRotationMatrix(labelBasis)
      label.container.updateMatrix()
    }
  }

  let disposed = false
  let frame = 0
  let dragging = false
  const render = (): void => {
    frame = 0
    if (disposed) return
    updateLabels()
    space.updateWorldMatrix()
    renderer.render(space, viewPoint)
  }
  const requestRender = (): void => {
    if (disposed || frame !== 0) return
    frame = requestAnimationFrame(render)
  }
  const handleMouseDown = (): void => {
    dragging = true
    requestRender()
  }
  const handleMouseMove = (): void => {
    if (dragging) requestRender()
  }
  const handleMouseUp = (): void => {
    dragging = false
    requestRender()
  }
  const handleViewChange = (): void => requestRender()
  canvas.addEventListener("mousedown", handleMouseDown)
  canvas.addEventListener("wheel", handleViewChange)
  canvas.addEventListener("touchstart", handleViewChange)
  canvas.addEventListener("touchmove", handleViewChange)
  canvas.addEventListener("touchend", handleViewChange)
  document.addEventListener("mousemove", handleMouseMove)
  document.addEventListener("mouseup", handleMouseUp)
  requestRender()

  return Object.freeze({
    applyScene(nextScene: VisualScene) {
      if (disposed) return
      const nextPlan = buildVisualSceneRenderPlan(nextScene)
      if (appearanceOnlyGeometry(nextPlan) !== appearanceOnlyGeometry(plan)) {
        throw new Error(
          "Visual viewport appearance update attempted to change geometry",
        )
      }
      for (const record of nextPlan.meshes) {
        const material = meshMaterials.get(record.id)
        if (!material) {
          throw new Error(`Visual viewport mesh ${record.id} is absent`)
        }
        applyVisualQuantumMaterial(material, record.material)
      }
      for (const batch of nextPlan.lineBatches) {
        for (const path of batch.paths) {
          const appearanceKey = linePathAppearanceKey(batch, path)
          const material = lineMaterials.get(appearanceKey)
          if (!material) {
            throw new Error(
              `Visual viewport line path ${appearanceKey} is absent`,
            )
          }
          applyVisualLineMaterial(material, batch.material)
        }
      }
      plan = nextPlan
      requestRender()
    },
    async capturePng() {
      if (disposed) return null
      return await renderer.captureLastPresentedFramePng()
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (frame !== 0) cancelAnimationFrame(frame)
      viewPoint.dispose()
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("wheel", handleViewChange)
      canvas.removeEventListener("touchstart", handleViewChange)
      canvas.removeEventListener("touchmove", handleViewChange)
      canvas.removeEventListener("touchend", handleViewChange)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      const geometries = new Set<BufferGeometry>([
        ...geometryCache.spheres.values(),
        ...geometryCache.tori.values(),
        ...lineGeometries,
      ])
      for (const geometry of geometries) {
        renderer.invalidateGeometry(geometry)
      }
      geometryCache.spheres.clear()
      geometryCache.tori.clear()
      meshMaterials.clear()
      lineMaterials.clear()
      lineGeometries.length = 0
    },
    getPose() {
      const target = viewPoint.getTarget()
      const up = viewPoint.getUp()
      return {
        aspect: viewPoint.aspect,
        far: viewPoint.far,
        fov: viewPoint.fov,
        near: viewPoint.near,
        position: {
          x: viewPoint.position.x,
          y: viewPoint.position.y,
          z: viewPoint.position.z,
        },
        target: {x: target.x, y: target.y, z: target.z},
        up: {x: up.x, y: up.y, z: up.z},
      }
    },
    setSize(nextWidth: number, nextHeight: number) {
      if (disposed) return
      const safeWidth = Math.max(1, nextWidth)
      const safeHeight = Math.max(1, nextHeight)
      renderer.setSize(safeWidth, safeHeight)
      viewPoint.setAspectRatio(safeWidth / safeHeight)
      viewPoint.update()
      requestRender()
    },
    setView(view: VisualSceneView) {
      if (disposed) return
      const target = viewPoint.getTarget()
      const distance = Math.max(
        viewPoint.position.clone().sub(target).length(),
        1,
      )
      const direction = new Vector3()
      const up = viewPoint.getUp()
      switch (view) {
        case "top":
          direction.set(0, 0, 1)
          up.set(0, 1, 0)
          break
        case "bottom":
          direction.set(0, 0, -1)
          up.set(0, 1, 0)
          break
        case "front":
          direction.set(0, -1, 0)
          up.set(0, 0, 1)
          break
        case "back":
          direction.set(0, 1, 0)
          up.set(0, 0, 1)
          break
        case "right":
          direction.set(1, 0, 0)
          up.set(0, 0, 1)
          break
        case "left":
          direction.set(-1, 0, 0)
          up.set(0, 0, 1)
          break
        case "side-profile": {
          const profile = visualSceneProfileAxes(plan)
          direction.set(
            profile.cameraDirection.x,
            profile.cameraDirection.y,
            0,
          )
          up.set(0, 0, 1)
          break
        }
      }
      viewPoint.position.copy(target).add(
        direction.multiplyScalar(distance),
      )
      viewPoint.update()
      requestRender()
    },
  })
}
