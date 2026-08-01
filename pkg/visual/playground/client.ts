import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkVisualLayer} from "@metafor/types/bulk/viewport"
import {
  CenteredNested,
  OutsideIn,
  Visual,
  buildStateGraph,
  type VisualLayout,
} from "@metafor/visual/layout"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import {createBulkViewport} from "bulk/web"
import {
  createVisualSceneViewport,
  type VisualSceneViewport,
} from "./VisualSceneViewport.ts"
import {
  visualComponentForSlug,
} from "../src/Components.ts"
import {
  countVisualScene,
  projectVisualScene,
} from "../src/Scene.ts"
import {
  buildStateGraphBranchLayout,
  describeStateGraphRoot,
} from "../src/StateGraphLayout.ts"
import {
  createStateGraphViewport,
  type StateGraphView,
  type StateGraphViewport,
} from "./StateGraphViewport.ts"
import {
  createPageAnnotationLayer,
  createStateGraphAnnotationLayer,
  type StateGraphAnnotationLayer,
} from "./AnnotationLayer.ts"
import {
  createFormSkinLab,
  type FormSkinLab,
  type FormSkinLabForm,
} from "./FormSkinLab.ts"
import {
  createEdgesLab,
  type EdgeRouteVariant,
  type EdgesLab,
} from "./EdgesLab.ts"
import {
  createTorusAnalysisLab,
  type TorusAnalysisLab,
} from "./TorusAnalysisLab.ts"
import {
  createFieldsAnalysisLab,
  type FieldsAnalysisMode,
  type FieldsAnalysisLab,
} from "./FieldsAnalysisLab.ts"
import {
  buildStateGraphFieldsStand,
  type StateGraphFieldsStand,
} from "./StateGraphFieldsLab.ts"
import {
  createStateGraphActivityLab,
  type StateGraphActivityLab,
} from "./StateGraphActivityLab.ts"
import {
  createForceStoriesLab,
  type ForceStoriesLab,
} from "./ForceStoriesLab.ts"
import {
  FORCE_STORIES_SLUG,
  FORCE_STORY_PARTS,
  ForceStories,
  forceStoryPartForSlug,
  forceStoryRouteSlug,
} from "./ForceStories.ts"
import {createStateGraphHermiteEdgeCurveBuilder} from "./StateGraphLab.ts"
import {metaStateDslSource} from "./MetaSource.ts"
import snapshotJson from "./fixture/monad-snapshot.json"

const STATE_GRAPH_FIELDS_SLUG = "state-graph/fields"
const STATE_GRAPH_ACTIVITY_SLUG = "state-graph/activity"
const snapshot = snapshotJson as BulkObserverSnapshot
const app = document.querySelector("main")
const canvas = document.getElementById("visual-canvas") as HTMLCanvasElement | null
const layoutCanvas = document.getElementById(
  "layout-canvas",
) as HTMLCanvasElement | null
const navigation = document.getElementById("navigation")
const sectionTabs = document.getElementById("section-tabs")
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
const stateGraphFieldsControls = document.getElementById(
  "state-graph-fields-controls",
)
const stateGraphFieldsCounts = document.getElementById(
  "state-graph-fields-counts",
)
const stateGraphFieldsJson = document.getElementById("state-graph-fields-json")
const stateGraphActivityStage = document.getElementById(
  "state-graph-activity-stage",
)
const forceStoriesStage = document.getElementById("force-stories-stage")
const formSkinStage = document.getElementById("form-skin-stage")
const formSkinControls = document.getElementById("form-skin-controls")
const edgesStage = document.getElementById("edges-stage")
const torusAnalysisStage = document.getElementById("torus-analysis-stage")
const fieldsAnalysisStage = document.getElementById("fields-analysis-stage")

if (
  !app ||
  !canvas ||
  !layoutCanvas ||
  !navigation ||
  !sectionTabs ||
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
  !stateGraphFieldsControls ||
  !stateGraphFieldsCounts ||
  !stateGraphFieldsJson ||
  !stateGraphActivityStage ||
  !forceStoriesStage ||
  !formSkinStage ||
  !formSkinControls ||
  !edgesStage ||
  !torusAnalysisStage ||
  !fieldsAnalysisStage
) throw new Error("Visual playground composition is incomplete")

type SectionTab = Readonly<{
  href: string
  label: string
}>

type NestedPageGroup = Readonly<{
  parent: string
  tabs: readonly SectionTab[]
}>

const stateGraphTabs: readonly SectionTab[] = [
  {href: "#/state-graph", label: "Ветки"},
  {href: `#/${STATE_GRAPH_FIELDS_SLUG}`, label: "Поля"},
  {href: `#/${STATE_GRAPH_ACTIVITY_SLUG}`, label: "Активность"},
]

const forceStoryTabs: readonly SectionTab[] = ForceStories.map((story) => ({
  href: `#/${forceStoryRouteSlug(story.part)}`,
  label: story.label,
}))

const forceStoryPageGroups = Object.fromEntries([
  [FORCE_STORIES_SLUG, {
    parent: "Force Stories",
    tabs: forceStoryTabs,
  }],
  ...FORCE_STORY_PARTS.map((part) => [forceStoryRouteSlug(part), {
    parent: "Force Stories",
    tabs: forceStoryTabs,
  }] as const),
]) as Readonly<Record<string, NestedPageGroup>>

const nestedPageGroups: Readonly<Record<string, NestedPageGroup>> = {
  ...forceStoryPageGroups,
  "analysis-torus": {
    parent: "Torus",
    tabs: [{href: "#/analysis-torus", label: "Геометрия"}],
  },
  "analysis-fields": {
    parent: "Fields",
    tabs: [
      {href: "#/analysis-fields", label: "Псевдосфера"},
      {href: "#/analysis-fields/circle", label: "Псевдокруг"},
    ],
  },
  "analysis-fields/circle": {
    parent: "Fields",
    tabs: [
      {href: "#/analysis-fields", label: "Псевдосфера"},
      {href: "#/analysis-fields/circle", label: "Псевдокруг"},
    ],
  },
  edges: {
    parent: "Edges",
    tabs: [
      {href: "#/edges", label: "Все примеры"},
      {href: "#/edges/composite", label: "Составная экспериментальная"},
      {href: "#/edges/source-sink", label: "Источник → сток"},
      {href: "#/edges/hermite", label: "Hermite · балка"},
    ],
  },
  "edges/composite": {
    parent: "Edges",
    tabs: [
      {href: "#/edges", label: "Все примеры"},
      {href: "#/edges/composite", label: "Составная экспериментальная"},
      {href: "#/edges/source-sink", label: "Источник → сток"},
      {href: "#/edges/hermite", label: "Hermite · балка"},
    ],
  },
  "edges/source-sink": {
    parent: "Edges",
    tabs: [
      {href: "#/edges", label: "Все примеры"},
      {href: "#/edges/composite", label: "Составная экспериментальная"},
      {href: "#/edges/source-sink", label: "Источник → сток"},
      {href: "#/edges/hermite", label: "Hermite · балка"},
    ],
  },
  "edges/hermite": {
    parent: "Edges",
    tabs: [
      {href: "#/edges", label: "Все примеры"},
      {href: "#/edges/composite", label: "Составная экспериментальная"},
      {href: "#/edges/source-sink", label: "Источник → сток"},
      {href: "#/edges/hermite", label: "Hermite · балка"},
    ],
  },
  "state-graph": {
    parent: "State Graph",
    tabs: stateGraphTabs,
  },
  [STATE_GRAPH_FIELDS_SLUG]: {
    parent: "State Graph",
    tabs: stateGraphTabs,
  },
  [STATE_GRAPH_ACTIVITY_SLUG]: {
    parent: "State Graph",
    tabs: stateGraphTabs,
  },
}

const showSectionTabs = (slug: string): void => {
  const group = nestedPageGroups[slug]
  if (!group) throw new Error(`Unknown nested page parent: ${slug}`)
  const activeSlug = slug === FORCE_STORIES_SLUG
    ? forceStoryRouteSlug("photon")
    : slug
  const label = document.createElement("strong")
  label.textContent = group.parent
  sectionTabs.replaceChildren(
    label,
    ...group.tabs.map((tab) => {
      const link = document.createElement("a")
      link.href = tab.href
      link.textContent = tab.label
      const active = tab.href === `#/${activeSlug}`
      link.classList.toggle("active", active)
      if (active) link.setAttribute("aria-current", "page")
      return link
    }),
  )
  sectionTabs.hidden = false
  app.classList.add("section-tabs-mode")
}

const hideSectionTabs = (): void => {
  sectionTabs.hidden = true
  sectionTabs.replaceChildren()
  app.classList.remove("section-tabs-mode")
}

const visualLifecycle = new BulkVisualSceneLifecycle()
visualLifecycle.prepare(structuredClone(snapshot))

const runtime = visualLifecycle.state().projection
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
  location.hash.replace(/^#\/?/, "").trim().toLowerCase() || OutsideIn.slug

const size = (): {width: number; height: number} => {
  const rect = canvas.getBoundingClientRect()
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  }
}

const initialSlug = readSlug()
const initialLayout = Visual.find((layout) => layout.slug === initialSlug)
const initialComponent = visualComponentForSlug(
  initialLayout ||
    forceStoryPartForSlug(initialSlug) !== null ||
    initialSlug === "edges" ||
    initialSlug.startsWith("edges/")
    ? "atom"
    : initialSlug,
)
const viewport = await createBulkViewport({
  canvas,
  ...size(),
  visualLayers: initialComponent.layers,
})
const mainAnnotation = createPageAnnotationLayer({
  sourceCanvas: canvas,
  viewer: canvas.parentElement ??
    (() => {
      throw new Error("Visual canvas parent is missing")
    })(),
  capturePng: () => viewport.hud.renderer.captureLastPresentedFramePng(),
  surface: () => {
    const slug = readSlug()
    const component = visualComponentForSlug(
      forceStoryPartForSlug(slug) !== null ? "atom" : slug,
    )
    return {
      canvasId: canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug,
      title: slug === STATE_GRAPH_FIELDS_SLUG
        ? "State Graph · Поля · lada"
        : component.entity,
    }
  },
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
let layoutRenderVersion = 0
let layoutViewport: VisualSceneViewport | null = null
let layoutAnnotation: ReturnType<typeof createPageAnnotationLayer> | null = null
let formSkinLabPromise: Promise<FormSkinLab> | null = null
let edgesLabPromise: Promise<EdgesLab> | null = null
let torusAnalysisLabPromise: Promise<TorusAnalysisLab> | null = null
let fieldsAnalysisLabPromise: Promise<FieldsAnalysisLab> | null = null
let stateGraphActivityLabPromise: Promise<StateGraphActivityLab> | null = null
let stateGraphFieldsStand: StateGraphFieldsStand | null = null
let forceStoriesLabPromise: Promise<ForceStoriesLab> | null = null

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

const fieldsAnalysisLab = (): Promise<FieldsAnalysisLab> => {
  if (!fieldsAnalysisLabPromise) {
    const manifest = visualLifecycle.state().manifest
    fieldsAnalysisLabPromise = createFieldsAnalysisLab(manifest.fieldParticles)
  }
  return fieldsAnalysisLabPromise
}

const hideFieldsAnalysisLab = (): void => {
  if (fieldsAnalysisLabPromise) {
    void fieldsAnalysisLabPromise.then((lab) => lab.hide())
  }
}

const rootStateGraphFieldsStand = (): StateGraphFieldsStand => {
  stateGraphFieldsStand ??= buildStateGraphFieldsStand(visualLifecycle)
  return stateGraphFieldsStand
}

const stateGraphActivityLab = (): Promise<StateGraphActivityLab> => {
  stateGraphActivityLabPromise ??= createStateGraphActivityLab(visualLifecycle)
  return stateGraphActivityLabPromise
}

const hideStateGraphActivityLab = (): void => {
  if (stateGraphActivityLabPromise) {
    void stateGraphActivityLabPromise.then((lab) => lab.hide())
  }
}

const forceStoriesLab = (): Promise<ForceStoriesLab> => {
  forceStoriesLabPromise ??= createForceStoriesLab(forceStoriesStage)
  return forceStoriesLabPromise
}

const hideForceStoriesLab = (): void => {
  if (forceStoriesLabPromise) {
    void forceStoriesLabPromise.then((lab) => lab.hide())
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

const hideSnapshotLayout = (): void => {
  layoutCanvas.hidden = true
  layoutAnnotation?.hide()
}

const renderSnapshotLayout = async (
  selectedLayout: VisualLayout,
): Promise<void> => {
  const renderVersion = ++layoutRenderVersion
  layoutAnnotation?.dispose()
  layoutAnnotation = null
  layoutViewport?.dispose()
  layoutViewport = null
  const input = visualLifecycle.layoutInput()
  const atomGraphs = input.owners.filter(({graph}) => graph.states.length > 0)
  const stateSleeveCount = atomGraphs.reduce(
    (total, {graph}) => total + graph.states.length,
    0,
  )
  const scene = selectedLayout.buildScene(input)
  const rect = layoutCanvas.getBoundingClientRect()
  const sceneViewport = await createVisualSceneViewport({
    canvas: layoutCanvas,
    height: Math.max(1, Math.floor(rect.height)),
    scene,
    showLabels: labels.checked,
    width: Math.max(1, Math.floor(rect.width)),
  })
  if (
    renderVersion !== layoutRenderVersion ||
    readSlug() !== selectedLayout.slug
  ) {
    sceneViewport.dispose()
    return
  }
  layoutViewport = sceneViewport
  replaceDefinitionList(counts, [
    ["Torus контекста", scene.tori.length],
    ["Ядерных Fields", scene.fields.length],
    ["Atom со State", atomGraphs.length],
    ["State-рукавов", stateSleeveCount],
    ["State-Torus", scene.orbitals.filter((orbital) =>
      orbital.form.kind === "torus"
    ).length],
    ["Causal particles", scene.orbitals.filter((orbital) =>
      orbital.form.kind === "sphere"
    ).length],
    ["Field proxies", scene.fieldProxies.length],
    ["Transition", scene.stateSleeves.reduce(
      (total, sleeve) => total + sleeve.edges.length,
      0,
    )],
    ["Relations", scene.relationEdges.length],
  ])
  layoutAnnotation = createPageAnnotationLayer({
    sourceCanvas: layoutCanvas,
    viewer: layoutCanvas.parentElement ??
      (() => {
        throw new Error("Snapshot layout canvas parent is missing")
      })(),
    capturePng: () => sceneViewport.capturePng(),
    surface: () => ({
      canvasId: layoutCanvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: selectedLayout.slug,
      title:
        `${selectedLayout.label} · ${stateSleeveCount} State-рукава во всех вложенных Atom`,
    }),
  })
  layoutAnnotation.show()
}

const renderStateGraph = async (): Promise<void> => {
  const renderVersion = ++stateGraphRenderVersion
  disposeBranchViewports()
  const atomId = Number(stateGraphAtom.value)
  const graph = buildStateGraph(runtime, atomId)
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
    "Одна карточка — один стартовый State и все его ветвления. Сам State показан как Torus; сферы внутри него — это Fields, которые участвуют в условиях исходящих Transition. Hermite-переход вперёд проходит над плоскостью графа, возвратный — под ней."
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

  const stateGraphEdgeCurveBuilder =
    createStateGraphHermiteEdgeCurveBuilder()
  const pendingViewports = graph.states.map(async (rootState, rootIndex) => {
    const layout = buildStateGraphBranchLayout(graph, rootState.id)
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
      "Каждая вертикальная направляющая — шаг первого достижения State. Hermite-дуга вперёд идёт сверху, оранжевая возвратная дуга — снизу к уже существующему State-Torus. Сферы в отверстии Torus показывают Fields условий его исходящих переходов."

    const branchCounts = document.createElement("dl")
    branchCounts.className = "state-branch-counts"
    replaceDefinitionList(branchCounts, [
      ["State-форм", details.nodeCount],
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
      edgeCurveBuilder: stateGraphEdgeCurveBuilder,
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
  hideSnapshotLayout()
  mainAnnotation.hide()
  app.classList.add("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = false
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = false
  stateGraphControls.hidden = false
  stateGraphFieldsControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  hideFieldsAnalysisLab()
  showSectionTabs("state-graph")
  void renderStateGraph()
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === "state-graph")
  }
}

const applyStateGraphFieldsPage = (): void => {
  hideSnapshotLayout()
  mainAnnotation.show()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.add("state-graph-fields-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = false
  canvas.hidden = false
  visualTitle.hidden = false
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = false
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  hideFieldsAnalysisLab()
  showSectionTabs(STATE_GRAPH_FIELDS_SLUG)

  const stand = rootStateGraphFieldsStand()
  viewport.setVisualLayers(null)
  viewport.applyVisualManifestPatch(stand.visual)
  entity.textContent = `Поля · ${stand.graph.atomLabel}`
  description.textContent =
    "Диагностический root-only стенд: из статичного BulkObserverSnapshot оставлен только Atom lada без вложенных Matter. Его Fields, State-рукава, causal particles, proxies, Transition и Relation проходят неизменённый production centered-nested → Bulk renderer."
  replaceDefinitionList(stateGraphFieldsCounts, [
    ["Dark / Matter", `${stand.manifest.darkParticles.length} / 0`],
    ["Canonical Fields", stand.manifest.fieldParticles.length],
    ["Объявлено State", stand.graph.states.length],
    ["State-рукавов", stand.graph.states.length],
    ["State occurrences", stand.visual.orbitalTori.length],
    ["Causal particles", stand.visual.orbitalSpheres.length],
    ["Field proxies", stand.visual.manifest.fieldProxies.length],
    ["Transition", stand.visual.transitionPaths.length],
    ["Relations", stand.visual.relationPaths.length],
  ])
  stateGraphFieldsJson.textContent = JSON.stringify(stand.graph, null, 2)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === "state-graph")
  }
}

const applyStateGraphActivityPage = (): void => {
  hideSnapshotLayout()
  mainAnnotation.hide()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.add("state-graph-activity-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = true
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = true
  stateGraphActivityStage.hidden = false
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  hideFieldsAnalysisLab()
  showSectionTabs(STATE_GRAPH_ACTIVITY_SLUG)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === "state-graph")
  }
  void stateGraphActivityLab().then((lab) => {
    if (readSlug() === STATE_GRAPH_ACTIVITY_SLUG) lab.show()
    else lab.hide()
  })
}

const applyForceStoriesPage = (): void => {
  const slug = readSlug()
  const part = forceStoryPartForSlug(slug)
  if (part === null) throw new Error(`Unknown Force Story route: ${slug}`)
  hideSnapshotLayout()
  mainAnnotation.hide()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.remove("state-graph-activity-mode")
  app.classList.add("force-stories-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = true
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = true
  stateGraphActivityStage.hidden = true
  forceStoriesStage.hidden = false
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  hideFieldsAnalysisLab()
  hideStateGraphActivityLab()
  showSectionTabs(slug)
  void forceStoriesLab().then((lab) => {
    if (forceStoryPartForSlug(readSlug()) === part) lab.show(part)
    else lab.hide()
  })
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === FORCE_STORIES_SLUG)
  }
}

const applyFormSkinPage = (form: FormSkinLabForm): void => {
  hideSnapshotLayout()
  mainAnnotation.hide()
  const slug = readSlug()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.add("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = false
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = true
  formSkinStage.hidden = false
  formSkinControls.hidden = false
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = true
  hideEdgesLab()
  hideTorusAnalysisLab()
  hideFieldsAnalysisLab()
  hideSectionTabs()
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === slug)
  }
  void formSkinLab().then((lab) => {
    if (readSlug() === slug) lab.show(form)
    else lab.hide()
  })
}

const edgeVariantForSlug = (slug: string): EdgeRouteVariant | null => {
  if (slug === "edges/composite") return "composite"
  if (slug === "edges/source-sink") return "source-sink"
  if (slug === "edges/hermite") return "hermite"
  return null
}

const applyEdgesPage = (variant: EdgeRouteVariant | null): void => {
  hideSnapshotLayout()
  mainAnnotation.hide()
  const slug = readSlug()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.remove("form-skin-mode")
  app.classList.add("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = true
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = false
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = true
  hideFormSkinLab()
  hideTorusAnalysisLab()
  hideFieldsAnalysisLab()
  showSectionTabs(slug)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === "edges")
  }
  void edgesLab().then((lab) => {
    if (readSlug() !== slug) {
      lab.hide()
      return
    }
    if (variant === null) lab.showOverview()
    else lab.show(variant)
  })
}

const applyTorusAnalysisPage = (): void => {
  hideSnapshotLayout()
  mainAnnotation.hide()
  const slug = readSlug()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.add("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = true
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = false
  fieldsAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideFieldsAnalysisLab()
  showSectionTabs(slug)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === slug)
  }
  void torusAnalysisLab().then((lab) => {
    if (readSlug() === slug) lab.show()
    else lab.hide()
  })
}

const applyFieldsAnalysisPage = (mode: FieldsAnalysisMode): void => {
  hideSnapshotLayout()
  mainAnnotation.hide()
  const slug = readSlug()
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  app.classList.remove("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.add("fields-analysis-mode")
  controlsAside.hidden = true
  canvas.hidden = true
  visualTitle.hidden = true
  visualControls.hidden = true
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = false
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  showSectionTabs(slug)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.slug === "analysis-fields")
  }
  void fieldsAnalysisLab().then((lab) => {
    if (readSlug() === slug) lab.show(mode)
    else lab.hide()
  })
}

const applyStory = (): void => {
  const slug = readSlug()
  const forceStoryPart = forceStoryPartForSlug(slug)
  app.classList.remove("layout-mode")
  app.classList.remove("force-stories-mode")
  if (forceStoryPart === null) {
    forceStoriesStage.hidden = true
    hideForceStoriesLab()
  }
  if (slug !== STATE_GRAPH_ACTIVITY_SLUG) {
    app.classList.remove("state-graph-activity-mode")
    stateGraphActivityStage.hidden = true
    hideStateGraphActivityLab()
  }
  if (forceStoryPart !== null) {
    applyForceStoriesPage()
    return
  }
  if (slug === "state-graph") {
    applyStateGraphPage()
    return
  }
  if (slug === STATE_GRAPH_FIELDS_SLUG) {
    applyStateGraphFieldsPage()
    return
  }
  if (slug === STATE_GRAPH_ACTIVITY_SLUG) {
    applyStateGraphActivityPage()
    return
  }
  if (slug === "edges") {
    applyEdgesPage(null)
    return
  }
  const edgeVariant = edgeVariantForSlug(slug)
  if (edgeVariant) {
    applyEdgesPage(edgeVariant)
    return
  }
  if (slug === "analysis-torus") {
    applyTorusAnalysisPage()
    return
  }
  if (slug === "analysis-fields") {
    applyFieldsAnalysisPage("sphere")
    return
  }
  if (slug === "analysis-fields/circle") {
    applyFieldsAnalysisPage("circle")
    return
  }
  const formSkin = formSkinForSlug(slug)
  if (formSkin) {
    applyFormSkinPage(formSkin)
    return
  }
  stateGraphRenderVersion += 1
  disposeBranchViewports()
  const selectedLayout = Visual.find((candidate) => candidate.slug === slug)
  const component = selectedLayout
    ? visualComponentForSlug("atom")
    : visualComponentForSlug(slug)
  const isSnapshotLayout = selectedLayout !== undefined
  app.classList.toggle("layout-mode", selectedLayout !== undefined)
  animation.disabled = isSnapshotLayout
  animation.title = isSnapshotLayout
    ? "Статическая раскладка не использует цикл анимации"
    : ""
  if (isSnapshotLayout) mainAnnotation.hide()
  else mainAnnotation.show()
  app.classList.remove("state-graph-mode")
  app.classList.remove("state-graph-fields-mode")
  app.classList.remove("form-skin-mode")
  app.classList.remove("edges-mode")
  app.classList.remove("torus-analysis-mode")
  app.classList.remove("fields-analysis-mode")
  controlsAside.hidden = false
  canvas.hidden = isSnapshotLayout
  layoutCanvas.hidden = !isSnapshotLayout
  visualTitle.hidden = false
  visualControls.hidden = false
  stateGraphStage.hidden = true
  stateGraphControls.hidden = true
  stateGraphFieldsControls.hidden = true
  formSkinStage.hidden = true
  formSkinControls.hidden = true
  edgesStage.hidden = true
  torusAnalysisStage.hidden = true
  fieldsAnalysisStage.hidden = true
  hideFormSkinLab()
  hideEdgesLab()
  hideTorusAnalysisLab()
  hideFieldsAnalysisLab()
  hideSectionTabs()
  const fullManifest = visualLifecycle.state().manifest
  const manifest = projectVisualScene(fullManifest, component)
  if (selectedLayout) {
    void renderSnapshotLayout(selectedLayout)
  } else {
    hideSnapshotLayout()
    viewport.setVisualLayers(storyLayers())
    viewport.applyVisualManifestPatch(
      visualLifecycle.compose().renderManifest,
    )
  }
  entity.textContent = selectedLayout?.label ?? component.entity
  description.textContent = selectedLayout?.slug === OutsideIn.slug
    ? `${OutsideIn.description} Общий компонент Torus проявляет Atom, Fuzzy, Axion, MACHO и State. Пустой корневой Torus имеет внешний диаметр 100 мм, а пустой Torus и Fields уменьшаются вдвое на каждом уровне; фактическое содержимое не сжимается и расширяет владельца наружу. Fields самого Torus остаются в ядре, Matter-торы занимают внутреннюю орбиту, а каждый объявленный State разворачивает отдельный причинный рукав со всеми достижимыми путями и ветвлениями. Внутри State-Torus находятся только фиксированные Fields условий исходящих Transition.`
    : selectedLayout?.slug === CenteredNested.slug
      ? `${CenteredNested.description} Fields с одним materialized Value отображаются одним маркером в ядре их верхнего общего предка. Личные Fields корня остаются в центральной псевдоокружности, а private Fields вложенного Atom занимают внешнюю орбиту ядра собственного Torus непосредственно перед его внутренней границей. Более глубокая дочерняя ветвь получает более внутренний Matter-диапазон; дополнительные орбиты одного владельца идут без повторного зазора и получают маркеры пропорционально своей вместимости.`
      : component.description
  renderCounts(manifest)
  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle(
      "active",
      link.dataset.slug === (selectedLayout?.slug ?? component.slug),
    )
  }
}

const forceSection = document.createElement("span")
forceSection.className = "nav-section"
forceSection.textContent = "Force"
const forceStoriesLink = document.createElement("a")
forceStoriesLink.href = `#/${forceStoryRouteSlug("photon")}`
forceStoriesLink.dataset.slug = FORCE_STORIES_SLUG
forceStoriesLink.textContent = "Force Stories"
navigation.append(forceSection, forceStoriesLink)

const layoutSection = document.createElement("span")
layoutSection.className = "nav-section"
layoutSection.textContent = "Layouts"
navigation.append(layoutSection)
for (const layout of Visual) {
  const link = document.createElement("a")
  link.href = `#/${layout.slug}`
  link.dataset.slug = layout.slug
  link.textContent = layout.label
  link.dataset.status = layout.status
  link.title = layout.status === "in-progress"
    ? `${layout.label} · раскладка в работе`
    : layout.label
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
const fieldsAnalysisLink = document.createElement("a")
fieldsAnalysisLink.href = "#/analysis-fields"
fieldsAnalysisLink.dataset.slug = "analysis-fields"
fieldsAnalysisLink.textContent = "Fields"
navigation.append(
  graphSection,
  torusAnalysisLink,
  edgesLink,
  graphLink,
  fieldsAnalysisLink,
)

window.addEventListener("hashchange", applyStory)
window.addEventListener("beforeunload", () => {
  layoutRenderVersion += 1
  layoutAnnotation?.dispose()
  layoutViewport?.dispose()
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
  if (fieldsAnalysisLabPromise) {
    void fieldsAnalysisLabPromise.then((lab) => lab.dispose())
  }
  if (stateGraphActivityLabPromise) {
    void stateGraphActivityLabPromise.then((lab) => lab.dispose())
  }
  if (forceStoriesLabPromise) {
    void forceStoriesLabPromise.then((lab) => lab.dispose())
  }
  mainAnnotation.dispose()
  viewport.dispose()
}, {once: true})
context.addEventListener("change", applyStory)
labels.addEventListener("change", applyStory)
grid.addEventListener("change", applyStory)
animation.addEventListener("change", applyStory)
stateGraphAtom.addEventListener("change", () => {
  if (readSlug() === "state-graph") void renderStateGraph()
})

const resizeObserver = new ResizeObserver(() => {
  const next = size()
  viewport.setSize(next.width, next.height)
  mainAnnotation.resize()
  if (layoutViewport) {
    const rect = layoutCanvas.getBoundingClientRect()
    layoutViewport.setSize(
      Math.max(1, Math.floor(rect.width)),
      Math.max(1, Math.floor(rect.height)),
    )
    layoutAnnotation?.resize()
  }
})
resizeObserver.observe(canvas)
resizeObserver.observe(layoutCanvas)

if (!location.hash) history.replaceState(null, "", `#/${OutsideIn.slug}`)
applyStory()
