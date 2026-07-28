import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineGlowMaterial,
  LineSegments,
  Object3D,
  Raycaster,
  Renderer,
  Space,
  SphereGeometry,
  Vector3,
  ViewPoint,
} from "@metafor/engine"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"
import {
  buildThreeTorusWireGeometry,
  readStoredTorusDefaults,
  type ThreeTorusParameters,
} from "./TorusAnalysisLab.ts"

export type EdgeConstraintInput = Readonly<{
  centerDistance: number
  constraintRadius: number
  leftAzimuthDeg: number
  leftHeight: number
  leftSphereX: number
  leftSphereY: number
  rightAzimuthDeg: number
  rightHeight: number
  rightSphereX: number
  rightSphereY: number
}>

export type EdgeConstraintPoint = Readonly<{
  x: number
  y: number
  z: number
}>

export type EdgeConstraintModel = Readonly<{
  approximateLength: number
  curve: readonly EdgeConstraintPoint[]
  leftCenter: EdgeConstraintPoint
  leftControl: EdgeConstraintPoint
  leftEntryAngleDeg: number
  leftTorusCenter: EdgeConstraintPoint
  maximumHeight: number
  rightCenter: EdgeConstraintPoint
  rightControl: EdgeConstraintPoint
  rightEntryAngleDeg: number
  rightTorusCenter: EdgeConstraintPoint
}>

export const EDGE_TORUS_GAP_MM = 2

export const minimumEdgeTorusCenterDistance = (
  torus: Pick<ThreeTorusParameters, "radius" | "tube">,
): number => (torus.radius + torus.tube) * 2 + EDGE_TORUS_GAP_MM

export const sphereOffsetLimit = (
  torus: Pick<ThreeTorusParameters, "radius" | "tube">,
  sphereRadius: number,
): number => Math.max(0, torus.radius - torus.tube - sphereRadius)

export const constrainSphereOffset = (
  x: number,
  y: number,
  limit: number,
): Readonly<{x: number; y: number}> => {
  const safeLimit = Math.max(0, limit)
  const distance = Math.hypot(x, y)
  if (distance <= safeLimit || distance === 0) return {x, y}
  const scale = safeLimit / distance
  return {x: x * scale, y: y * scale}
}

const toRadians = (degrees: number): number => degrees * Math.PI / 180

const distance = (
  left: EdgeConstraintPoint,
  right: EdgeConstraintPoint,
): number => Math.hypot(
  right.x - left.x,
  right.y - left.y,
  right.z - left.z,
)

const cubicPoint = (
  from: EdgeConstraintPoint,
  controlFrom: EdgeConstraintPoint,
  controlTo: EdgeConstraintPoint,
  to: EdgeConstraintPoint,
  t: number,
): EdgeConstraintPoint => {
  const inverse = 1 - t
  return {
    x: inverse ** 3 * from.x +
      3 * inverse ** 2 * t * controlFrom.x +
      3 * inverse * t ** 2 * controlTo.x +
      t ** 3 * to.x,
    y: inverse ** 3 * from.y +
      3 * inverse ** 2 * t * controlFrom.y +
      3 * inverse * t ** 2 * controlTo.y +
      t ** 3 * to.y,
    z: inverse ** 3 * from.z +
      3 * inverse ** 2 * t * controlFrom.z +
      3 * inverse * t ** 2 * controlTo.z +
      t ** 3 * to.z,
  }
}

export const buildEdgeConstraintModel = (
  input: EdgeConstraintInput,
  segments = 96,
): EdgeConstraintModel => {
  const halfDistance = input.centerDistance / 2
  const leftTorusCenter = {x: -halfDistance, y: 0, z: 0}
  const rightTorusCenter = {x: halfDistance, y: 0, z: 0}
  const leftCenter = {
    x: leftTorusCenter.x + input.leftSphereX,
    y: leftTorusCenter.y + input.leftSphereY,
    z: 0,
  }
  const rightCenter = {
    x: rightTorusCenter.x + input.rightSphereX,
    y: rightTorusCenter.y + input.rightSphereY,
    z: 0,
  }
  const leftAzimuth = toRadians(input.leftAzimuthDeg)
  const rightAzimuth = toRadians(input.rightAzimuthDeg)
  const leftControl = {
    x: leftCenter.x + Math.cos(leftAzimuth) * input.constraintRadius,
    y: leftCenter.y + Math.sin(leftAzimuth) * input.constraintRadius,
    z: input.leftHeight,
  }
  const rightControl = {
    x: rightCenter.x + Math.cos(rightAzimuth) * input.constraintRadius,
    y: rightCenter.y + Math.sin(rightAzimuth) * input.constraintRadius,
    z: input.rightHeight,
  }
  const safeSegments = Math.max(8, Math.floor(segments))
  const curve: EdgeConstraintPoint[] = []
  let approximateLength = 0
  let maximumHeight = Number.NEGATIVE_INFINITY
  for (let index = 0; index <= safeSegments; index += 1) {
    const point = cubicPoint(
      leftCenter,
      leftControl,
      rightControl,
      rightCenter,
      index / safeSegments,
    )
    const previous = curve.at(-1)
    if (previous) approximateLength += distance(previous, point)
    maximumHeight = Math.max(maximumHeight, point.z)
    curve.push(point)
  }
  const entryAngle = (height: number): number =>
    Math.atan2(height, Math.max(1e-6, input.constraintRadius)) *
    180 / Math.PI
  return {
    approximateLength,
    curve,
    leftCenter,
    leftControl,
    leftEntryAngleDeg: entryAngle(input.leftHeight),
    leftTorusCenter,
    maximumHeight,
    rightCenter,
    rightControl,
    rightEntryAngleDeg: entryAngle(input.rightHeight),
    rightTorusCenter,
  }
}

export type EdgesLab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
}>

type EdgesLabElements = Readonly<{
  canvas: HTMLCanvasElement
  centerDistance: HTMLInputElement
  centerDistanceOutput: HTMLOutputElement
  constraintRadius: HTMLInputElement
  constraintRadiusOutput: HTMLOutputElement
  helpers: HTMLInputElement
  leftAzimuth: HTMLInputElement
  leftAzimuthOutput: HTMLOutputElement
  leftHeight: HTMLInputElement
  leftHeightOutput: HTMLOutputElement
  readout: HTMLElement
  rightAzimuth: HTMLInputElement
  rightAzimuthOutput: HTMLOutputElement
  rightHeight: HTMLInputElement
  rightHeightOutput: HTMLOutputElement
  sphereRadius: HTMLInputElement
  sphereRadiusOutput: HTMLOutputElement
  torusRadiusOutput: HTMLOutputElement
  viewButtons: NodeListOf<HTMLButtonElement>
}>

const requireElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Edges Lab element #${id} is missing`)
  return element as T
}

const labElements = (): EdgesLabElements => ({
  canvas: requireElement<HTMLCanvasElement>("edges-canvas"),
  centerDistance: requireElement<HTMLInputElement>("edges-center-distance"),
  centerDistanceOutput: requireElement<HTMLOutputElement>("edges-center-distance-output"),
  constraintRadius: requireElement<HTMLInputElement>("edges-constraint-radius"),
  constraintRadiusOutput: requireElement<HTMLOutputElement>("edges-constraint-radius-output"),
  helpers: requireElement<HTMLInputElement>("edges-helpers"),
  leftAzimuth: requireElement<HTMLInputElement>("edges-left-azimuth"),
  leftAzimuthOutput: requireElement<HTMLOutputElement>("edges-left-azimuth-output"),
  leftHeight: requireElement<HTMLInputElement>("edges-left-height"),
  leftHeightOutput: requireElement<HTMLOutputElement>("edges-left-height-output"),
  readout: requireElement("edges-readout"),
  rightAzimuth: requireElement<HTMLInputElement>("edges-right-azimuth"),
  rightAzimuthOutput: requireElement<HTMLOutputElement>("edges-right-azimuth-output"),
  rightHeight: requireElement<HTMLInputElement>("edges-right-height"),
  rightHeightOutput: requireElement<HTMLOutputElement>("edges-right-height-output"),
  sphereRadius: requireElement<HTMLInputElement>("edges-sphere-radius"),
  sphereRadiusOutput: requireElement<HTMLOutputElement>("edges-sphere-radius-output"),
  torusRadiusOutput: requireElement<HTMLOutputElement>("edges-torus-radius-output"),
  viewButtons: document.querySelectorAll<HTMLButtonElement>("[data-edges-view]"),
})

const pointVector = (point: EdgeConstraintPoint): Vector3 =>
  new Vector3(point.x, point.y, point.z)

const segmentGeometry = (
  segments: readonly (readonly [EdgeConstraintPoint, EdgeConstraintPoint])[],
): BufferGeometry => {
  const values = new Float32Array(segments.length * 6)
  let offset = 0
  for (const [from, to] of segments) {
    values[offset++] = from.x
    values[offset++] = from.y
    values[offset++] = from.z
    values[offset++] = to.x
    values[offset++] = to.y
    values[offset++] = to.z
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(values, 3))
  return geometry
}

const polylineGeometry = (
  points: readonly EdgeConstraintPoint[],
  closed = false,
): BufferGeometry => {
  const segments: Array<readonly [EdgeConstraintPoint, EdgeConstraintPoint]> = []
  for (let index = 1; index < points.length; index += 1) {
    segments.push([points[index - 1]!, points[index]!])
  }
  if (closed && points.length > 1) {
    segments.push([points.at(-1)!, points[0]!])
  }
  return segmentGeometry(segments)
}

const circlePoints = (
  center: EdgeConstraintPoint,
  height: number,
  radius: number,
  segments = 72,
): readonly EdgeConstraintPoint[] =>
  Array.from({length: segments}, (_, index) => {
    const angle = index / segments * Math.PI * 2
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      z: center.z + height,
    }
  })

const replaceReadout = (
  target: HTMLElement,
  values: ReadonlyArray<readonly [string, string]>,
): void => {
  target.replaceChildren(...values.flatMap(([label, value]) => {
    const wrapper = document.createElement("div")
    const term = document.createElement("span")
    term.textContent = label
    const definition = document.createElement("strong")
    definition.textContent = value
    wrapper.append(term, definition)
    return [wrapper]
  }))
}

const formatPoint = (point: EdgeConstraintPoint): string =>
  `${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)}`

export const createEdgesLab = async (): Promise<EdgesLab> => {
  const elements = labElements()
  const renderer = new Renderer()
  await renderer.init(elements.canvas)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  const space = new Space()
  space.background = new Color(0.006, 0.014, 0.024)
  const viewPoint = new ViewPoint({
    element: elements.canvas,
    fov: Math.PI / 3.5,
    near: 0.01,
    far: 10000,
    position: {x: 0, y: -68, z: 30},
    target: {x: 0, y: 0, z: 7},
  })
  viewPoint.getUp().set(0, 0, 1)

  let active = false
  let disposed = false
  let frame = 0
  let geometries: BufferGeometry[] = []
  let sphereOffsets = {
    left: {x: 0, y: 0},
    right: {x: 0, y: 0},
  }
  let interactionModel: EdgeConstraintModel | null = null
  let interactionSphereRadius = 0
  let interactionOffsetLimit = 0
  const annotation = createPageAnnotationLayer({
    sourceCanvas: elements.canvas,
    viewer: elements.canvas.parentElement ??
      (() => {
        throw new Error("Edges canvas parent is missing")
      })(),
    capturePng: () => renderer.captureLastPresentedFramePng(),
    surface: () => ({
      canvasId: elements.canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: "edges",
      title: "Edges · ограничители входа",
    }),
  })

  const input = (): EdgeConstraintInput => ({
    centerDistance: Number(elements.centerDistance.value),
    constraintRadius: Number(elements.constraintRadius.value),
    leftAzimuthDeg: Number(elements.leftAzimuth.value),
    leftHeight: Number(elements.leftHeight.value),
    leftSphereX: sphereOffsets.left.x,
    leftSphereY: sphereOffsets.left.y,
    rightAzimuthDeg: Number(elements.rightAzimuth.value),
    rightHeight: Number(elements.rightHeight.value),
    rightSphereX: sphereOffsets.right.x,
    rightSphereY: sphereOffsets.right.y,
  })

  const updateOutputs = (
    model: EdgeConstraintModel,
    settings: EdgeConstraintInput,
    torus: ThreeTorusParameters,
  ): void => {
    elements.centerDistanceOutput.value = `${settings.centerDistance.toFixed(1)} mm`
    elements.constraintRadiusOutput.value = `${settings.constraintRadius.toFixed(1)} mm`
    elements.leftHeightOutput.value = `${settings.leftHeight.toFixed(1)} mm`
    elements.rightHeightOutput.value = `${settings.rightHeight.toFixed(1)} mm`
    elements.leftAzimuthOutput.value = `${settings.leftAzimuthDeg.toFixed(0)}°`
    elements.rightAzimuthOutput.value = `${settings.rightAzimuthDeg.toFixed(0)}°`
    elements.sphereRadiusOutput.value =
      `${Number(elements.sphereRadius.value).toFixed(1)} mm`
    elements.torusRadiusOutput.value =
      `R ${torus.radius.toFixed(2)} · tube ${torus.tube.toFixed(2)} мм`
    replaceReadout(elements.readout, [
      ["Центры", `${settings.centerDistance.toFixed(1)} mm`],
      ["Ограничитель", `R ${settings.constraintRadius.toFixed(1)} mm`],
      ["Вход слева", `${model.leftEntryAngleDeg.toFixed(1)}°`],
      ["Вход справа", `${model.rightEntryAngleDeg.toFixed(1)}°`],
      ["Максимум дуги", `${model.maximumHeight.toFixed(2)} mm`],
      ["Длина дуги", `${model.approximateLength.toFixed(2)} mm`],
      ["Control L", formatPoint(model.leftControl)],
      ["Control R", formatPoint(model.rightControl)],
      ["Sphere L", formatPoint(model.leftCenter)],
      ["Sphere R", formatPoint(model.rightCenter)],
    ])
  }

  const addLine = (
    geometry: BufferGeometry,
    material: LineBasicMaterial | LineGlowMaterial,
  ): LineSegments => {
    geometries.push(geometry)
    const line = new LineSegments(geometry, material)
    line.frustumCulled = false
    space.add(line)
    return line
  }

  const rebuild = (): void => {
    if (disposed) return
    for (const geometry of geometries) renderer.invalidateGeometry(geometry)
    geometries = []
    for (const child of [...space.children]) space.remove(child)

    const torusParameters = readStoredTorusDefaults(localStorage)
    const torusOuterRadius = torusParameters.radius + torusParameters.tube
    const minimumCenterDistance =
      minimumEdgeTorusCenterDistance(torusParameters)
    elements.centerDistance.min = String(minimumCenterDistance)
    elements.centerDistance.max = String(Math.max(200, minimumCenterDistance))
    if (Number(elements.centerDistance.value) < minimumCenterDistance) {
      elements.centerDistance.value = String(minimumCenterDistance)
    }
    const torusInnerRadius = Math.max(
      0.05,
      torusParameters.radius - torusParameters.tube,
    )
    elements.sphereRadius.max = String(torusInnerRadius)
    if (Number(elements.sphereRadius.value) > torusInnerRadius) {
      elements.sphereRadius.value = String(torusInnerRadius)
    }
    const sphereRadius = Number(elements.sphereRadius.value)
    const offsetLimit = sphereOffsetLimit(torusParameters, sphereRadius)
    const leftOffset = constrainSphereOffset(
      sphereOffsets.left.x,
      sphereOffsets.left.y,
      offsetLimit,
    )
    const rightOffset = constrainSphereOffset(
      sphereOffsets.right.x,
      sphereOffsets.right.y,
      offsetLimit,
    )
    sphereOffsets = {left: leftOffset, right: rightOffset}
    const settings = input()
    const model = buildEdgeConstraintModel(settings)
    interactionModel = model
    interactionSphereRadius = sphereRadius
    interactionOffsetLimit = offsetLimit
    const torusGeometry =
      buildThreeTorusWireGeometry(torusParameters).geometry
    const sphereGeometry = new SphereGeometry({
      radius: sphereRadius,
      widthSegments: 28,
      heightSegments: 18,
    }).toWireframe()
    geometries.push(torusGeometry, sphereGeometry)

    const leftRoot = new Object3D()
    leftRoot.position.copy(pointVector(model.leftTorusCenter))
    leftRoot.add(new LineSegments(
      torusGeometry,
      new LineGlowMaterial({
        color: new Color(0.19, 0.75, 1, 0.58),
        glowColor: new Color(0.25, 0.84, 1, 0.2),
        glowIntensity: 1.3,
        opacity: 1,
        visibilityMode: "scene",
      }),
    ))
    space.add(leftRoot)

    const rightRoot = new Object3D()
    rightRoot.position.copy(pointVector(model.rightTorusCenter))
    rightRoot.add(new LineSegments(
      torusGeometry,
      new LineGlowMaterial({
        color: new Color(0.75, 0.35, 1, 0.58),
        glowColor: new Color(0.82, 0.5, 1, 0.2),
        glowIntensity: 1.3,
        opacity: 1,
        visibilityMode: "scene",
      }),
    ))
    space.add(rightRoot)

    const leftSphere = new LineSegments(
      sphereGeometry,
      new LineGlowMaterial({
        color: new Color(0.25, 0.88, 1, 0.96),
        glowColor: new Color(0.55, 0.94, 1, 0.58),
        glowIntensity: 3,
        opacity: 1,
        visibilityMode: "scene",
      }),
    )
    leftSphere.position.copy(pointVector(model.leftCenter))
    space.add(leftSphere)
    const rightSphere = new LineSegments(
      sphereGeometry,
      new LineGlowMaterial({
        color: new Color(0.89, 0.48, 1, 0.96),
        glowColor: new Color(0.95, 0.7, 1, 0.58),
        glowIntensity: 3,
        opacity: 1,
        visibilityMode: "scene",
      }),
    )
    rightSphere.position.copy(pointVector(model.rightCenter))
    space.add(rightSphere)

    addLine(
      polylineGeometry(model.curve),
      new LineGlowMaterial({
        color: new Color(1, 0.48, 0.12, 0.96),
        glowColor: new Color(1, 0.25, 0.04, 0.38),
        glowIntensity: 2.8,
        luminanceBoost: 1.2,
        opacity: 1,
        visibilityMode: "overlay",
      }),
    )

    if (elements.helpers.checked) {
      const helper = new LineBasicMaterial({
        color: new Color(1, 1, 1, 0.72),
        opacity: 1,
      })
      const faintHelper = new LineBasicMaterial({
        color: new Color(1, 1, 1, 0.3),
        opacity: 1,
      })
      const minimumZ = -torusOuterRadius * 1.35
      const maximumZ = Math.max(
        settings.leftHeight,
        settings.rightHeight,
        torusOuterRadius,
      ) + torusOuterRadius * 0.9
      addLine(segmentGeometry([
        [
          {...model.leftCenter, z: minimumZ},
          {...model.leftCenter, z: maximumZ},
        ],
        [
          {...model.rightCenter, z: minimumZ},
          {...model.rightCenter, z: maximumZ},
        ],
        [model.leftCenter, model.rightCenter],
      ]), faintHelper)
      addLine(
        polylineGeometry(
          circlePoints(
            model.leftCenter,
            settings.leftHeight,
            settings.constraintRadius,
          ),
          true,
        ),
        helper,
      )
      addLine(
        polylineGeometry(
          circlePoints(
            model.rightCenter,
            settings.rightHeight,
            settings.constraintRadius,
          ),
          true,
        ),
        helper,
      )
      addLine(segmentGeometry([
        [model.leftCenter, model.leftControl],
        [model.rightCenter, model.rightControl],
      ]), helper)
      const controlGeometry = new SphereGeometry({
        radius: 0.72,
        widthSegments: 14,
        heightSegments: 9,
      }).toWireframe()
      geometries.push(controlGeometry)
      const leftControl = new LineSegments(controlGeometry, helper)
      leftControl.position.copy(pointVector(model.leftControl))
      leftControl.frustumCulled = false
      space.add(leftControl)
      const rightControl = new LineSegments(controlGeometry, helper)
      rightControl.position.copy(pointVector(model.rightControl))
      rightControl.frustumCulled = false
      space.add(rightControl)
    }
    updateOutputs(model, settings, torusParameters)
    requestRender()
  }

  const resize = (): void => {
    const rect = elements.canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    renderer.setSize(Math.floor(rect.width), Math.floor(rect.height))
    viewPoint.setAspectRatio(rect.width / rect.height)
    viewPoint.update()
  }

  const setView = (view: string): void => {
    const settings = input()
    const torus = readStoredTorusDefaults(localStorage)
    const span = Math.max(
      settings.centerDistance + (torus.radius + torus.tube) * 3,
      settings.leftHeight + settings.rightHeight + 30,
    )
    const target = viewPoint.getTarget()
    target.set(0, 0, Math.max(settings.leftHeight, settings.rightHeight) * 0.3)
    switch (view) {
      case "front":
        viewPoint.position.set(0, -span, target.z)
        viewPoint.getUp().set(0, 0, 1)
        break
      case "top":
        viewPoint.position.set(0, 0, span)
        viewPoint.getUp().set(0, 1, 0)
        break
      default:
        viewPoint.position.set(0, -span * 0.9, span * 0.45)
        viewPoint.getUp().set(0, 0, 1)
        break
    }
    viewPoint.update()
    for (const button of elements.viewButtons) {
      button.classList.toggle("active", button.dataset.edgesView === view)
    }
    requestRender()
  }

  const renderOnce = (): void => {
    frame = 0
    if (!active || disposed) return
    space.updateWorldMatrix()
    renderer.render(space, viewPoint)
  }

  function requestRender(): void {
    if (!active || disposed || frame !== 0) return
    frame = requestAnimationFrame(renderOnce)
  }

  const observer = new ResizeObserver(() => {
    resize()
    annotation.resize()
    requestRender()
  })
  observer.observe(elements.canvas)
  const rebuildInputs = [
    elements.centerDistance,
    elements.constraintRadius,
    elements.leftAzimuth,
    elements.leftHeight,
    elements.rightAzimuth,
    elements.rightHeight,
    elements.sphereRadius,
  ]
  for (const control of rebuildInputs) {
    control.addEventListener("input", rebuild)
  }
  elements.helpers.addEventListener("change", rebuild)
  for (const button of elements.viewButtons) {
    button.addEventListener("click", () => {
      setView(button.dataset.edgesView ?? "perspective")
    })
  }
  const requestRenderFromDrag = (event: MouseEvent): void => {
    if (event.buttons !== 0) requestRender()
  }
  const requestRenderFromCamera = (): void => requestRender()
  const raycaster = new Raycaster()
  type SphereSide = "left" | "right"
  let draggedSphere: SphereSide | null = null
  let dragGrabOffset = {x: 0, y: 0}

  const rayFromClient = (clientX: number, clientY: number) => {
    const rect = elements.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    viewPoint.update()
    raycaster.setFromCamera({
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: 1 - ((clientY - rect.top) / rect.height) * 2,
    }, viewPoint)
    return raycaster.ray
  }

  const pointOnTorusPlane = (
    clientX: number,
    clientY: number,
  ): EdgeConstraintPoint | null => {
    const ray = rayFromClient(clientX, clientY)
    if (!ray || Math.abs(ray.direction.z) < 1e-6) return null
    const travel = -ray.origin.z / ray.direction.z
    if (!Number.isFinite(travel) || travel < 0) return null
    return {
      x: ray.origin.x + ray.direction.x * travel,
      y: ray.origin.y + ray.direction.y * travel,
      z: 0,
    }
  }

  const sphereHitDistance = (
    center: EdgeConstraintPoint,
    clientX: number,
    clientY: number,
  ): number | null => {
    const ray = rayFromClient(clientX, clientY)
    if (!ray) return null
    const toCenterX = center.x - ray.origin.x
    const toCenterY = center.y - ray.origin.y
    const toCenterZ = center.z - ray.origin.z
    const alongRay =
      toCenterX * ray.direction.x +
      toCenterY * ray.direction.y +
      toCenterZ * ray.direction.z
    if (alongRay < 0) return null
    const centerDistanceSquared =
      toCenterX ** 2 + toCenterY ** 2 + toCenterZ ** 2
    const closestDistanceSquared =
      centerDistanceSquared - alongRay ** 2
    const radiusSquared = interactionSphereRadius ** 2
    if (closestDistanceSquared > radiusSquared) return null
    return alongRay - Math.sqrt(
      Math.max(0, radiusSquared - closestDistanceSquared),
    )
  }

  const sphereAtClient = (
    clientX: number,
    clientY: number,
  ): SphereSide | null => {
    if (!interactionModel || interactionSphereRadius <= 0) return null
    const leftDistance = sphereHitDistance(
      interactionModel.leftCenter,
      clientX,
      clientY,
    )
    const rightDistance = sphereHitDistance(
      interactionModel.rightCenter,
      clientX,
      clientY,
    )
    if (leftDistance === null) {
      return rightDistance === null ? null : "right"
    }
    if (rightDistance === null) return "left"
    return leftDistance <= rightDistance ? "left" : "right"
  }

  const startSphereDrag = (event: MouseEvent): void => {
    if (event.button !== 0 || !interactionModel) return
    const side = sphereAtClient(event.clientX, event.clientY)
    const planePoint = pointOnTorusPlane(event.clientX, event.clientY)
    if (!side || !planePoint) return
    const center = side === "left"
      ? interactionModel.leftCenter
      : interactionModel.rightCenter
    dragGrabOffset = {
      x: center.x - planePoint.x,
      y: center.y - planePoint.y,
    }
    draggedSphere = side
    elements.canvas.style.cursor = "grabbing"
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const moveSphere = (event: MouseEvent): void => {
    if (!draggedSphere || !interactionModel) return
    const planePoint = pointOnTorusPlane(event.clientX, event.clientY)
    if (!planePoint) return
    const torusCenter = draggedSphere === "left"
      ? interactionModel.leftTorusCenter
      : interactionModel.rightTorusCenter
    const offset = constrainSphereOffset(
      planePoint.x + dragGrabOffset.x - torusCenter.x,
      planePoint.y + dragGrabOffset.y - torusCenter.y,
      interactionOffsetLimit,
    )
    sphereOffsets = {...sphereOffsets, [draggedSphere]: offset}
    event.preventDefault()
    event.stopImmediatePropagation()
    rebuild()
  }

  const finishSphereDrag = (event: MouseEvent): void => {
    if (!draggedSphere) return
    draggedSphere = null
    elements.canvas.style.cursor = ""
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const updateSphereCursor = (event: MouseEvent): void => {
    if (draggedSphere || event.buttons !== 0) return
    elements.canvas.style.cursor =
      sphereAtClient(event.clientX, event.clientY) ? "grab" : ""
  }

  elements.canvas.addEventListener("mousedown", startSphereDrag, true)
  elements.canvas.addEventListener("mousemove", updateSphereCursor, true)
  document.addEventListener("mousemove", moveSphere, true)
  document.addEventListener("mouseup", finishSphereDrag, true)
  elements.canvas.addEventListener("mousemove", requestRenderFromDrag)
  elements.canvas.addEventListener("wheel", requestRenderFromCamera)
  elements.canvas.addEventListener("touchmove", requestRenderFromCamera)

  rebuild()
  return {
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      annotation.dispose()
      elements.canvas.removeEventListener("mousedown", startSphereDrag, true)
      elements.canvas.removeEventListener("mousemove", updateSphereCursor, true)
      document.removeEventListener("mousemove", moveSphere, true)
      document.removeEventListener("mouseup", finishSphereDrag, true)
      elements.canvas.removeEventListener("mousemove", requestRenderFromDrag)
      elements.canvas.removeEventListener("wheel", requestRenderFromCamera)
      elements.canvas.removeEventListener("touchmove", requestRenderFromCamera)
      viewPoint.dispose()
      for (const geometry of geometries) renderer.invalidateGeometry(geometry)
    },
    hide() {
      active = false
      annotation.hide()
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
    },
    show() {
      active = true
      annotation.show()
      resize()
      rebuild()
      setView("perspective")
      requestRender()
    },
  }
}
