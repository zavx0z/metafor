import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  Mesh,
  Renderer,
  Space,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  ViewPoint,
} from "@metafor/engine"
import type {
  VisualParticleForm,
  VisualScene,
} from "./internal/layout.ts"
import {SPHERE_MESH_DETAIL} from "./MeshDetail.ts"
import {
  DARK_TORUS_MESH_DETAIL,
  EMBEDDED_TORUS_MESH_DETAIL,
} from "./Torus.ts"
import {
  createVisualLineMaterial,
  createVisualQuantumMaterial,
} from "./VisualMaterial.ts"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "./VisualMaterialSpec.ts"

const BACKGROUND = new Color(0.012, 0.03, 0.05)
const FRAME_PADDING = 1.3

export type VisualSceneView =
  | "back"
  | "bottom"
  | "front"
  | "left"
  | "right"
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
  capturePng(): Promise<Blob | null>
  dispose(): void
  getPose(): VisualSceneViewportPose
  setSize(width: number, height: number): void
  setView(view: VisualSceneView): void
}>

export type CreateVisualSceneViewportOptions = Readonly<{
  canvas: HTMLCanvasElement
  height: number
  scene: VisualScene
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

export type VisualSceneRenderPlan = Readonly<{
  lineBatches: readonly VisualSceneRenderLineBatch[]
  meshes: readonly VisualSceneRenderMesh[]
}>

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
 * Pure one-shot conversion from the immutable component scene to GPU records.
 * It preserves every package placement, material and sampled path; no layout,
 * endpoint lookup, curve building or renderer-owned batching occurs here.
 */
export const buildVisualSceneRenderPlan = (
  scene: VisualScene,
): VisualSceneRenderPlan => {
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
  batch: VisualSceneRenderLineBatch,
): BufferGeometry => {
  const segmentCount = batch.paths.reduce(
    (total, path) => total + path.points.length - 1,
    0,
  )
  const positions = new Float32Array(segmentCount * 6)
  let offset = 0
  for (const path of batch.paths) {
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

export const createVisualSceneViewport = async ({
  canvas,
  height,
  scene,
  width,
}: CreateVisualSceneViewportOptions): Promise<VisualSceneViewport> => {
  const plan = buildVisualSceneRenderPlan(scene)
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
  const materialCache = new Map<
    string,
    ReturnType<typeof createVisualQuantumMaterial>
  >()

  for (const record of plan.meshes) {
    const materialKey = JSON.stringify(record.material)
    let material = materialCache.get(materialKey)
    if (!material) {
      material = createVisualQuantumMaterial(record.material)
      materialCache.set(materialKey, material)
    }
    const node = new Mesh(
      meshGeometry(geometryCache, record),
      material,
    )
    node.position.set(record.x, record.y, record.z)
    node.updateMatrix()
    space.add(node)
  }
  for (const batch of plan.lineBatches) {
    const geometry = lineGeometry(batch)
    lineGeometries.push(geometry)
    const line = new LineSegments(
      geometry,
      createVisualLineMaterial(batch.material),
    )
    line.updateMatrix()
    space.add(line)
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

  let disposed = false
  let frame = 0
  let dragging = false
  const render = (): void => {
    frame = 0
    if (disposed) return
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
      }
      viewPoint.position.copy(target).add(
        direction.multiplyScalar(distance),
      )
      viewPoint.update()
      requestRender()
    },
  })
}
