import {
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineGlowMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Renderer,
  Space,
  SphereGeometry,
  TorusGeometry,
  ViewPoint,
} from "@metafor/engine"
import {
  createQuantumFilmMaterial,
  deriveQuantumFilmPalette,
} from "../QuantumFilm.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"

export type FormSkinLabForm = "sphere" | "torus"

export type FormSkinId =
  | "quantum"
  | "wire"
  | "glow"
  | "silhouette"
  | "solid"
  | "hybrid"

export const FORM_SKIN_GEOMETRY = Object.freeze({
  detail: 48,
  size: 8,
  torusRadialSegments: 22,
  torusTubularSegments: 44,
  tubeRatio: 0.28,
})

type FormSkinDefinition = Readonly<{
  description: string
  id: FormSkinId
  label: string
  mesh: boolean
  wire: boolean
}>

export const FORM_SKINS: readonly FormSkinDefinition[] = [
  {
    id: "quantum",
    label: "Квантовая плёнка",
    description:
      "Однопроходная прозрачная мембрана: Френель-край, мягкий блик и thin-film интерференция.",
    mesh: true,
    wire: false,
  },
  {
    id: "wire",
    label: "Каркас",
    description: "Обычные depth-tested линии без свечения.",
    mesh: false,
    wire: true,
  },
  {
    id: "glow",
    label: "Свечение",
    description: "Светящийся каркас LineGlow с мягким bubble-эффектом.",
    mesh: false,
    wire: true,
  },
  {
    id: "silhouette",
    label: "Контур",
    description: "Разреженное тело и усиленный читаемый силуэт формы.",
    mesh: false,
    wire: true,
  },
  {
    id: "solid",
    label: "Сплошной",
    description: "Один непрозрачный mesh без каркасного прохода.",
    mesh: true,
    wire: false,
  },
  {
    id: "hybrid",
    label: "Гибрид",
    description: "Сплошное тело и отдельный светящийся каркас поверх него.",
    mesh: true,
    wire: true,
  },
]

type FormGeometry = Readonly<{
  mesh: BufferGeometry
  wire: BufferGeometry
}>

export type FormSkinLoadMetrics = Readonly<{
  drawCalls: number
  geometryBytes: number
  lineSegments: number
  passesPerForm: number
  renderObjects: number
  submittedVertices: number
  triangles: number
}>

const skinDefinition = (skinId: FormSkinId): FormSkinDefinition => {
  const definition = FORM_SKINS.find((skin) => skin.id === skinId)
  if (!definition) throw new Error(`Unknown form skin: ${skinId}`)
  return definition
}

const geometryBytes = (geometry: BufferGeometry): number => {
  let total = geometry.index?.array.byteLength ?? 0
  const arrays = new Set<ArrayBufferView>()
  for (const attribute of Object.values(geometry.attributes)) {
    arrays.add(attribute.array)
  }
  for (const array of arrays) total += array.byteLength
  return total
}

export const buildFormGeometry = (
  form: FormSkinLabForm,
  detail: number,
  size: number,
  tubeRatio: number,
  torusSegments: Readonly<{
    radial: number
    tubular: number
  }> = {
    radial: Math.max(6, Math.floor(Math.max(8, detail) / 3)),
    tubular: Math.max(8, Math.floor(detail)),
  },
): FormGeometry => {
  const safeDetail = Math.max(8, Math.floor(detail))
  const mesh = form === "sphere"
    ? new SphereGeometry({
        radius: size,
        widthSegments: safeDetail,
        heightSegments: Math.max(6, Math.floor(safeDetail / 2)),
      })
    : new TorusGeometry({
        radius: size * 0.68,
        tube: size * tubeRatio,
        radialSegments: Math.max(3, Math.floor(torusSegments.radial)),
        tubularSegments: Math.max(3, Math.floor(torusSegments.tubular)),
      })
  return {mesh, wire: mesh.toWireframe()}
}

export const measureFormSkinLoad = (
  geometry: FormGeometry,
  skinId: FormSkinId,
  copies: number,
): FormSkinLoadMetrics => {
  const skin = skinDefinition(skinId)
  const safeCopies = Math.max(1, Math.floor(copies))
  const meshIndices = geometry.mesh.index?.count ??
    geometry.mesh.attributes.position?.count ??
    0
  const wireVertices = geometry.wire.attributes.position?.count ?? 0
  const passes = Number(skin.mesh) + Number(skin.wire)
  return {
    drawCalls: safeCopies * passes,
    geometryBytes:
      (skin.mesh ? geometryBytes(geometry.mesh) : 0) +
      (skin.wire ? geometryBytes(geometry.wire) : 0),
    lineSegments: skin.wire ? wireVertices / 2 * safeCopies : 0,
    passesPerForm: passes,
    renderObjects: safeCopies * passes,
    submittedVertices: (
      (skin.mesh ? meshIndices : 0) +
      (skin.wire ? wireVertices : 0)
    ) * safeCopies,
    triangles: skin.mesh ? meshIndices / 3 * safeCopies : 0,
  }
}

export type FormSkinLab = Readonly<{
  dispose(): void
  hide(): void
  show(form: FormSkinLabForm): void
}>

type LabElements = Readonly<{
  benchmarkStatus: HTMLElement
  canvas: HTMLCanvasElement
  color: HTMLInputElement
  comparison: HTMLElement
  copies: HTMLInputElement
  copiesOutput: HTMLOutputElement
  description: HTMLElement
  glow: HTMLInputElement
  glowOutput: HTMLOutputElement
  highlightSize: HTMLInputElement
  highlightSizeOutput: HTMLOutputElement
  metrics: HTMLElement
  opacity: HTMLInputElement
  opacityOutput: HTMLOutputElement
  pixelRatio: HTMLInputElement
  pixelRatioOutput: HTMLOutputElement
  reset: HTMLButtonElement
  runAll: HTMLButtonElement
  runCurrent: HTMLButtonElement
  select: HTMLSelectElement
  title: HTMLElement
  variants: HTMLElement
}>

const requireElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Form Skin Lab element #${id} is missing`)
  return element as T
}

const labElements = (): LabElements => ({
  benchmarkStatus: requireElement("form-skin-benchmark-status"),
  canvas: requireElement<HTMLCanvasElement>("form-skin-canvas"),
  color: requireElement<HTMLInputElement>("form-skin-color"),
  comparison: requireElement("form-skin-comparison-body"),
  copies: requireElement<HTMLInputElement>("form-skin-copies"),
  copiesOutput: requireElement<HTMLOutputElement>("form-skin-copies-output"),
  description: requireElement("form-skin-description"),
  glow: requireElement<HTMLInputElement>("form-skin-glow"),
  glowOutput: requireElement<HTMLOutputElement>("form-skin-glow-output"),
  highlightSize: requireElement<HTMLInputElement>("form-skin-highlight-size"),
  highlightSizeOutput:
    requireElement<HTMLOutputElement>("form-skin-highlight-size-output"),
  metrics: requireElement("form-skin-metrics"),
  opacity: requireElement<HTMLInputElement>("form-skin-opacity"),
  opacityOutput: requireElement<HTMLOutputElement>("form-skin-opacity-output"),
  pixelRatio: requireElement<HTMLInputElement>("form-skin-pixel-ratio"),
  pixelRatioOutput: requireElement<HTMLOutputElement>("form-skin-pixel-ratio-output"),
  reset: requireElement<HTMLButtonElement>("form-skin-reset"),
  runAll: requireElement<HTMLButtonElement>("form-skin-run-all"),
  runCurrent: requireElement<HTMLButtonElement>("form-skin-run-current"),
  select: requireElement<HTMLSelectElement>("form-skin-select"),
  title: requireElement("form-skin-title"),
  variants: requireElement("form-skin-variants"),
})

const parseHexColor = (hex: string, alpha = 1): Color => {
  const value = Number.parseInt(hex.replace("#", ""), 16)
  return new Color(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    alpha,
  )
}

export const deriveFormSkinPalette = deriveQuantumFilmPalette

const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) return 0
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * ratio) - 1),
  )] ?? 0
}

const formatInteger = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0})

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`
}

type BenchmarkSnapshot = Readonly<{
  cpuAverageMs: number
  cpuP95Ms: number
  fps: number
  geometryBytes: number
  jankPercent: number
  lowFps: number
  submittedVertices: number
}>

type BrowserPerformanceMemory = Readonly<{
  jsHeapSizeLimit: number
  totalJSHeapSize: number
  usedJSHeapSize: number
}>

const performanceMemory = (): BrowserPerformanceMemory | null =>
  (performance as Performance & {memory?: BrowserPerformanceMemory}).memory ?? null

const replaceMetrics = (
  target: HTMLElement,
  values: ReadonlyArray<readonly [string, string | number]>,
): void => {
  target.replaceChildren(...values.flatMap(([label, value]) => {
    const term = document.createElement("dt")
    term.textContent = label
    const definition = document.createElement("dd")
    definition.textContent = String(value)
    return [term, definition]
  }))
}

const materialObjects = (
  geometry: FormGeometry,
  skinId: FormSkinId,
  color: Color,
  glowIntensity: number,
  highlightSize: number,
  opacity: number,
): readonly (LineSegments | Mesh)[] => {
  const palette = deriveFormSkinPalette(color, opacity)
  switch (skinId) {
    case "quantum":
      return [
        new Mesh(
          geometry.mesh,
          createQuantumFilmMaterial(color, {
            glowIntensity,
            highlightSize,
            opacity,
          }),
        ),
      ]
    case "wire":
      return [
        new LineSegments(
          geometry.wire,
          new LineBasicMaterial({color, opacity}),
        ),
      ]
    case "glow":
      return [
        new LineSegments(
          geometry.wire,
          new LineGlowMaterial({
            color,
            glowColor: palette.glow,
            glowIntensity,
            luminanceBoost: 1.12,
            opacity,
            shimmerAmount: 0.06,
            visibilityMode: "scene",
          }),
        ),
      ]
    case "silhouette":
      return [
        new LineSegments(
          geometry.wire,
          new LineGlowMaterial({
            color,
            glowColor: palette.glow,
            glowIntensity,
            luminanceBoost: 1.16,
            opacity,
            silhouetteAmount: 0.88,
            visibilityMode: "silhouette",
          }),
        ),
      ]
    case "solid":
      return [
        new Mesh(geometry.mesh, new MeshBasicMaterial({color})),
      ]
    case "hybrid":
      return [
        new Mesh(
          geometry.mesh,
          new MeshBasicMaterial({
            color: new Color(color.r * 0.22, color.g * 0.22, color.b * 0.22),
          }),
        ),
        new LineSegments(
          geometry.wire,
          new LineGlowMaterial({
            color,
            glowColor: palette.glow,
            glowIntensity,
            luminanceBoost: 1.18,
            opacity,
            visibilityMode: "overlay",
          }),
        ),
      ]
  }
}

export const createFormSkinLab = async (): Promise<FormSkinLab> => {
  const elements = labElements()
  for (const skin of FORM_SKINS) {
    const option = document.createElement("option")
    option.value = skin.id
    option.textContent = skin.label
    elements.select.append(option)

    const button = document.createElement("button")
    button.type = "button"
    button.dataset.skin = skin.id
    button.textContent = skin.label
    button.addEventListener("click", () => {
      cancelBenchmark()
      elements.select.value = skin.id
      rebuild(false)
    })
    elements.variants.append(button)
  }

  const renderer = new Renderer()
  await renderer.init(elements.canvas)
  const space = new Space()
  space.background = new Color(0.008, 0.019, 0.032)
  const viewPoint = new ViewPoint({
    element: elements.canvas,
    fov: Math.PI / 3.4,
    near: 0.01,
    far: 10000,
    position: {x: 0, y: -42, z: 8},
    target: {x: 0, y: 0, z: 0},
  })
  viewPoint.getUp().set(0, 0, 1)

  let active = false
  let disposed = false
  let form: FormSkinLabForm = "sphere"
  const annotation = createPageAnnotationLayer({
    sourceCanvas: elements.canvas,
    viewer: elements.canvas.parentElement ??
      (() => {
        throw new Error("Form Skin canvas parent is missing")
      })(),
    capturePng: () => renderer.captureLastPresentedFramePng(),
    surface: () => ({
      canvasId: elements.canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: form === "sphere" ? "skin-sphere" : "skin-torus",
      title: form === "sphere"
        ? "Sphere · скины формы"
        : "Torus · скины формы",
    }),
  })
  let geometry: FormGeometry | null = null
  let loadMetrics: FormSkinLoadMetrics | null = null
  let geometryBuildMs = 0
  let sceneBuildMs = 0
  let frame = 0
  let lastFrameAt = 0
  let lastMetricsAt = 0
  let benchmarking = false
  let benchmarkCollectsSamples = false
  let cpuSamples: number[] = []
  let frameSamples: number[] = []
  let benchmarkVersion = 0
  const comparisons = new Map<FormSkinId, BenchmarkSnapshot>()

  const selectedSkin = (): FormSkinId => elements.select.value as FormSkinId

  const resetSamples = (): void => {
    lastFrameAt = 0
    lastMetricsAt = 0
    cpuSamples = []
    frameSamples = []
  }

  const clearComparisons = (): void => {
    comparisons.clear()
    elements.comparison.replaceChildren()
  }

  const cancelBenchmark = (): void => {
    benchmarkVersion += 1
    benchmarking = false
    benchmarkCollectsSamples = false
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    elements.runAll.disabled = false
    elements.runCurrent.disabled = false
    elements.benchmarkStatus.textContent = ""
  }

  const renderComparisons = (): void => {
    elements.comparison.replaceChildren(...FORM_SKINS.map((skin) => {
      const result = comparisons.get(skin.id)
      const row = document.createElement("tr")
      if (skin.id === selectedSkin()) row.className = "active"
      const values = result
        ? [
            skin.label,
            result.fps.toFixed(1),
            result.lowFps.toFixed(1),
            `${result.cpuAverageMs.toFixed(2)} ms`,
            `${result.cpuP95Ms.toFixed(2)} ms`,
            `${result.jankPercent.toFixed(1)}%`,
            formatInteger.format(result.submittedVertices),
            formatBytes(result.geometryBytes),
          ]
        : [skin.label, "—", "—", "—", "—", "—", "—", "—"]
      for (const value of values) {
        const cell = document.createElement("td")
        cell.textContent = value
        row.append(cell)
      }
      return row
    }))
  }

  const updateOutputs = (): void => {
    const skin = skinDefinition(selectedSkin())
    elements.description.textContent = skin.description
    elements.copiesOutput.value = elements.copies.value
    elements.pixelRatioOutput.value = `${Number(elements.pixelRatio.value).toFixed(2)}×`
    elements.glowOutput.value = Number(elements.glow.value).toFixed(1)
    elements.highlightSizeOutput.value =
      Number(elements.highlightSize.value).toFixed(2)
    elements.opacityOutput.value = Number(elements.opacity.value).toFixed(2)
    elements.glow.disabled = selectedSkin() === "wire" || selectedSkin() === "solid"
    elements.highlightSize.disabled = selectedSkin() !== "quantum"
    elements.opacity.disabled = selectedSkin() === "solid"
    for (const button of elements.variants.querySelectorAll<HTMLButtonElement>("button")) {
      button.classList.toggle("active", button.dataset.skin === selectedSkin())
    }
    renderComparisons()
  }

  const resize = (): void => {
    const rect = elements.canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    renderer.setPixelRatio(Number(elements.pixelRatio.value))
    renderer.setSize(Math.floor(rect.width), Math.floor(rect.height))
    viewPoint.setAspectRatio(rect.width / rect.height)
    viewPoint.update()
  }

  const fitCamera = (): void => {
    const copies = Math.max(1, Number(elements.copies.value))
    const columns = Math.ceil(Math.sqrt(copies))
    const rows = Math.ceil(copies / columns)
    const spacing = FORM_SKIN_GEOMETRY.size * 2.35
    const width = Math.max(spacing, columns * spacing)
    const height = Math.max(spacing, rows * spacing)
    const visibleHeight = Math.max(height, width / Math.max(0.25, viewPoint.aspect))
    const distance = visibleHeight / 2 / Math.tan(viewPoint.fov / 2) * 1.18
    viewPoint.getTarget().set(0, 0, 0)
    viewPoint.position.set(0, -Math.max(22, distance), 0)
    viewPoint.getUp().set(0, 0, 1)
    viewPoint.update()
  }

  function rebuild(refit: boolean): void {
    if (disposed) return
    const sceneBuildStartedAt = performance.now()
    if (geometry) {
      renderer.invalidateGeometry(geometry.mesh)
      renderer.invalidateGeometry(geometry.wire)
    }
    for (const child of [...space.children]) space.remove(child)
    const {
      detail,
      size,
      torusRadialSegments,
      torusTubularSegments,
      tubeRatio,
    } = FORM_SKIN_GEOMETRY
    const copies = Math.max(1, Number(elements.copies.value))
    const skinId = selectedSkin()
    const color = parseHexColor(elements.color.value)
    const geometryBuildStartedAt = performance.now()
    geometry = buildFormGeometry(form, detail, size, tubeRatio, {
      radial: torusRadialSegments,
      tubular: torusTubularSegments,
    })
    geometryBuildMs = performance.now() - geometryBuildStartedAt
    loadMetrics = measureFormSkinLoad(geometry, skinId, copies)

    const columns = Math.ceil(Math.sqrt(copies))
    const rows = Math.ceil(copies / columns)
    const spacing = size * 2.35
    for (let index = 0; index < copies; index += 1) {
      const column = index % columns
      const row = Math.floor(index / columns)
      const root = new Object3D()
      root.position.set(
        (column - (columns - 1) / 2) * spacing,
        0,
        ((rows - 1) / 2 - row) * spacing,
      )
      if (form === "torus") root.rotation.x = Math.PI / 2
      for (const object of materialObjects(
        geometry,
        skinId,
        color,
        Number(elements.glow.value),
        Number(elements.highlightSize.value),
        Number(elements.opacity.value),
      )) {
        root.add(object)
      }
      space.add(root)
    }
    sceneBuildMs = performance.now() - sceneBuildStartedAt
    updateOutputs()
    resetSamples()
    resize()
    if (refit) fitCamera()
    requestRender()
  }

  const renderMetrics = (): void => {
    if (!loadMetrics) return
    const averageCpu = cpuSamples.length === 0
      ? 0
      : cpuSamples.reduce((sum, value) => sum + value, 0) / cpuSamples.length
    const averageFrame = frameSamples.length === 0
      ? 0
      : frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length
    const fps = averageFrame > 0 ? 1000 / averageFrame : 0
    const frameP95 = percentile(frameSamples, 0.95)
    const frameP99 = percentile(frameSamples, 0.99)
    const lowFps = frameP99 > 0 ? 1000 / frameP99 : 0
    const jankPercent = frameSamples.length === 0
      ? 0
      : frameSamples.filter((value) => value > 20).length /
        frameSamples.length * 100
    const longFramePercent = frameSamples.length === 0
      ? 0
      : frameSamples.filter((value) => value > 33.334).length /
        frameSamples.length * 100
    const cpuP95 = percentile(cpuSamples, 0.95)
    const cpuMax = cpuSamples.length === 0 ? 0 : Math.max(...cpuSamples)
    const pixelCount = elements.canvas.width * elements.canvas.height
    const renderTargetBytes = pixelCount * 40
    const heap = performanceMemory()
    const hasFrameSamples = frameSamples.length > 0
    const values: Array<readonly [string, string | number]> = [
      ["FPS · benchmark", hasFrameSamples ? fps.toFixed(1) : "по запросу"],
      ["FPS · 1% low", hasFrameSamples ? lowFps.toFixed(1) : "—"],
      ["Frame · avg", hasFrameSamples ? `${averageFrame.toFixed(2)} ms` : "—"],
      ["Frame · p95", hasFrameSamples ? `${frameP95.toFixed(2)} ms` : "—"],
      ["Jank > 20 ms", hasFrameSamples ? `${jankPercent.toFixed(1)}%` : "—"],
      ["Long > 33 ms", hasFrameSamples ? `${longFramePercent.toFixed(1)}%` : "—"],
      ["CPU submit · avg", `${averageCpu.toFixed(2)} ms`],
      ["CPU submit · p95", `${cpuP95.toFixed(2)} ms`],
      ["CPU submit · max", `${cpuMax.toFixed(2)} ms`],
      ["CPU budget @60", `${(averageCpu / 16.667 * 100).toFixed(1)}%`],
      [
        "CPU / draw call",
        `${(averageCpu / Math.max(1, loadMetrics.drawCalls)).toFixed(3)} ms`,
      ],
      [
        "CPU / 1M vertex refs",
        `${(
          averageCpu / Math.max(1, loadMetrics.submittedVertices) * 1_000_000
        ).toFixed(2)} ms`,
      ],
      ["Passes / form", loadMetrics.passesPerForm],
      ["Draw calls", formatInteger.format(loadMetrics.drawCalls)],
      ["Render objects", formatInteger.format(loadMetrics.renderObjects)],
      ["Vertex refs / frame", formatInteger.format(loadMetrics.submittedVertices)],
      ["Triangles / frame", formatInteger.format(loadMetrics.triangles)],
      ["Line segments / frame", formatInteger.format(loadMetrics.lineSegments)],
      ["Geometry buffers · min", formatBytes(loadMetrics.geometryBytes)],
      ["Framebuffer", `${elements.canvas.width} × ${elements.canvas.height}`],
      ["Framebuffer pixels", formatInteger.format(pixelCount)],
      ["Render targets · ~", formatBytes(renderTargetBytes)],
      ["Geometry build", `${geometryBuildMs.toFixed(2)} ms`],
      ["Scene rebuild", `${sceneBuildMs.toFixed(2)} ms`],
    ]
    if (heap) {
      values.push(
        ["JS heap · used", formatBytes(heap.usedJSHeapSize)],
        ["JS heap · total", formatBytes(heap.totalJSHeapSize)],
      )
    }
    replaceMetrics(elements.metrics, values)
    if (cpuSamples.length >= 15 && frameSamples.length >= 15) {
      comparisons.set(selectedSkin(), {
        cpuAverageMs: averageCpu,
        cpuP95Ms: cpuP95,
        fps,
        geometryBytes: loadMetrics.geometryBytes,
        jankPercent,
        lowFps,
        submittedVertices: loadMetrics.submittedVertices,
      })
      renderComparisons()
    }
  }

  const renderScene = (
    timestamp: number,
    collectFrameSample: boolean,
  ): void => {
    if (collectFrameSample && lastFrameAt > 0) {
      const delta = timestamp - lastFrameAt
      if (delta > 0 && delta < 1000) {
        frameSamples.push(delta)
        if (frameSamples.length > 120) frameSamples.shift()
      }
    }
    lastFrameAt = collectFrameSample ? timestamp : 0
    space.updateWorldMatrix()
    const startedAt = performance.now()
    renderer.render(space, viewPoint)
    cpuSamples.push(performance.now() - startedAt)
    if (cpuSamples.length > 120) cpuSamples.shift()
    if (lastMetricsAt === 0 || timestamp - lastMetricsAt >= 250) {
      lastMetricsAt = timestamp
      renderMetrics()
    }
  }

  const renderOnce = (timestamp: number): void => {
    frame = 0
    if (!active || disposed || benchmarking) return
    renderScene(timestamp, false)
    renderMetrics()
  }

  const renderBenchmarkFrame = (timestamp: number): void => {
    frame = 0
    if (!active || disposed || !benchmarking) return
    renderScene(timestamp, benchmarkCollectsSamples)
    frame = requestAnimationFrame(renderBenchmarkFrame)
  }

  function requestRender(): void {
    if (!active || disposed || benchmarking || frame !== 0) return
    frame = requestAnimationFrame(renderOnce)
  }

  const delay = async (durationMs: number): Promise<void> => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, durationMs))
  }

  const runAllBenchmarks = async (): Promise<void> => {
    cancelBenchmark()
    const version = benchmarkVersion
    clearComparisons()
    elements.runAll.disabled = true
    elements.runCurrent.disabled = true
    benchmarking = true
    benchmarkCollectsSamples = false
    frame = requestAnimationFrame(renderBenchmarkFrame)
    for (let index = 0; index < FORM_SKINS.length; index += 1) {
      const skin = FORM_SKINS[index]!
      if (disposed || !active || version !== benchmarkVersion) return
      benchmarkCollectsSamples = false
      elements.select.value = skin.id
      elements.benchmarkStatus.textContent =
        `${index + 1}/${FORM_SKINS.length} · ${skin.label} · прогрев`
      rebuild(false)
      await delay(600)
      if (disposed || !active || version !== benchmarkVersion) return
      resetSamples()
      benchmarkCollectsSamples = true
      elements.benchmarkStatus.textContent =
        `${index + 1}/${FORM_SKINS.length} · ${skin.label} · измерение`
      await delay(1400)
      if (disposed || !active || version !== benchmarkVersion) return
      renderMetrics()
    }
    if (version !== benchmarkVersion) return
    benchmarking = false
    benchmarkCollectsSamples = false
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    elements.runAll.disabled = false
    elements.runCurrent.disabled = false
    elements.benchmarkStatus.textContent =
      "Сравнение завершено · одинаковая геометрия и нагрузка"
    requestRender()
  }

  const runCurrentBenchmark = async (): Promise<void> => {
    cancelBenchmark()
    const version = benchmarkVersion
    elements.runAll.disabled = true
    elements.runCurrent.disabled = true
    benchmarking = true
    benchmarkCollectsSamples = false
    frame = requestAnimationFrame(renderBenchmarkFrame)
    elements.benchmarkStatus.textContent =
      `${skinDefinition(selectedSkin()).label} · прогрев`
    await delay(600)
    if (disposed || !active || version !== benchmarkVersion) return
    resetSamples()
    benchmarkCollectsSamples = true
    elements.benchmarkStatus.textContent =
      `${skinDefinition(selectedSkin()).label} · измерение 2 сек`
    await delay(2000)
    if (disposed || !active || version !== benchmarkVersion) return
    renderMetrics()
    benchmarking = false
    benchmarkCollectsSamples = false
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    elements.runAll.disabled = false
    elements.runCurrent.disabled = false
    elements.benchmarkStatus.textContent =
      `${skinDefinition(selectedSkin()).label} · замер завершён`
    requestRender()
  }

  const observer = new ResizeObserver(() => {
    resize()
    annotation.resize()
    requestRender()
  })
  observer.observe(elements.canvas)

  elements.select.addEventListener("change", () => {
    cancelBenchmark()
    rebuild(false)
  })
  elements.copies.addEventListener("input", () => {
    cancelBenchmark()
    clearComparisons()
    rebuild(true)
  })
  elements.pixelRatio.addEventListener("input", () => {
    cancelBenchmark()
    clearComparisons()
    updateOutputs()
    resetSamples()
    resize()
    requestRender()
  })
  elements.color.addEventListener("input", () => {
    cancelBenchmark()
    comparisons.delete(selectedSkin())
    rebuild(false)
  })
  elements.glow.addEventListener("input", () => {
    cancelBenchmark()
    comparisons.delete(selectedSkin())
    rebuild(false)
  })
  elements.highlightSize.addEventListener("input", () => {
    cancelBenchmark()
    comparisons.delete(selectedSkin())
    rebuild(false)
  })
  elements.opacity.addEventListener("input", () => {
    cancelBenchmark()
    comparisons.delete(selectedSkin())
    rebuild(false)
  })
  elements.reset.addEventListener("click", () => {
    cancelBenchmark()
    clearComparisons()
    resetSamples()
    renderMetrics()
    requestRender()
  })
  elements.runAll.addEventListener("click", () => {
    void runAllBenchmarks()
  })
  elements.runCurrent.addEventListener("click", () => {
    void runCurrentBenchmark()
  })
  const requestRenderFromDrag = (event: MouseEvent): void => {
    if (event.buttons !== 0) requestRender()
  }
  const requestRenderFromCamera = (): void => requestRender()
  elements.canvas.addEventListener("mousemove", requestRenderFromDrag)
  elements.canvas.addEventListener("wheel", requestRenderFromCamera)
  elements.canvas.addEventListener("touchmove", requestRenderFromCamera)

  elements.select.value = "quantum"
  rebuild(true)

  return {
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      cancelBenchmark()
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      annotation.dispose()
      elements.canvas.removeEventListener("mousemove", requestRenderFromDrag)
      elements.canvas.removeEventListener("wheel", requestRenderFromCamera)
      elements.canvas.removeEventListener("touchmove", requestRenderFromCamera)
      viewPoint.dispose()
      if (geometry) {
        renderer.invalidateGeometry(geometry.mesh)
        renderer.invalidateGeometry(geometry.wire)
      }
    },
    hide() {
      active = false
      annotation.hide()
      cancelBenchmark()
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      resetSamples()
    },
    show(nextForm: FormSkinLabForm) {
      active = true
      if (form !== nextForm) {
        annotation.hide()
        form = nextForm
        clearComparisons()
        elements.title.textContent = form === "sphere"
          ? "Sphere · скины формы"
          : "Torus · скины формы"
        rebuild(true)
      } else {
        resize()
        fitCamera()
      }
      annotation.show()
      requestRender()
    },
  }
}
