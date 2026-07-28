import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkLayoutSettings} from "@metafor/types/bulk/settings"
import type {BulkVisualLayer} from "@metafor/types/bulk/viewport"
import {
  Visual,
  buildStateGraph,
  buildStateGraphRootLayout,
  countVisualScene,
  createStateGraphViewport,
  describeStateGraphRoot,
  projectVisualScene,
  type StateGraphView,
  type StateGraphViewport,
  visualComponentForSlug,
} from "@metafor/visual"
import {buildBulkManifestation} from "../../../bulk/manifestation.ts"
import {BulkProjectionStore} from "../../../bulk/projection.ts"
import {DEFAULT_BULK_SETTINGS} from "../../../bulk/settings.ts"
import {createBulkViewport} from "../../../bulk/web/index.ts"
import {
  createStateGraphAnnotationLayer,
  type StateGraphAnnotationLayer,
} from "./AnnotationLayer.ts"
import {
  createFormSkinLab,
  type FormSkinLab,
  type FormSkinLabForm,
} from "./FormSkinLab.ts"
import {createEdgesLab, type EdgesLab} from "./EdgesLab.ts"
import {
  createTorusAnalysisLab,
  type TorusAnalysisLab,
} from "./TorusAnalysisLab.ts"
import {metaStateDslSource} from "./MetaSource.ts"
import snapshotJson from "./fixture/monad-snapshot.json"

const snapshot = snapshotJson as BulkObserverSnapshot
const app = document.querySelector("main")
const canvas = document.getElementById("visual-canvas") as HTMLCanvasElement | null
const navigation = document.getElementById("navigation")
const controlsAside = document.getElementById("controls")
const visualTitle = document.getElementById("title")
const visualControls = document.getElementById("visual-controls")
const entity = document.getElementById("entity")
const description = document.getElementById("description")
const counts = document.getElementById("counts")
const context = document.getElementById("context") as HTMLInputElement | null
const labels = document.getElementById("labels") as HTMLInputElement | null
const grid = document.getElementById("grid") as HTMLInputElement | null
const animation = document.getElementById("animation") as HTMLInputElement | null
const inner = document.getElementById("inner") as HTMLInputElement | null
const radius = document.getElementById("radius") as HTMLInputElement | null
const gap = document.getElementById("gap") as HTMLInputElement | null
const innerOutput = document.getElementById("inner-output")
const radiusOutput = document.getElementById("radius-output")
const gapOutput = document.getElementById("gap-output")
const stateGraphStage = document.getElementById("state-graph-stage")
const stateGraphOverviewTitle = document.getElementById("state-graph-overview-title")
const stateGraphOverview = document.getElementById("state-graph-overview")
const stateGraphCards = document.getElementById("state-graph-cards")
const stateGraphControls = document.getElementById("state-graph-controls")
const stateGraphAtom = document.getElementById("state-graph-atom") as HTMLSelectElement | null
const stateGraphCounts = document.getElementById("state-graph-counts")
const stateGraphSummary = document.getElementById("state-graph-summary")
const stateGraphDslPath = document.getElementById("state-graph-dsl-path")
const stateGraphDsl = document.getElementById("state-graph-dsl")
const stateGraphJson = document.getElementById("state-graph-json")
const formSkinStage = document.getElementById("form-skin-stage")
const formSkinControls = document.getElementById("form-skin-controls")
const edgesStage = document.getElementById("edges-stage")
const torusAnalysisStage = document.getElementById("torus-analysis-stage")

if (
  !app ||
  !canvas ||
  !navigation ||
  !controlsAside ||
  !visualTitle ||
  !visualControls ||
  !entity ||
  !description ||
  !counts ||
  !context ||
  !labels ||
  !grid ||
  !animation ||
  !inner ||
  !radius ||
  !gap ||
  !innerOutput ||
  !radiusOutput ||
  !gapOutput ||
  !stateGraphStage ||
  !stateGraphOverviewTitle ||
  !stateGraphOverview ||
  !stateGraphCards ||
  !stateGraphControls ||
  !stateGraphAtom ||
  !stateGraphCounts ||
  !stateGraphSummary ||
  !stateGraphDslPath ||
  !stateGraphDsl ||
  !stateGraphJson ||
  !formSkinStage ||
  !formSkinControls ||
  !edgesStage ||
  !torusAnalysisStage
) throw new Error("Visual playground shell is incomplete")

const projection = new BulkProjectionStore()
projection.hydrate(structuredClone(snapshot.projection))

const layout: BulkLayoutSettings = {...DEFAULT_BULK_SETTINGS.layout}
inner.value = String(layout.rootInnerDiameterMm)
radius.value = String(layout.rootSphereRadiusMm)
gap.value = String(layout.orbitEdgeGapMm)

const runtime = projection.view()
const wimpName = new Map(runtime.wimps.map((wimp) => [wimp.src, wimp.name ?? wimp.src] as const))
const graphAtoms = [...runtime.atoms].sort((left, right) =>
  Number(left.parentAtom !== null || left.parentTopology !== null) -
    Number(right.parentAtom !== null || right.parentTopology !== null) ||
  left.position - right.position ||
  left.id - right.id
)
for (const atom of graphAtoms) {
  const option = document.createElement("option")
  option.value = String(atom.id)
  option.textContent = `${wimpName.get(atom.wimp) ?? atom.wimp} · Atom ${atom.id}`
  stateGraphAtom.append(option)
}
const defaultGraphAtom = graphAtoms.find((atom) => atom.wimp === snapshot.rootSrc) ?? graphAtoms[0]
if (defaultGraphAtom) stateGraphAtom.value = String(defaultGraphAtom.id)

const readSlug = (): string =>
  location.hash.replace(/^#\/?/, "").trim().toLowerCase() || "atom"

const size = (): {width: number; height: number} => {
  const rect = canvas.getBoundingClientRect()
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  }
}

const initialComponent = visualComponentForSlug(readSlug())
const viewport = await createBulkViewport({
  canvas,
  ...size(),
  visualLayers: initialComponent.layers,
})

const storyLayers = (): BulkVisualLayer[] => {
  const component = visualComponentForSlug(readSlug())
  const selected = new Set(component.layers)
  if (context.checked) {
    selected.add("atom")
    selected.add("matter")
  }
  if (!labels.checked) selected.delete("label")
  if (!grid.checked) selected.delete("grid")
  return [...selected]
}

const renderCounts = (manifest: ReturnType<typeof projectVisualScene>): void => {
  const sceneCounts = countVisualScene(manifest)
  const values: Array<[string, number]> = [
    ["Atoms", sceneCounts.atoms],
    ["Fields", sceneCounts.fields],
    ["Orbitals", sceneCounts.orbitals],
    ["Transitions", sceneCounts.transitions],
    ["Relations", sceneCounts.relations],
  ]
  counts.replaceChildren(...values.flatMap(([label, value]) => {
    const term = document.createElement("dt")
    term.textContent = label
    const definition = document.createElement("dd")
    definition.textContent = String(value)
    return [term, definition]
  }))
}

const replaceDefinitionList = (
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

type BranchViewport = {
  annotation: StateGraphAnnotationLayer
  observer: ResizeObserver
  viewport: StateGraphViewport
}

let branchViewports: BranchViewport[] = []
let stateGraphRenderVersion = 0
let formSkinLabPromise: Promise<FormSkinLab> | null = null
let edgesLabPromise: Promise<EdgesLab> | null = null
let torusAnalysisLabPromise: Promise<TorusAnalysisLab> | null = null

const formSkinForSlug = (slug: string): FormSkinLabForm | null => {
  if (slug === "skin-sphere") return "sphere"
  if (slug === "skin-torus") return "torus"
  return null
}

const formSkinLab = (): Promise<FormSkinLab> => {
  formSkinLabPromise ??= createFormSkinLab()
  return formSkinLabPromise
}

const hideFormSkinLab = (): void => {
  if (formSkinLabPromise) void formSkinLabPromise.then((lab) => lab.hide())
}

const edgesLab = (): Promise<EdgesLab> => {
  edgesLabPromise ??= createEdgesLab()
  return edgesLabPromise
}

const hideEdgesLab = (): void => {
  if (edgesLabPromise) void edgesLabPromise.then((lab) => lab.hide())
}

const torusAnalysisLab = (): Promise<TorusAnalysisLab> => {
  torusAnalysisLabPromise ??= createTorusAnalysisLab()
  return torusAnalysisLabPromise
}

const hideTorusAnalysisLab = (): void => {
  if (torusAnalysisLabPromise) {
    void torusAnalysisLabPromise.then((lab) => lab.hide())
  }
}

const disposeBranchViewports = (): void => {
  for (const runtime of branchViewports) {
    runtime.observer.disconnect()
    runtime.annotation.dispose()
    runtime.viewport.dispose()
  }
  branchViewports = []
}

const renderStateGraph = async (): Promise<void> => {
  const renderVersion = ++stateGraphRenderVersion
  disposeBranchViewports()
  const atomId = Number(stateGraphAtom.value)
  const graph = buildStateGraph(projection.view(), atomId)
  const stateById = new Map(graph.states.map((state) => [state.id, state] as const))
  const current = graph.currentStateId === null
    ? null
    : stateById.get(graph.currentStateId) ?? null

  stateGraphOverviewTitle.textContent = current
    ? `Текущий State: ${current.name}`
    : `${graph.atomLabel}: текущий State отсутствует`
  stateGraphOverview.textContent = current
    ? `Atom «${graph.atomLabel}», текущий State — «${current.name}». Ниже каждый объявленный State является стартом отдельного графа со всеми его возможными путями и ветвлениями.`
    : `Atom «${graph.atomLabel}». Ниже каждый объявленный State является стартом отдельного графа со всеми его возможными путями и ветвлениями.`

  replaceDefinitionList(stateGraphCounts, [
    ["Объявлено State", graph.states.length],
    ["Достижимо из текущего", graph.reachableStateIds.length],
    ["Стартовых State", new Set(graph.sleeves.map((sleeve) => sleeve.rootStateId)).size],
    ["Карточек-графов", graph.states.length],
    ["Возможных путей", graph.sleeves.length],
    ["Transition-шагов в путях", graph.sleeves.reduce(
      (count, sleeve) => count + sleeve.transitionIds.length,
      0,
    )],
  ])
  stateGraphSummary.textContent =
    "Одна карточка — один стартовый State и все его ветвления. Каждая вертикальная линия — минимальный шаг достижения State; цикл возвращается дугой к существующей State-сфере."
  const metaSource = metaStateDslSource(graph.src)
  stateGraphDslPath.textContent = metaSource?.path ?? `Meta-пакет ${graph.src} не найден`
  stateGraphDsl.textContent = metaSource?.dsl ?? "MetaFor DSL недоступен."
  stateGraphJson.textContent = JSON.stringify(graph, null, 2)
  stateGraphCards.replaceChildren()

  if (graph.sleeves.length === 0) {
    const empty = document.createElement("p")
    empty.className = "state-graph-empty"
    empty.textContent = graph.states.length === 0
      ? "Для выбранного Atom не объявлен State-граф."
      : "Для объявленных State не удалось построить пути."
    stateGraphCards.append(empty)
    return
  }

  const pendingViewports = graph.states.map(async (rootState, rootIndex) => {
    const layout = buildStateGraphRootLayout(graph, rootState.id)
    const details = describeStateGraphRoot(graph, layout, rootIndex)
    const card = document.createElement("article")
    card.className = "state-branch-card"

    const viewer = document.createElement("section")
    viewer.className = "state-branch-viewer"
    const branchCanvas = document.createElement("canvas")
    branchCanvas.className = "state-branch-canvas"
    const hint = document.createElement("span")
    hint.className = "state-branch-hint"
    hint.textContent = "drag — вращение · wheel — масштаб"
    const viewCube = document.createElement("div")
    viewCube.className = "state-view-cube"
    viewCube.setAttribute("aria-label", "Выбор ортогонального вида")
    const cubeBody = document.createElement("div")
    cubeBody.className = "state-view-cube-body"
    const cubeFaces: readonly {
      label: string
      title: string
      view: StateGraphView
    }[] = [
      {view: "front", label: "ПЕРЕД", title: "Вид спереди"},
      {view: "back", label: "СЗАДИ", title: "Вид сзади"},
      {view: "right", label: "ПРАВО", title: "Вид справа"},
      {view: "left", label: "ЛЕВО", title: "Вид слева"},
      {view: "top", label: "ВЕРХ", title: "Вид сверху"},
      {view: "bottom", label: "НИЗ", title: "Вид снизу"},
    ]
    const cubeButtons = cubeFaces.map(({view, label, title: faceTitle}) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = `state-view-cube-face ${view}`
      button.dataset.view = view
      button.textContent = label
      button.title = faceTitle
      cubeBody.append(button)
      return button
    })
    viewCube.append(cubeBody)
    viewer.append(branchCanvas, viewCube, hint)

    const detail = document.createElement("section")
    detail.className = "state-branch-detail"
    const heading = document.createElement("div")
    heading.className = "state-branch-heading"
    const title = document.createElement("h3")
    title.textContent = details.title
    const outcome = document.createElement("span")
    outcome.className = "state-branch-outcome"
    outcome.textContent = `${details.pathCount} ${
      details.pathCount === 1 ? "путь" : "пути"
    }`
    heading.append(title, outcome)

    const pathLabel = document.createElement("div")
    pathLabel.className = "state-branch-section-label"
    pathLabel.textContent = "Возможные пути"
    const paths = document.createElement("ol")
    paths.className = "state-branch-transitions"
    for (const path of details.paths) {
      const item = document.createElement("li")
      item.textContent = path
      paths.append(item)
    }
    const outcomeText = document.createElement("p")
    outcomeText.className = "state-branch-outcome-text"
    outcomeText.textContent =
      "Каждая вертикальная направляющая — шаг первого достижения State. Оранжевая обратная дуга возвращается к уже существующей сфере и показывает цикл."

    const branchCounts = document.createElement("dl")
    branchCounts.className = "state-branch-counts"
    replaceDefinitionList(branchCounts, [
      ["State-сфер", details.nodeCount],
      ["Transition-дуг", details.transitionCount],
      ["Условий на дугах", details.conditionCount],
      ["Шагов", details.levelCount],
      ["Путей", details.pathCount],
    ])

    detail.append(
      heading,
      pathLabel,
      paths,
      outcomeText,
      branchCounts,
    )
    card.append(viewer, detail)
    stateGraphCards.append(card)

    const canvasSize = (): {width: number; height: number} => {
      const rect = branchCanvas.getBoundingClientRect()
      return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      }
    }
    const branchViewport = await createStateGraphViewport({
      canvas: branchCanvas,
      layout,
      ...canvasSize(),
    })
    if (renderVersion !== stateGraphRenderVersion) {
      branchViewport.dispose()
      return
    }
    for (const button of cubeButtons) {
      button.addEventListener("click", () => {
        const view = button.dataset.view as StateGraphView
        branchViewport.setView(view)
        for (const peer of cubeButtons) {
          peer.classList.toggle("active", peer === button)
        }
      })
    }
    const annotation = createStateGraphAnnotationLayer({
      sourceCanvas: branchCanvas,
      viewer,
      viewport: branchViewport,
      context: () => ({
        atom: {
          id: graph.atomId,
          label: graph.atomLabel,
          src: graph.src,
          currentStateId: graph.currentStateId,
        },
        graph: {
          cardIndex: rootIndex,
          rootStateId: rootState.id,
          rootStateLabel: rootState.name,
          dslPath: metaSource?.path ?? null,
          layout,
          paths: details.paths,
        },
      }),
    })
    const observer = new ResizeObserver(() => {
      const next = canvasSize()
      branchViewport.setSize(next.width, next.height)
      annotation.resize()
    })
    observer.observe(branchCanvas)
    branchViewports.push({annotation, observer, viewport: branchViewport})
  })

  await Promise.all(pendingViewports)
}

const applyStateGraphPage = (): void => {
  app.classList.add("state-graph-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  controlsAside.hidden = false
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = false
  stateGraphControls.hidden = false
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  viewport.setAnimationEnabled(false)
  void renderStateGraph()
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === "state-graph")
  }
}

const applyFormSkinPage = (form: FormSkinLabForm): void => {
  const slug = readSlug()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.add("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  controlsAside.hidden = false
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  formSkinStage.hidden = false
  formSkinControls.hidden = false
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  hideEdgesLab()
  hideTorusAnalysisLab()
  viewport.setAnimationEnabled(false)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === slug)
  }
  void formSkinLab().then((lab) => {
    if (readSlug() === slug) lab.show(form)
    else lab.hide()
  })
}

const applyEdgesPage = (): void => {
  const slug = readSlug()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("form-skin-mode")
  app.classList.add("edges-mode")
  app.classList.remove("torus-analysis-mode")
  controlsAside.hidden = true
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = false
  torusAnalysisStage.hidden = true
  hideFormSkinLab()
  hideTorusAnalysisLab()
  viewport.setAnimationEnabled(false)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === slug)
  }
  void edgesLab().then((lab) => {
    if (readSlug() === slug) lab.show()
    else lab.hide()
  })
}

const applyTorusAnalysisPage = (): void => {
  const slug = readSlug()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.add("torus-analysis-mode")
  controlsAside.hidden = true
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = false
  hideFormSkinLab()
  hideEdgesLab()
  viewport.setAnimationEnabled(false)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === slug)
  }
  void torusAnalysisLab().then((lab) => {
    if (readSlug() === slug) lab.show()
    else lab.hide()
  })
}

const syncLayoutOutputs = (): void => {
  innerOutput.textContent = `${layout.rootInnerDiameterMm.toFixed(0)} mm`
  radiusOutput.textContent = `${layout.rootSphereRadiusMm.toFixed(2)} mm`
  gapOutput.textContent = `${layout.orbitEdgeGapMm.toFixed(2)} mm`
}

const applyStory = (): void => {
  const slug = readSlug()
  if (slug === "state-graph") {
    applyStateGraphPage()
    return
  }
  if (slug === "edges") {
    applyEdgesPage()
    return
  }
  if (slug === "analysis-torus") {
    applyTorusAnalysisPage()
    return
  }
  const formSkin = formSkinForSlug(slug)
  if (formSkin) {
    applyFormSkinPage(formSkin)
    return
  }
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  controlsAside.hidden = false
  canvas.hidden = false
  visualTitle.hidden = false
  visualControls.hidden = false
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  const component = visualComponentForSlug(readSlug())
  const fullManifest = buildBulkManifestation(
    projection.view(),
    snapshot.rootSrc,
    layout,
  )
  const manifest = projectVisualScene(fullManifest, component)
  viewport.setVisualLayers(storyLayers())
  viewport.setAnimationEnabled(animation.checked)
  viewport.applyManifestPatch(manifest)
  entity.textContent = component.entity
  description.textContent = component.description
  renderCounts(manifest)
  syncLayoutOutputs()
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === component.slug)
  }
}

for (const component of Visual) {
  const link = document.createElement("a")
  link.href = `#/${component.slug}`
  link.dataset.slug = component.slug
  link.textContent = component.entity
  navigation.append(link)
}
const skinSection = document.createElement("span")
skinSection.className = "nav-section"
skinSection.textContent = "Form skins"
const sphereSkinLink = document.createElement("a")
sphereSkinLink.href = "#/skin-sphere"
sphereSkinLink.dataset.slug = "skin-sphere"
sphereSkinLink.textContent = "Sphere"
const torusSkinLink = document.createElement("a")
torusSkinLink.href = "#/skin-torus"
torusSkinLink.dataset.slug = "skin-torus"
torusSkinLink.textContent = "Torus"
navigation.append(skinSection, sphereSkinLink, torusSkinLink)
const graphSection = document.createElement("span")
graphSection.className = "nav-section"
graphSection.textContent = "Analysis"
const torusAnalysisLink = document.createElement("a")
torusAnalysisLink.href = "#/analysis-torus"
torusAnalysisLink.dataset.slug = "analysis-torus"
torusAnalysisLink.textContent = "Torus"
const edgesLink = document.createElement("a")
edgesLink.href = "#/edges"
edgesLink.dataset.slug = "edges"
edgesLink.textContent = "Edges"
const graphLink = document.createElement("a")
graphLink.href = "#/state-graph"
graphLink.dataset.slug = "state-graph"
graphLink.textContent = "State Graph"
navigation.append(graphSection, torusAnalysisLink, edgesLink, graphLink)

const syncLayout = (): void => {
  layout.rootInnerDiameterMm = Number(inner.value)
  layout.rootSphereRadiusMm = Number(radius.value)
  layout.orbitEdgeGapMm = Number(gap.value)
  applyStory()
}

window.addEventListener("hashchange", applyStory)
window.addEventListener("beforeunload", () => {
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  if (formSkinLabPromise) {
    void formSkinLabPromise.then((lab) => lab.dispose())
  }
  if (edgesLabPromise) {
    void edgesLabPromise.then((lab) => lab.dispose())
  }
  if (torusAnalysisLabPromise) {
    void torusAnalysisLabPromise.then((lab) => lab.dispose())
  }
  viewport.dispose()
}, {once: true})
context.addEventListener("change", applyStory)
labels.addEventListener("change", applyStory)
grid.addEventListener("change", applyStory)
animation.addEventListener("change", applyStory)
inner.addEventListener("input", syncLayout)
radius.addEventListener("input", syncLayout)
gap.addEventListener("input", syncLayout)
stateGraphAtom.addEventListener("change", () => {
  if (readSlug() === "state-graph") void renderStateGraph()
})

const resizeObserver = new ResizeObserver(() => {
  const next = size()
  viewport.setSize(next.width, next.height)
})
resizeObserver.observe(canvas)

if (!location.hash) history.replaceState(null, "", "#/atom")
applyStory()
