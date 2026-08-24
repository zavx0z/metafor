import type {
  BulkFieldParticle,
  BulkFieldParticleKind,
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
} from "@engine/core"
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
import {
  createFlatFieldBandGeometry,
  deriveFieldsMattePastel,
  FIELDS_MATTE_DEFAULT_OPACITY,
  FIELDS_MATTE_TEXT_COLOR,
  FIELDS_MATTE_TEXT_OPACITY,
  updateFlatFieldBandGeometry,
} from "./FieldsMatte.ts"

export const FIELDS_V2_SLUG = "analysis-fields-v2"
export const FIELDS_V2_RING_WIDTH = 2.6
export const FIELDS_V2_RING_WIDTH_MIN = 1.2
export const FIELDS_V2_RING_WIDTH_MAX = 10
export const FIELDS_V2_RING_WIDTH_STEP = 0.1
export const FIELDS_V2_RING_GAP = 0.5
export const FIELDS_V2_RING_START_GAP = FIELDS_V2_RING_GAP
export const FIELDS_V2_TEXT_SIZE = 1.65
export const FIELDS_V2_FLOW_RADIAL_AMPLITUDE = 0.15
export const FIELDS_V2_FLOW_HEIGHT = 0.18
export const FIELDS_V2_FIELD_KIND_ORDER: readonly BulkFieldParticleKind[] =
  Object.freeze(["number", "array", "string", "enum", "boolean", "other"])
export const FIELDS_V2_EMPTY_FIELD_ENERGY = 0.84
export const FIELDS_V2_MATERIALIZED_FIELD_ENERGY = 1
export const FIELDS_V2_EMPTY_FIELD_OPACITY = 0.34
export const FIELDS_V2_MATERIALIZED_FIELD_OPACITY = 0.5
export const FIELDS_V2_EMPTY_FIELD_HIGHLIGHT_SIZE = 0.56
export const FIELDS_V2_MATERIALIZED_FIELD_HIGHLIGHT_SIZE = 0.74

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
  ringWidth = FIELDS_V2_RING_WIDTH,
): readonly FieldsV2RingPlacement[] => {
  const kindOrder = new Map(FIELDS_V2_FIELD_KIND_ORDER.map(
    (kind, index) => [kind, index] as const,
  ))
  const orderedFields = fields.map((field, sourceIndex) => ({field, sourceIndex}))
    .sort((left, right) =>
      (kindOrder.get(left.field.fieldParticleKind) ?? Number.MAX_SAFE_INTEGER) -
        (kindOrder.get(right.field.fieldParticleKind) ?? Number.MAX_SAFE_INTEGER) ||
      left.sourceIndex - right.sourceIndex
    )
  return Object.freeze(orderedFields.map(({field}, index) => {
    const innerRadius = torusOuterRadius + FIELDS_V2_RING_START_GAP +
      index * (ringWidth + FIELDS_V2_RING_GAP)
    return Object.freeze({
      field,
      innerRadius,
      outerRadius: innerRadius + ringWidth,
      radius: innerRadius + ringWidth / 2,
    })
  }))
}

export const fieldsV2TextSize = (ringWidth: number): number =>
  FIELDS_V2_TEXT_SIZE * ringWidth / FIELDS_V2_RING_WIDTH

export const fieldsV2FieldText = (field: BulkFieldParticle): string =>
  `${field.fieldLabel} · ${field.valueText ?? "∅"}`

type FieldsV2Color = readonly [number, number, number]

export const fieldsV2AccretionColor = (
  field: BulkFieldParticle,
): FieldsV2Color => {
  const semantic = visualFieldParticleColor(field)
  const energy = field.valueText === null
    ? FIELDS_V2_EMPTY_FIELD_ENERGY
    : FIELDS_V2_MATERIALIZED_FIELD_ENERGY
  return semantic.map(
    (channel) => channel * energy,
  ) as unknown as FieldsV2Color
}

export const createFieldsV2QuantumMaterial = (
  field: BulkFieldParticle,
  color: Color,
) => createQuantumFilmMaterial(color, {
  glowIntensity: field.valueText === null ? 1.15 : 1.8,
  highlightSize: field.valueText === null
    ? FIELDS_V2_EMPTY_FIELD_HIGHLIGHT_SIZE
    : FIELDS_V2_MATERIALIZED_FIELD_HIGHLIGHT_SIZE,
  opacity: field.valueText === null
    ? FIELDS_V2_EMPTY_FIELD_OPACITY
    : FIELDS_V2_MATERIALIZED_FIELD_OPACITY,
})

export const createAccretionBandGeometry = (
  innerRadius: number,
  outerRadius: number,
  phase: number,
  segments = 192,
): BufferGeometry => {
  const positions = new Float32Array(segments * 2 * 3)
  const normals = new Float32Array(segments * 2 * 3)
  const indices = new Uint16Array(segments * 6)
  writeAccretionBandPositions(
    positions,
    innerRadius,
    outerRadius,
    phase,
    segments,
  )
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const innerOffset = index * 6
    const tangentialTilt = Math.sin(angle * 2 - 0.35 + phase) * 0.7
    const normalHeight = 0.62 +
      (Math.sin(angle * 5 + 0.2 - phase) + 1) * 0.13
    const innerRadialTilt = -0.88 + Math.sin(angle * 3 + phase) * 0.16
    const innerNormalLength = Math.hypot(
      cosine * innerRadialTilt - sine * tangentialTilt,
      sine * innerRadialTilt + cosine * tangentialTilt,
      normalHeight,
    )
    normals[innerOffset] = (cosine * innerRadialTilt - sine * tangentialTilt) /
      innerNormalLength
    normals[innerOffset + 1] = (sine * innerRadialTilt + cosine * tangentialTilt) /
      innerNormalLength
    normals[innerOffset + 2] = normalHeight / innerNormalLength
    const outerRadialTilt = 0.46 + Math.sin(angle * 3 - phase) * 0.12
    const outerNormalLength = Math.hypot(
      cosine * outerRadialTilt - sine * tangentialTilt,
      sine * outerRadialTilt + cosine * tangentialTilt,
      normalHeight,
    )
    normals[innerOffset + 3] = (cosine * outerRadialTilt - sine * tangentialTilt) /
      outerNormalLength
    normals[innerOffset + 4] = (sine * outerRadialTilt + cosine * tangentialTilt) /
      outerNormalLength
    normals[innerOffset + 5] = normalHeight / outerNormalLength

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

const writeAccretionBandPositions = (
  positions: Float32Array,
  innerRadius: number,
  outerRadius: number,
  phase: number,
  segments = 192,
): void => {
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const radialFlow =
      Math.sin(angle * 2 - 0.62 + phase) *
        FIELDS_V2_FLOW_RADIAL_AMPLITUDE * 0.72 +
      Math.sin(angle * 5 + 0.38 - phase * 0.7) *
        FIELDS_V2_FLOW_RADIAL_AMPLITUDE * 0.28
    const flowHeight =
      Math.sin(angle - 0.74 + phase) * FIELDS_V2_FLOW_HEIGHT * 0.76 +
      Math.sin(angle * 3 + 0.46 - phase) * FIELDS_V2_FLOW_HEIGHT * 0.24
    const offset = index * 6
    positions[offset] = cosine * (innerRadius + radialFlow)
    positions[offset + 1] = sine * (innerRadius + radialFlow)
    positions[offset + 2] = flowHeight + 0.04
    positions[offset + 3] = cosine * (outerRadius + radialFlow)
    positions[offset + 4] = sine * (outerRadius + radialFlow)
    positions[offset + 5] = flowHeight - 0.04
  }
}

const updateAccretionBandGeometry = (
  geometry: BufferGeometry,
  innerRadius: number,
  outerRadius: number,
  phase: number,
): void => {
  const position = geometry.attributes.position
  if (!position || !(position.array instanceof Float32Array)) return
  writeAccretionBandPositions(
    position.array,
    innerRadius,
    outerRadius,
    phase,
    position.count / 2,
  )
  position.needsUpdate = true
  geometry.boundingSphere = null
}

export const fieldsV2TextBounds = (
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

export const bendFieldsV2TextGeometryToRing = (
  geometry: BufferGeometry,
  sourcePositions: Float32Array,
  radius: number,
  center: Readonly<{centerX: number; centerY: number}>,
  scale = 1,
): void => {
  const position = geometry.attributes.position
  if (!position) return
  const values = position.array
  for (let index = 0; index < values.length; index += 3) {
    const along = (Number(sourcePositions[index]) - center.centerX) * scale
    const radialOffset =
      (Number(sourcePositions[index + 1]) - center.centerY) * scale
    const angle = Math.PI / 2 - along / radius
    const vertexRadius = radius + radialOffset
    values[index] = Math.cos(angle) * vertexRadius
    values[index + 1] = Math.sin(angle) * vertexRadius
    values[index + 2] = 0.3 + Number(sourcePositions[index + 2]) * scale
  }
  position.needsUpdate = true
  geometry.boundingSphere = null
}

export const fieldsV2LabelColor = (
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
    `Корневой Torus из snapshot · вид сверху · ${source.fields.length} матовых пастельных Fields, одно ровное орбитальное кольцо на Field.`
  const widthControl = document.createElement("label")
  widthControl.className = "fields-v2-width-control"
  widthControl.htmlFor = "fields-v2-ring-width"
  const widthHeader = document.createElement("span")
  widthHeader.textContent = "Ширина полосы"
  const widthOutput = document.createElement("output")
  widthOutput.setAttribute("for", "fields-v2-ring-width")
  const widthInput = document.createElement("input")
  widthInput.id = "fields-v2-ring-width"
  widthInput.type = "range"
  widthInput.min = String(FIELDS_V2_RING_WIDTH_MIN)
  widthInput.max = String(FIELDS_V2_RING_WIDTH_MAX)
  widthInput.step = String(FIELDS_V2_RING_WIDTH_STEP)
  widthInput.value = String(FIELDS_V2_RING_WIDTH)
  widthControl.append(widthHeader, widthOutput, widthInput)
  card.append(title, description, widthControl)
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
  const fieldGeometries: BufferGeometry[] = []
  const textGeometries: BufferGeometry[] = []
  const textGeometrySources: Array<Readonly<{
    center: Readonly<{centerX: number; centerY: number}>
    cover: Float32Array
    stencil: Float32Array
  }>> = []
  const font = await TrueTypeFont.fromUrl(
    "/engine-static/jetbrains-mono-bold.ttf",
  )
  let ringWidth = FIELDS_V2_RING_WIDTH
  const initialPlacements = layoutFieldsV2Rings(
    source.fields,
    rootOuterRadius,
    ringWidth,
  )
  for (const placement of initialPlacements) {
    const color = fieldsV2AccretionColor(placement.field)
    const fieldGeometry = createFlatFieldBandGeometry(
      placement.innerRadius,
      placement.outerRadius,
    )
    fieldGeometries.push(fieldGeometry)
    const fieldRing = new Mesh(
      fieldGeometry,
      new MeshBasicMaterial({
        color: deriveFieldsMattePastel(
          new Color(...color),
          FIELDS_MATTE_DEFAULT_OPACITY,
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
        color: new Color(FIELDS_MATTE_TEXT_COLOR),
        depthWrite: false,
        opacity: FIELDS_MATTE_TEXT_OPACITY,
      }),
    )
    fieldText.frustumCulled = false
    const center = fieldsV2TextBounds(fieldText.coverGeometry)
    const cover = Float32Array.from(
      fieldText.coverGeometry.attributes.position!.array,
    )
    const stencil = Float32Array.from(
      fieldText.stencilGeometry.attributes.position!.array,
    )
    bendFieldsV2TextGeometryToRing(
      fieldText.coverGeometry,
      cover,
      placement.radius,
      center,
    )
    bendFieldsV2TextGeometryToRing(
      fieldText.stencilGeometry,
      stencil,
      placement.radius,
      center,
    )
    textGeometrySources.push({center, cover, stencil})
    textGeometries.push(fieldText.coverGeometry, fieldText.stencilGeometry)
    fieldText.updateMatrix()
    textOverlay.add(fieldText)
  }

  const updateFields = (nextRingWidth: number): number => {
    const ringPlacements = layoutFieldsV2Rings(
      source.fields,
      rootOuterRadius,
      nextRingWidth,
    )
    const textScale = fieldsV2TextSize(nextRingWidth) / FIELDS_V2_TEXT_SIZE
    for (const [index, placement] of ringPlacements.entries()) {
      const fieldGeometry = fieldGeometries[index]!
      const textGeometry = textGeometrySources[index]!
      updateFlatFieldBandGeometry(
        fieldGeometry,
        placement.innerRadius,
        placement.outerRadius,
      )
      bendFieldsV2TextGeometryToRing(
        textGeometries[index * 2]!,
        textGeometry.cover,
        placement.radius,
        textGeometry.center,
        textScale,
      )
      bendFieldsV2TextGeometryToRing(
        textGeometries[index * 2 + 1]!,
        textGeometry.stencil,
        placement.radius,
        textGeometry.center,
        textScale,
      )
    }
    return ringPlacements.at(-1)?.outerRadius ?? rootOuterRadius
  }

  let sceneOuterRadius = initialPlacements.at(-1)?.outerRadius ?? rootOuterRadius
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
  let controlFrame = 0
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
  const updateWidthOutput = (): void => {
    widthOutput.value =
      `${ringWidth.toFixed(1)} mm · текст ${fieldsV2TextSize(ringWidth).toFixed(2)} mm`
  }
  const updateFromWidthControl = (): void => {
    controlFrame = 0
    if (disposed) return
    ringWidth = Number(widthInput.value)
    updateWidthOutput()
    sceneOuterRadius = updateFields(ringWidth)
    warmupFrames = 1
    requestRender()
  }
  const onWidthInput = (): void => {
    if (controlFrame !== 0) return
    controlFrame = requestAnimationFrame(updateFromWidthControl)
  }
  updateWidthOutput()
  widthInput.addEventListener("input", onWidthInput)
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
      if (controlFrame !== 0) cancelAnimationFrame(controlFrame)
      observer.disconnect()
      annotation.dispose()
      widthInput.removeEventListener("input", onWidthInput)
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
