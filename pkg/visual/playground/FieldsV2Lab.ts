import type {
  BulkFieldParticle,
  BulkManifest,
  BulkRenderDarkParticle,
} from "@metafor/types/bulk/manifest"
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  Renderer,
  Space,
  Text,
  TextMaterial,
  TorusGeometry,
  TrueTypeFont,
  ViewPoint,
} from "@metafor/engine"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import {
  visualDarkParticleColor,
  visualFieldParticleColor,
} from "../src/SemanticVisual.ts"
import type {StateGraph} from "../src/StateGraph.ts"
import {
  DARK_TORUS_MESH_DETAIL,
  resolveEmptyTorusForm,
  type TorusMeshDetail,
} from "../src/Torus.ts"
import {
  visualContextTorusMaterial,
  type VisualQuantumMaterial,
} from "../src/VisualMaterialSpec.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"
import {createQuantumFilmMaterial} from "./QuantumFilm.ts"
import {buildStateGraphFieldsStand} from "./StateGraphFieldsLab.ts"

export const FIELDS_V2_SLUG = "analysis-fields-v2"
export const FIELDS_V2_RING_WIDTH = 2.6
export const FIELDS_V2_RING_GAP = 0.5
export const FIELDS_V2_RING_START_GAP = FIELDS_V2_RING_GAP
export const FIELDS_V2_TEXT_SIZE = 1.65

export type FieldsV2RingPlacement = Readonly<{
  field: BulkFieldParticle
  innerRadius: number
  outerRadius: number
  radius: number
}>

export type FieldsV2Source = Readonly<{
  fields: readonly BulkFieldParticle[]
  graph: StateGraph
  manifest: BulkManifest
  material: VisualQuantumMaterial
  meshDetail: TorusMeshDetail
  root: BulkRenderDarkParticle
}>

export type FieldsV2Lab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
}>

export const layoutFieldsV2Rings = (
  fields: readonly BulkFieldParticle[],
  torusOuterRadius: number,
): readonly FieldsV2RingPlacement[] => Object.freeze(fields.map(
  (field, index) => {
    const innerRadius = torusOuterRadius + FIELDS_V2_RING_START_GAP +
      index * (FIELDS_V2_RING_WIDTH + FIELDS_V2_RING_GAP)
    return Object.freeze({
      field,
      innerRadius,
      outerRadius: innerRadius + FIELDS_V2_RING_WIDTH,
      radius: innerRadius + FIELDS_V2_RING_WIDTH / 2,
    })
  },
))

export const fieldsV2FieldText = (field: BulkFieldParticle): string =>
  `${field.fieldLabel} · ${field.valueText ?? "∅"}`

const createAnnulusGeometry = (
  innerRadius: number,
  outerRadius: number,
  segments = 192,
): BufferGeometry => {
  const positions = new Float32Array(segments * 2 * 3)
  const normals = new Float32Array(segments * 2 * 3)
  const indices = new Uint16Array(segments * 6)
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const innerOffset = index * 6
    positions[innerOffset] = cosine * innerRadius
    positions[innerOffset + 1] = sine * innerRadius
    positions[innerOffset + 2] = 0
    positions[innerOffset + 3] = cosine * outerRadius
    positions[innerOffset + 4] = sine * outerRadius
    positions[innerOffset + 5] = 0
    normals[innerOffset + 2] = 1
    normals[innerOffset + 5] = 1

    const next = (index + 1) % segments
    const indexOffset = index * 6
    indices[indexOffset] = index * 2
    indices[indexOffset + 1] = index * 2 + 1
    indices[indexOffset + 2] = next * 2
    indices[indexOffset + 3] = index * 2 + 1
    indices[indexOffset + 4] = next * 2 + 1
    indices[indexOffset + 5] = next * 2
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new BufferAttribute(normals, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return geometry
}

const textBounds = (
  geometry: BufferGeometry,
): Readonly<{centerX: number; centerY: number}> => {
  const positions = geometry.attributes.position?.array
  if (!positions || positions.length < 3) return {centerX: 0, centerY: 0}
  let minimumX = Number.POSITIVE_INFINITY
  let maximumX = Number.NEGATIVE_INFINITY
  let minimumY = Number.POSITIVE_INFINITY
  let maximumY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < positions.length; index += 3) {
    minimumX = Math.min(minimumX, Number(positions[index]))
    maximumX = Math.max(maximumX, Number(positions[index]))
    minimumY = Math.min(minimumY, Number(positions[index + 1]))
    maximumY = Math.max(maximumY, Number(positions[index + 1]))
  }
  return {
    centerX: (minimumX + maximumX) / 2,
    centerY: (minimumY + maximumY) / 2,
  }
}

const bendTextGeometryToRing = (
  geometry: BufferGeometry,
  radius: number,
  center: Readonly<{centerX: number; centerY: number}>,
): void => {
  const position = geometry.attributes.position
  if (!position) return
  const values = position.array
  for (let index = 0; index < values.length; index += 3) {
    const along = Number(values[index]) - center.centerX
    const radialOffset = Number(values[index + 1]) - center.centerY
    const angle = Math.PI / 2 - along / radius
    const vertexRadius = radius + radialOffset
    values[index] = Math.cos(angle) * vertexRadius
    values[index + 1] = Math.sin(angle) * vertexRadius
    values[index + 2] = 0.3 + Number(values[index + 2])
  }
  position.needsUpdate = true
  geometry.boundingSphere = null
}

const labelColor = (
  color: readonly [number, number, number],
): Color => new Color(
  0.58 + color[0] * 0.42,
  0.58 + color[1] * 0.42,
  0.58 + color[2] * 0.42,
)

/**
 * Keeps the real root lada and its owned Fields from the playground snapshot.
 * Causal forms are deliberately excluded. V2 keeps the saved Fields for a
 * separate placement law, while the root Torus remains the standard empty
 * baseline and never changes with their count.
 */
export const buildFieldsV2Source = (
  lifecycle: BulkVisualSceneLifecycle,
): FieldsV2Source => {
  const stand = buildStateGraphFieldsStand(lifecycle)
  const manifest: BulkManifest = {
    rootSrc: stand.manifest.rootSrc,
    darkParticles: [...stand.manifest.darkParticles],
    fieldParticles: [...stand.manifest.fieldParticles],
    orbitalParticles: [],
    transitionChannels: [],
    fieldProxies: [],
    relationChannels: [],
  }
  const roots = manifest.darkParticles.filter((particle) =>
    particle.parentDarkParticleId === null &&
    particle.darkParticleKind === "atom" &&
    particle.darkParticleId === stand.rootDarkParticleId
  )
  if (roots.length !== 1) {
    throw new Error(
      `Fields V2 expected one root lada, got ${roots.length}`,
    )
  }
  const rootParticle = roots[0]!
  const rootForm = resolveEmptyTorusForm(0)
  const color = visualDarkParticleColor(rootParticle)
  return Object.freeze({
    fields: Object.freeze([...manifest.fieldParticles]),
    graph: stand.graph,
    manifest,
    material: visualContextTorusMaterial(color),
    meshDetail: DARK_TORUS_MESH_DETAIL,
    root: Object.freeze({
      ...rootParticle,
      colorR: color[0],
      colorG: color[1],
      colorB: color[2],
      localX: 0,
      localY: 0,
      localZ: 0,
      torusRadius: rootForm.radius,
      torusTube: rootForm.tube,
    }),
  })
}

const canvasSize = (
  canvas: HTMLCanvasElement,
): Readonly<{height: number; width: number}> => {
  const rect = canvas.getBoundingClientRect()
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
  }
}

export const createFieldsV2Lab = async (
  stage: HTMLElement,
  source: FieldsV2Source,
): Promise<FieldsV2Lab> => {
  const canvas = document.createElement("canvas")
  canvas.id = "fields-v2-canvas"
  canvas.setAttribute(
    "aria-label",
    `Корневой Torus lada сверху; ${source.fields.length} Fields показаны отдельными орбитальными кольцами`,
  )
  const card = document.createElement("section")
  card.className = "fields-v2-card"
  const title = document.createElement("h2")
  title.textContent = "Fields v2 · lada"
  const description = document.createElement("p")
  description.textContent =
    `Корневой Torus из snapshot · вид сверху · ${source.fields.length} Fields, одно орбитальное кольцо на Field.`
  card.append(title, description)
  stage.replaceChildren(canvas, card)

  const renderer = new Renderer()
  await renderer.init(canvas)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  const space = new Space()
  const textOverlay = new Space()
  space.background = new Color(0.006, 0.014, 0.024)
  const geometry = new TorusGeometry({
    radius: source.root.torusRadius,
    tube: source.root.torusTube,
    radialSegments: source.meshDetail.radialSegments,
    tubularSegments: source.meshDetail.tubularSegments,
  })
  const torus = new Mesh(
    geometry,
    createQuantumFilmMaterial(new Color(...source.material.color), {
      glowIntensity: source.material.glowIntensity,
      highlightSize: source.material.highlightSize,
      opacity: source.material.opacity,
    }),
  )
  torus.position.set(
    source.root.localX,
    source.root.localY,
    source.root.localZ,
  )
  torus.frustumCulled = false
  torus.updateMatrix()
  space.add(torus)

  const rootOuterRadius = source.root.torusRadius + source.root.torusTube
  const ringPlacements = layoutFieldsV2Rings(source.fields, rootOuterRadius)
  const fieldGeometries: BufferGeometry[] = []
  const textGeometries: BufferGeometry[] = []
  const font = await TrueTypeFont.fromUrl(
    "/engine-static/JetBrainsMono-Bold.ttf",
  )
  for (const placement of ringPlacements) {
    const color = visualFieldParticleColor(placement.field)
    const fieldGeometry = createAnnulusGeometry(
      placement.innerRadius,
      placement.outerRadius,
    )
    fieldGeometries.push(fieldGeometry)
    const fieldRing = new Mesh(
      fieldGeometry,
      new MeshBasicMaterial({
        color: new Color(
          color[0] * 0.24,
          color[1] * 0.24,
          color[2] * 0.24,
        ),
      }),
    )
    fieldRing.frustumCulled = false
    fieldRing.updateMatrix()
    space.add(fieldRing)

    const fieldText = new Text(
      fieldsV2FieldText(placement.field),
      font,
      FIELDS_V2_TEXT_SIZE,
      new TextMaterial({
        color: labelColor(color),
        depthWrite: false,
        opacity: 1,
      }),
    )
    fieldText.frustumCulled = false
    const center = textBounds(fieldText.coverGeometry)
    bendTextGeometryToRing(fieldText.coverGeometry, placement.radius, center)
    bendTextGeometryToRing(fieldText.stencilGeometry, placement.radius, center)
    textGeometries.push(fieldText.coverGeometry, fieldText.stencilGeometry)
    fieldText.updateMatrix()
    textOverlay.add(fieldText)
  }

  const sceneOuterRadius = ringPlacements.at(-1)?.outerRadius ?? rootOuterRadius
  const viewPoint = new ViewPoint({
    element: canvas,
    fov: Math.PI / 3.4,
    near: 1,
    far: 10000,
    position: {x: 0, y: 0, z: sceneOuterRadius * 2.35},
    target: {x: 0, y: 0, z: 0},
  })
  const resetTopView = (): void => {
    viewPoint.position.set(0, 0, sceneOuterRadius * 2.35)
    viewPoint.getTarget().set(0, 0, 0)
    viewPoint.getUp().set(0, 1, 0)
    viewPoint.update()
  }
  resetTopView()

  let active = false
  let disposed = false
  let frame = 0
  let warmupFrames = 0
  const annotation = createPageAnnotationLayer({
    sourceCanvas: canvas,
    viewer: stage,
    capturePng: () => renderer.captureLastPresentedFramePng(),
    surface: () => ({
      canvasId: canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: FIELDS_V2_SLUG,
      title: `Fields v2 · lada · ${source.fields.length} orbital rings`,
    }),
  })

  const resize = (): void => {
    const next = canvasSize(canvas)
    if (next.width < 2 || next.height < 2) return
    renderer.setSize(next.width, next.height)
    viewPoint.setAspectRatio(next.width / next.height)
    viewPoint.update()
  }
  const renderOnce = (): void => {
    frame = 0
    if (!active || disposed) return
    space.updateWorldMatrix()
    textOverlay.updateWorldMatrix()
    renderer.renderFrame(space, textOverlay, viewPoint)
    if (warmupFrames > 0) {
      warmupFrames -= 1
      requestRender()
    }
  }
  const requestRender = (): void => {
    if (!active || disposed || frame !== 0) return
    frame = requestAnimationFrame(renderOnce)
  }
  const observer = new ResizeObserver(() => {
    resize()
    annotation.resize()
    requestRender()
  })
  observer.observe(canvas)
  const requestRenderFromDrag = (event: MouseEvent): void => {
    if (event.buttons !== 0) requestRender()
  }
  const requestRenderFromCamera = (): void => requestRender()
  canvas.addEventListener("mousemove", requestRenderFromDrag)
  canvas.addEventListener("wheel", requestRenderFromCamera)
  canvas.addEventListener("touchmove", requestRenderFromCamera)

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      annotation.dispose()
      canvas.removeEventListener("mousemove", requestRenderFromDrag)
      canvas.removeEventListener("wheel", requestRenderFromCamera)
      canvas.removeEventListener("touchmove", requestRenderFromCamera)
      viewPoint.dispose()
      renderer.invalidateGeometry(geometry)
      for (const fieldGeometry of fieldGeometries) {
        renderer.invalidateGeometry(fieldGeometry)
      }
      for (const textGeometry of textGeometries) {
        renderer.invalidateGeometry(textGeometry)
      }
      stage.replaceChildren()
    },
    hide(): void {
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      warmupFrames = 0
      annotation.hide()
    },
    show(): void {
      active = true
      warmupFrames = 1
      resetTopView()
      annotation.show()
      resize()
      requestRender()
    },
  }
}
