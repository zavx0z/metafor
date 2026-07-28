import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineGlowMaterial,
  LineSegments,
  Renderer,
  Space,
  ViewPoint,
} from "@metafor/engine"

export type ThreeTorusParameters = Readonly<{
  arc: number
  radialSegments: number
  radius: number
  thetaLength: number
  thetaStart: number
  tube: number
  tubularSegments: number
}>

export const THREE_TORUS_DEFAULTS: ThreeTorusParameters = Object.freeze({
  radius: 1,
  tube: 0.4,
  radialSegments: 12,
  tubularSegments: 48,
  arc: Math.PI * 2,
  thetaStart: 0,
  thetaLength: Math.PI * 2,
})

export const METAFOR_TORUS_DEFAULTS: ThreeTorusParameters = Object.freeze({
  radius: 1.1,
  tube: 0.7,
  radialSegments: 22,
  tubularSegments: 45,
  arc: 6.28,
  thetaStart: -0.003185307179586,
  thetaLength: 6.28,
})

const TORUS_DEFAULT_STORAGE_KEY = "metafor.visual.torus-defaults.v1"

const torusParameterKeys = [
  "radius",
  "tube",
  "radialSegments",
  "tubularSegments",
  "arc",
  "thetaStart",
  "thetaLength",
] as const satisfies readonly (keyof ThreeTorusParameters)[]

export const mergeTorusDefaults = (
  value: unknown,
  fallback: ThreeTorusParameters = METAFOR_TORUS_DEFAULTS,
): ThreeTorusParameters => {
  if (typeof value !== "object" || value === null) return {...fallback}
  const candidate = value as Partial<Record<keyof ThreeTorusParameters, unknown>>
  const merged = {...fallback}
  for (const key of torusParameterKeys) {
    const next = candidate[key]
    if (typeof next === "number" && Number.isFinite(next)) merged[key] = next
  }
  return merged
}

export type ThreeTorusGeometryResult = Readonly<{
  geometry: BufferGeometry
  lineSegments: number
  triangles: number
  vertices: number
}>

export type MetaForTorusParameters = Readonly<{
  innerDiameter: number
  tubeDiameter: number
}>

export type MetaForTorusParameter = keyof MetaForTorusParameters

export const MAX_TORUS_WIDTH_MM = 100

export const deriveMetaForTorusParameters = (
  parameters: Pick<ThreeTorusParameters, "radius" | "tube">,
): MetaForTorusParameters => ({
  innerDiameter: (parameters.radius - parameters.tube) * 2,
  tubeDiameter: parameters.tube * 2,
})

export const applyMetaForTorusParameter = (
  parameters: ThreeTorusParameters,
  parameter: MetaForTorusParameter,
  value: number,
): ThreeTorusParameters => {
  const current = deriveMetaForTorusParameters(parameters)
  switch (parameter) {
    case "innerDiameter": {
      const outerDiameter = Math.min(
        (parameters.radius + parameters.tube) * 2,
        MAX_TORUS_WIDTH_MM,
      )
      const innerDiameter = Math.min(
        Math.max(0.1, value),
        outerDiameter - 0.2,
      )
      return {
        ...parameters,
        radius: (outerDiameter + innerDiameter) / 4,
        tube: (outerDiameter - innerDiameter) / 4,
      }
    }
    case "tubeDiameter": {
      const maxTubeDiameter = Math.max(
        0.1,
        (MAX_TORUS_WIDTH_MM - current.innerDiameter) / 2,
      )
      const tubeDiameter = Math.min(
        Math.max(0.1, value),
        maxTubeDiameter,
      )
      const tube = tubeDiameter / 2
      return {
        ...parameters,
        radius: current.innerDiameter / 2 + tube,
        tube,
      }
    }
  }
}

export const constrainThreeTorusWidth = (
  parameters: ThreeTorusParameters,
  changed: "radius" | "tube",
): ThreeTorusParameters => {
  const maximumOuterRadius = MAX_TORUS_WIDTH_MM / 2
  if (parameters.radius + parameters.tube <= maximumOuterRadius) {
    return parameters
  }
  return changed === "radius"
    ? {
        ...parameters,
        radius: Math.max(0.2, maximumOuterRadius - parameters.tube),
      }
    : {
        ...parameters,
        tube: Math.max(0.05, maximumOuterRadius - parameters.radius),
      }
}

export const torusCameraFitDistance = (
  parameters: Pick<ThreeTorusParameters, "radius" | "tube">,
): number => Math.max(3, parameters.radius + parameters.tube) * 4.4

export const applyShiftRangePrecision = (
  dragStart: number,
  nativeValue: number,
  shiftPressed: boolean,
): number => shiftPressed
  ? dragStart + (nativeValue - dragStart) / 10
  : nativeValue

export const buildThreeTorusWireGeometry = (
  parameters: ThreeTorusParameters,
): ThreeTorusGeometryResult => {
  const radialSegments = Math.max(3, Math.floor(parameters.radialSegments))
  const tubularSegments = Math.max(3, Math.floor(parameters.tubularSegments))
  const points: Array<readonly [number, number, number]> = []
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const v = parameters.thetaStart +
      radial / radialSegments * parameters.thetaLength
    for (let tubular = 0; tubular <= tubularSegments; tubular += 1) {
      const u = tubular / tubularSegments * parameters.arc
      points.push([
        (parameters.radius + parameters.tube * Math.cos(v)) * Math.cos(u),
        (parameters.radius + parameters.tube * Math.cos(v)) * Math.sin(u),
        parameters.tube * Math.sin(v),
      ])
    }
  }

  const values: number[] = []
  const index = (radial: number, tubular: number): number =>
    radial * (tubularSegments + 1) + tubular
  const add = (from: number, to: number): void => {
    values.push(...points[from]!, ...points[to]!)
  }
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    for (let tubular = 0; tubular <= tubularSegments; tubular += 1) {
      if (tubular < tubularSegments) {
        add(index(radial, tubular), index(radial, tubular + 1))
      }
      if (radial < radialSegments) {
        add(index(radial, tubular), index(radial + 1, tubular))
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(values), 3),
  )
  return {
    geometry,
    lineSegments: values.length / 6,
    triangles: radialSegments * tubularSegments * 2,
    vertices: points.length,
  }
}

export type TorusAnalysisLab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
}>

type TorusAnalysisElements = Readonly<{
  arc: HTMLInputElement
  arcOutput: HTMLOutputElement
  canvas: HTMLCanvasElement
  defaultButtons: NodeListOf<HTMLButtonElement>
  defaultStatus: HTMLElement
  formHeightOutput: HTMLOutputElement
  formWidthOutput: HTMLOutputElement
  innerDiameter: HTMLInputElement
  innerDiameterOutput: HTMLOutputElement
  radialSegments: HTMLInputElement
  radialSegmentsOutput: HTMLOutputElement
  radius: HTMLInputElement
  radiusOutput: HTMLOutputElement
  readout: HTMLElement
  tubeDiameter: HTMLInputElement
  tubeDiameterOutput: HTMLOutputElement
  thetaLength: HTMLInputElement
  thetaLengthOutput: HTMLOutputElement
  thetaStart: HTMLInputElement
  thetaStartOutput: HTMLOutputElement
  tube: HTMLInputElement
  tubeOutput: HTMLOutputElement
  tubularSegments: HTMLInputElement
  tubularSegmentsOutput: HTMLOutputElement
  validation: HTMLElement
  viewButtons: NodeListOf<HTMLButtonElement>
}>

const requireElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Torus Analysis element #${id} is missing`)
  return element as T
}

const labElements = (): TorusAnalysisElements => ({
  arc: requireElement<HTMLInputElement>("torus-analysis-arc"),
  arcOutput: requireElement<HTMLOutputElement>("torus-analysis-arc-output"),
  canvas: requireElement<HTMLCanvasElement>("torus-analysis-canvas"),
  defaultButtons: document.querySelectorAll<HTMLButtonElement>(
    "[data-torus-our-default]",
  ),
  defaultStatus: requireElement("torus-analysis-default-status"),
  formHeightOutput: requireElement<HTMLOutputElement>(
    "torus-analysis-form-height-output",
  ),
  formWidthOutput: requireElement<HTMLOutputElement>(
    "torus-analysis-form-width-output",
  ),
  innerDiameter: requireElement<HTMLInputElement>(
    "torus-analysis-inner-diameter",
  ),
  innerDiameterOutput: requireElement<HTMLOutputElement>(
    "torus-analysis-inner-diameter-output",
  ),
  radialSegments: requireElement<HTMLInputElement>("torus-analysis-radial-segments"),
  radialSegmentsOutput: requireElement<HTMLOutputElement>("torus-analysis-radial-segments-output"),
  radius: requireElement<HTMLInputElement>("torus-analysis-radius"),
  radiusOutput: requireElement<HTMLOutputElement>("torus-analysis-radius-output"),
  readout: requireElement("torus-analysis-readout"),
  tubeDiameter: requireElement<HTMLInputElement>(
    "torus-analysis-tube-diameter",
  ),
  tubeDiameterOutput: requireElement<HTMLOutputElement>(
    "torus-analysis-tube-diameter-output",
  ),
  thetaLength: requireElement<HTMLInputElement>("torus-analysis-theta-length"),
  thetaLengthOutput: requireElement<HTMLOutputElement>("torus-analysis-theta-length-output"),
  thetaStart: requireElement<HTMLInputElement>("torus-analysis-theta-start"),
  thetaStartOutput: requireElement<HTMLOutputElement>("torus-analysis-theta-start-output"),
  tube: requireElement<HTMLInputElement>("torus-analysis-tube"),
  tubeOutput: requireElement<HTMLOutputElement>("torus-analysis-tube-output"),
  tubularSegments: requireElement<HTMLInputElement>("torus-analysis-tubular-segments"),
  tubularSegmentsOutput: requireElement<HTMLOutputElement>("torus-analysis-tubular-segments-output"),
  validation: requireElement("torus-analysis-validation"),
  viewButtons: document.querySelectorAll<HTMLButtonElement>("[data-torus-analysis-view]"),
})

const lineGeometry = (
  values: readonly number[],
): BufferGeometry => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(values), 3),
  )
  return geometry
}

const majorCircleGeometry = (
  radius: number,
  segments = 96,
): BufferGeometry => {
  const values: number[] = []
  for (let index = 0; index < segments; index += 1) {
    const from = index / segments * Math.PI * 2
    const to = (index + 1) / segments * Math.PI * 2
    values.push(
      Math.cos(from) * radius,
      Math.sin(from) * radius,
      0,
      Math.cos(to) * radius,
      Math.sin(to) * radius,
      0,
    )
  }
  return lineGeometry(values)
}

const formatAngle = (value: number): string => {
  const pi = value / Math.PI
  return `${value.toFixed(3)} rad · ${pi.toFixed(2)}π`
}

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

export const createTorusAnalysisLab = async (): Promise<TorusAnalysisLab> => {
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
    position: {x: 0, y: -4.8, z: 3.2},
    target: {x: 0, y: 0, z: 0},
  })
  viewPoint.getUp().set(0, 0, 1)

  let active = false
  let disposed = false
  let frame = 0
  let geometries: BufferGeometry[] = []

  const parameters = (): ThreeTorusParameters => ({
    radius: Number(elements.radius.value),
    tube: Number(elements.tube.value),
    radialSegments: Number(elements.radialSegments.value),
    tubularSegments: Number(elements.tubularSegments.value),
    arc: Number(elements.arc.value),
    thetaStart: Number(elements.thetaStart.value),
    thetaLength: Number(elements.thetaLength.value),
  })

  const defaultBindings = [
    {input: elements.radius, key: "radius"},
    {input: elements.tube, key: "tube"},
    {input: elements.radialSegments, key: "radialSegments"},
    {input: elements.tubularSegments, key: "tubularSegments"},
    {input: elements.arc, key: "arc"},
    {input: elements.thetaStart, key: "thetaStart"},
    {input: elements.thetaLength, key: "thetaLength"},
  ] as const
  const loadOurDefaults = (): ThreeTorusParameters => {
    try {
      const stored = localStorage.getItem(TORUS_DEFAULT_STORAGE_KEY)
      return stored === null
        ? {...METAFOR_TORUS_DEFAULTS}
        : mergeTorusDefaults(JSON.parse(stored))
    } catch {
      return {...METAFOR_TORUS_DEFAULTS}
    }
  }
  const persistOurDefaults = (
    defaults: ThreeTorusParameters,
  ): boolean => {
    try {
      localStorage.setItem(TORUS_DEFAULT_STORAGE_KEY, JSON.stringify(defaults))
      return true
    } catch {
      return false
    }
  }
  let ourDefaults = loadOurDefaults()
  for (const binding of defaultBindings) {
    binding.input.value = String(ourDefaults[binding.key])
  }
  // Range inputs normalize stored values to their legal step and bounds.
  ourDefaults = parameters()
  const formatDefault = (
    key: keyof ThreeTorusParameters,
    value: number,
  ): string => {
    switch (key) {
      case "radialSegments":
      case "tubularSegments":
        return String(Math.round(value))
      case "arc":
      case "thetaStart":
      case "thetaLength":
        return formatAngle(value)
      default:
        return value.toFixed(2)
    }
  }
  const renderOurDefaults = (): void => {
    for (const button of elements.defaultButtons) {
      const key = button.dataset.torusOurDefault as
        keyof ThreeTorusParameters | undefined
      if (!key || !torusParameterKeys.includes(key)) continue
      const formatted = formatDefault(key, ourDefaults[key])
      button.textContent = `Наш default · ${formatted}`
      button.title =
        `Сохранить текущее значение ${key} как наш default`
    }
  }
  let defaultStatusTimer = 0
  for (const button of elements.defaultButtons) {
    button.addEventListener("click", () => {
      const key = button.dataset.torusOurDefault as
        keyof ThreeTorusParameters | undefined
      if (!key || !torusParameterKeys.includes(key)) return
      const binding = defaultBindings.find((item) => item.key === key)
      if (!binding) return
      const current = Number(binding.input.value)
      ourDefaults = {...ourDefaults, [key]: current}
      const persisted = persistOurDefaults(ourDefaults)
      renderOurDefaults()
      elements.defaultStatus.textContent =
        `${key}: наш default ${formatDefault(key, current)}` +
        (persisted ? " · сохранён" : " · только до перезагрузки")
      if (defaultStatusTimer !== 0) clearTimeout(defaultStatusTimer)
      defaultStatusTimer = window.setTimeout(() => {
        elements.defaultStatus.textContent = ""
        defaultStatusTimer = 0
      }, 2400)
    })
  }
  renderOurDefaults()

  const updateOutputs = (
    input: ThreeTorusParameters,
    geometry: ThreeTorusGeometryResult,
  ): void => {
    elements.radiusOutput.value = input.radius.toFixed(2)
    elements.tubeOutput.value = input.tube.toFixed(2)
    elements.radialSegmentsOutput.value = String(input.radialSegments)
    elements.tubularSegmentsOutput.value = String(input.tubularSegments)
    elements.arcOutput.value = formatAngle(input.arc)
    elements.thetaStartOutput.value = formatAngle(input.thetaStart)
    elements.thetaLengthOutput.value = formatAngle(input.thetaLength)
    const metaFor = deriveMetaForTorusParameters(input)
    const formWidth = (input.radius + input.tube) * 2
    elements.innerDiameter.max = String(Math.max(0.1, formWidth - 0.2))
    elements.tubeDiameter.max = String(Math.max(
      0.1,
      (MAX_TORUS_WIDTH_MM - metaFor.innerDiameter) / 2,
    ))
    elements.innerDiameter.value = String(metaFor.innerDiameter)
    elements.innerDiameterOutput.value =
      `${metaFor.innerDiameter.toFixed(2)} мм`
    elements.tubeDiameter.value = String(metaFor.tubeDiameter)
    elements.tubeDiameterOutput.value =
      `${metaFor.tubeDiameter.toFixed(2)} мм`
    elements.formWidthOutput.value =
      `${formWidth.toFixed(2)} / ${MAX_TORUS_WIDTH_MM} мм`
    elements.formHeightOutput.value =
      `${metaFor.tubeDiameter.toFixed(2)} мм`
    const valid = input.tube < input.radius
    elements.validation.className = valid ? "valid" : "error"
    elements.validation.textContent = valid
      ? "Контракт соблюдён: tube < radius"
      : "Нарушение THREE: tube должен быть меньше radius"
    const outerRadius = input.radius + input.tube
    const innerRadius = input.radius - input.tube
    replaceReadout(elements.readout, [
      ["Outer radius", outerRadius.toFixed(3)],
      ["Inner radius", innerRadius.toFixed(3)],
      ["Outer diameter", (outerRadius * 2).toFixed(3)],
      ["Inner diameter", (innerRadius * 2).toFixed(3)],
      ["tube / radius", (input.tube / input.radius).toFixed(3)],
      ["Vertices", geometry.vertices.toLocaleString("ru-RU")],
      ["Triangles", geometry.triangles.toLocaleString("ru-RU")],
      ["Wire segments", geometry.lineSegments.toLocaleString("ru-RU")],
    ])
  }

  const retreatCameraToFit = (
    input: Pick<ThreeTorusParameters, "radius" | "tube">,
  ): void => {
    const target = viewPoint.getTarget()
    const delta = {
      x: viewPoint.position.x - target.x,
      y: viewPoint.position.y - target.y,
      z: viewPoint.position.z - target.z,
    }
    const currentDistance = Math.hypot(delta.x, delta.y, delta.z)
    const requiredDistance = torusCameraFitDistance(input)
    if (currentDistance >= requiredDistance) return
    const direction = currentDistance > 0.0001
      ? {
          x: delta.x / currentDistance,
          y: delta.y / currentDistance,
          z: delta.z / currentDistance,
        }
      : {x: 0, y: -1, z: 0}
    viewPoint.position.set(
      target.x + direction.x * requiredDistance,
      target.y + direction.y * requiredDistance,
      target.z + direction.z * requiredDistance,
    )
    viewPoint.update()
  }

  const rebuild = (): void => {
    if (disposed) return
    for (const geometry of geometries) renderer.invalidateGeometry(geometry)
    geometries = []
    for (const child of [...space.children]) space.remove(child)
    const input = parameters()
    const result = buildThreeTorusWireGeometry(input)
    const guide = majorCircleGeometry(input.radius)
    const axisExtent = (input.radius + input.tube) * 1.55
    const axes = lineGeometry([
      -axisExtent, 0, 0, axisExtent, 0, 0,
      0, -axisExtent, 0, 0, axisExtent, 0,
      0, 0, -axisExtent, 0, 0, axisExtent,
      input.radius, 0, 0, input.radius + input.tube, 0, 0,
      input.radius, 0, 0, input.radius, 0, input.tube,
    ])
    geometries.push(result.geometry, guide, axes)
    const torus = new LineSegments(
      result.geometry,
      new LineGlowMaterial({
        color: new Color(0.2, 0.82, 1, 0.9),
        glowColor: new Color(0.44, 0.91, 1, 0.34),
        glowIntensity: 2.4,
        luminanceBoost: 1.12,
        opacity: 1,
        visibilityMode: "scene",
      }),
    )
    torus.frustumCulled = false
    space.add(torus)
    const helperMaterial = new LineBasicMaterial({
      color: new Color(1, 1, 1, 0.42),
      opacity: 1,
    })
    const centerline = new LineSegments(guide, helperMaterial)
    centerline.frustumCulled = false
    space.add(centerline)
    const axisLines = new LineSegments(axes, helperMaterial)
    axisLines.frustumCulled = false
    space.add(axisLines)
    updateOutputs(input, result)
    retreatCameraToFit(input)
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
    const input = parameters()
    const extent = torusCameraFitDistance(input)
    viewPoint.getTarget().set(0, 0, 0)
    switch (view) {
      case "front":
        viewPoint.position.set(0, -extent, 0)
        viewPoint.getUp().set(0, 0, 1)
        break
      case "top":
        viewPoint.position.set(0, 0, extent)
        viewPoint.getUp().set(0, 1, 0)
        break
      default:
        viewPoint.position.set(0, -extent * 0.82, extent * 0.55)
        viewPoint.getUp().set(0, 0, 1)
        break
    }
    viewPoint.update()
    for (const button of elements.viewButtons) {
      button.classList.toggle(
        "active",
        button.dataset.torusAnalysisView === view,
      )
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
  let shiftPressed = false
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Shift") shiftPressed = true
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === "Shift") shiftPressed = false
  }
  const onWindowBlur = (): void => {
    shiftPressed = false
  }
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", onWindowBlur)
  const precisionDisposers: Array<() => void> = []
  const precisionInputs = [
    elements.radius,
    elements.tube,
    elements.arc,
    elements.thetaStart,
    elements.thetaLength,
    elements.innerDiameter,
    elements.tubeDiameter,
  ]
  for (const input of precisionInputs) {
    let dragStart: number | undefined
    let pointerId: number | undefined
    let pointerShift = false
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      dragStart = Number(input.value)
      pointerId = event.pointerId
      pointerShift = event.shiftKey
    }
    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) pointerShift = event.shiftKey
    }
    const onPointerEnd = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return
      dragStart = undefined
      pointerId = undefined
      pointerShift = false
    }
    const onPrecisionInput = (): void => {
      if (dragStart === undefined) return
      input.value = String(applyShiftRangePrecision(
        dragStart,
        Number(input.value),
        shiftPressed || pointerShift,
      ))
    }
    input.addEventListener("pointerdown", onPointerDown)
    input.addEventListener("input", onPrecisionInput)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerEnd)
    window.addEventListener("pointercancel", onPointerEnd)
    precisionDisposers.push(() => {
      input.removeEventListener("pointerdown", onPointerDown)
      input.removeEventListener("input", onPrecisionInput)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerEnd)
      window.removeEventListener("pointercancel", onPointerEnd)
    })
  }
  const independentInputs = [
    elements.radialSegments,
    elements.tubularSegments,
    elements.arc,
    elements.thetaStart,
    elements.thetaLength,
  ]
  for (const input of independentInputs) {
    input.addEventListener("input", rebuild)
  }
  const threeSizeInputs = [
    {input: elements.radius, parameter: "radius"},
    {input: elements.tube, parameter: "tube"},
  ] as const
  for (const binding of threeSizeInputs) {
    binding.input.addEventListener("input", () => {
      const next = constrainThreeTorusWidth(parameters(), binding.parameter)
      elements.radius.value = String(next.radius)
      elements.tube.value = String(next.tube)
      rebuild()
    })
  }
  const metaForInputs = [
    {
      input: elements.innerDiameter,
      parameter: "innerDiameter",
    },
    {
      input: elements.tubeDiameter,
      parameter: "tubeDiameter",
    },
  ] as const
  for (const binding of metaForInputs) {
    binding.input.addEventListener("input", () => {
      const next = applyMetaForTorusParameter(
        parameters(),
        binding.parameter,
        Number(binding.input.value),
      )
      elements.radius.value = String(next.radius)
      elements.tube.value = String(next.tube)
      rebuild()
    })
  }
  for (const button of elements.viewButtons) {
    button.addEventListener("click", () => {
      setView(button.dataset.torusAnalysisView ?? "perspective")
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
      if (defaultStatusTimer !== 0) clearTimeout(defaultStatusTimer)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onWindowBlur)
      for (const disposePrecision of precisionDisposers) disposePrecision()
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
