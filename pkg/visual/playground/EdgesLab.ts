import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineGlowMaterial,
  LineSegments,
  Object3D,
  Renderer,
  Space,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  ViewPoint,
} from "@metafor/engine"

export type EdgeConstraintInput = Readonly<{
  centerDistance: number
  constraintRadius: number
  leftAzimuthDeg: number
  leftHeight: number
  rightAzimuthDeg: number
  rightHeight: number
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
  maximumHeight: number
  rightCenter: EdgeConstraintPoint
  rightControl: EdgeConstraintPoint
  rightEntryAngleDeg: number
}>

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
  const leftCenter = {x: -halfDistance, y: 0, z: 0}
  const rightCenter = {x: halfDistance, y: 0, z: 0}
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
    maximumHeight,
    rightCenter,
    rightControl,
    rightEntryAngleDeg: entryAngle(input.rightHeight),
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
  torusRadius: HTMLInputElement
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
  torusRadius: requireElement<HTMLInputElement>("edges-torus-radius"),
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

  const input = (): EdgeConstraintInput => ({
    centerDistance: Number(elements.centerDistance.value),
    constraintRadius: Number(elements.constraintRadius.value),
    leftAzimuthDeg: Number(elements.leftAzimuth.value),
    leftHeight: Number(elements.leftHeight.value),
    rightAzimuthDeg: Number(elements.rightAzimuth.value),
    rightHeight: Number(elements.rightHeight.value),
  })

  const updateOutputs = (
    model: EdgeConstraintModel,
    settings: EdgeConstraintInput,
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
      `${Number(elements.torusRadius.value).toFixed(1)} mm`
    replaceReadout(elements.readout, [
      ["Центры", `${settings.centerDistance.toFixed(1)} mm`],
      ["Ограничитель", `R ${settings.constraintRadius.toFixed(1)} mm`],
      ["Вход слева", `${model.leftEntryAngleDeg.toFixed(1)}°`],
      ["Вход справа", `${model.rightEntryAngleDeg.toFixed(1)}°`],
      ["Максимум дуги", `${model.maximumHeight.toFixed(2)} mm`],
      ["Длина дуги", `${model.approximateLength.toFixed(2)} mm`],
      ["Control L", formatPoint(model.leftControl)],
      ["Control R", formatPoint(model.rightControl)],
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

    const settings = input()
    const model = buildEdgeConstraintModel(settings)
    const torusRadius = Number(elements.torusRadius.value)
    const sphereRadius = Number(elements.sphereRadius.value)
    const torusGeometry = new TorusGeometry({
      radius: torusRadius,
      tube: Math.max(0.35, torusRadius * 0.24),
      radialSegments: 20,
      tubularSegments: 48,
    }).toWireframe()
    const sphereGeometry = new SphereGeometry({
      radius: sphereRadius,
      widthSegments: 28,
      heightSegments: 18,
    }).toWireframe()
    geometries.push(torusGeometry, sphereGeometry)

    const leftRoot = new Object3D()
    leftRoot.position.copy(pointVector(model.leftCenter))
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
    rightRoot.position.copy(pointVector(model.rightCenter))
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
      const minimumZ = -torusRadius * 1.35
      const maximumZ = Math.max(
        settings.leftHeight,
        settings.rightHeight,
        torusRadius,
      ) + torusRadius * 0.9
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
    updateOutputs(model, settings)
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
    const span = Math.max(
      settings.centerDistance + Number(elements.torusRadius.value) * 3,
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
    elements.torusRadius,
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
      elements.canvas.removeEventListener("mousemove", requestRenderFromDrag)
      elements.canvas.removeEventListener("wheel", requestRenderFromCamera)
      elements.canvas.removeEventListener("touchmove", requestRenderFromCamera)
      viewPoint.dispose()
      for (const geometry of geometries) renderer.invalidateGeometry(geometry)
    },
    hide() {
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
    },
    show() {
      active = true
      resize()
      setView("perspective")
      requestRender()
    },
  }
}
