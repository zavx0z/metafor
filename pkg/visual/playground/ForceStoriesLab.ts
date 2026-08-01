import type {Part} from "shared/protocol/force/particle"
import {resolveForceImpulseVisual} from "../../../bulk/web/force-protocol.ts"
import {
  ForceStories,
  createForceStorySession,
  forceStoryForPart,
  forceStoryModalText,
  formatForceStoryPatch,
  type ForceStoryDefinition,
  type ForceStoryLayout,
  type ForceStorySessionSnapshot,
  type ForceStoryView,
} from "./ForceStories.ts"
import {
  createVisualSceneViewport,
  type VisualSceneViewport,
} from "./VisualSceneViewport.ts"

export type ForceStoriesLab = Readonly<{
  dispose(): void
  hide(): void
  show(part: Part): void
}>

type ForceStoryViewRuntime = Readonly<{
  canvas: HTMLCanvasElement
  figure: HTMLElement
  layout: ForceStoryLayout
  observer: ResizeObserver
  view: ForceStoryView
  viewport: VisualSceneViewport
}>

const createText = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  value: string,
): HTMLElementTagNameMap[Tag] => {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = value
  return element
}

const canvasSize = (
  canvas: HTMLCanvasElement,
): Readonly<{width: number; height: number}> => {
  const rect = canvas.getBoundingClientRect()
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  }
}

const renderSleeves = (
  legend: HTMLElement,
  snapshot: ForceStorySessionSnapshot,
): void => {
  legend.replaceChildren(...snapshot.representation.sleeves.map((sleeve) => {
    const item = document.createElement("span")
    item.className = "force-story-sleeve"
    item.dataset.active = String(sleeve.active)
    item.dataset.current = String(sleeve.current)
    item.dataset.state = sleeve.name
    const marker = createText("i", "", "")
    const label = createText("b", "", sleeve.name)
    const value = createText(
      "small",
      "",
      sleeve.active ? "активный рукав" : "приглушённый рукав",
    )
    item.append(marker, label, value)
    return item
  }))
}

export const createForceStoriesLab = async (
  stage: HTMLElement,
): Promise<ForceStoriesLab> => {
  const listeners = new AbortController()
  const photon = forceStoryForPart("photon")
  const photonSession = createForceStorySession(photon)
  const initial = photonSession.snapshot()
  const photonRepresentation = photonSession.representation

  const shell = document.createElement("article")
  shell.className = "force-story-workbench"

  const header = document.createElement("header")
  header.className = "force-story-header"
  header.setAttribute("aria-label", "Управление общей сценой")
  const help = createText("button", "force-story-help", "?")
  help.type = "button"

  const representation = document.createElement("section")
  representation.className = "force-story-representation"

  const views = document.createElement("section")
  views.className = "force-story-views"
  views.setAttribute(
    "aria-label",
    "Две раскладки и два вида одного visual-графа",
  )
  const viewElements = photonRepresentation.layouts.flatMap((layout) => {
    const row = document.createElement("section")
    row.className = "force-story-layout-row"
    row.dataset.layout = layout.id
    const rowLabel = createText(
      "h3",
      "force-story-layout-label",
      layout.label,
    )
    const rowViews = document.createElement("section")
    rowViews.className = "force-story-layout-views"
    const elements = photonRepresentation.views.map((view) => {
      const figure = document.createElement("figure")
      figure.className = "force-story-view"
      figure.dataset.layout = layout.id
      figure.dataset.view = view.id
      const caption = document.createElement("figcaption")
      const label = createText("strong", "", view.label)
      caption.append(label)
      const surface = document.createElement("section")
      surface.className = "force-story-view-surface"
      const canvas = document.createElement("canvas")
      canvas.id = `force-story-${layout.id}-${view.id}-canvas`
      canvas.setAttribute(
        "aria-label",
        `Photon ${layout.label}, ${view.label}: полный причинный State-sleeve lada-model`,
      )
      surface.append(canvas)
      figure.append(caption, surface)
      rowViews.append(figure)
      return {canvas, figure, layout, view}
    })
    row.append(rowLabel, rowViews)
    views.append(row)
    return elements
  })
  const unavailable = document.createElement("section")
  unavailable.className = "force-story-unavailable"
  unavailable.hidden = true
  const unavailableTitle = createText(
    "strong",
    "",
    "Представление ещё не определено",
  )
  const unavailableReason = createText("p", "", "")
  unavailable.append(unavailableTitle, unavailableReason)
  const sharedSleeveLegend = document.createElement("div")
  sharedSleeveLegend.className = "force-story-sleeves"
  sharedSleeveLegend.setAttribute(
    "aria-label",
    "Общее состояние State-рукавов для четырёх отображений",
  )
  const actions = document.createElement("div")
  actions.className = "force-story-actions"
  const apply = createText("button", "force-story-apply", "Применить patch")
  apply.type = "button"
  const restart = createText("button", "force-story-restart", "Restart")
  restart.type = "button"
  actions.append(apply, restart)
  header.append(sharedSleeveLegend, actions, help)

  const inspectors = document.createElement("aside")
  inspectors.className = "force-story-inspectors"
  inspectors.setAttribute("aria-label", "JSON-инспекторы Force Story")
  const patchInspector = document.createElement("section")
  patchInspector.className = "force-story-inspector"
  const patchInspectorTitle = createText("h3", "", "Incoming Force patch")
  const patchCode = createText("pre", "", "")
  patchInspector.append(patchInspectorTitle, patchCode)
  const sceneInspector = document.createElement("section")
  sceneInspector.className = "force-story-inspector"
  const sceneInspectorTitle = createText("h3", "", "Scene snapshot")
  const sceneSnapshotCode = createText("pre", "", "")
  sceneInspector.append(sceneInspectorTitle, sceneSnapshotCode)
  inspectors.append(patchInspector, sceneInspector)

  const review = document.createElement("section")
  review.className = "force-story-review"
  const visualArea = document.createElement("section")
  visualArea.className = "force-story-visual-area"
  visualArea.append(views, unavailable)
  review.append(visualArea, inspectors)
  representation.append(review)

  const modal = document.createElement("dialog")
  modal.className = "force-story-modal"
  modal.setAttribute("aria-labelledby", "force-story-modal-title")
  const modalPanel = document.createElement("article")
  const modalHeader = document.createElement("header")
  const modalTitle = createText("h2", "", "")
  modalTitle.id = "force-story-modal-title"
  const modalClose = createText("button", "force-story-modal-close", "×")
  modalClose.type = "button"
  modalClose.setAttribute("aria-label", "Закрыть описание сценария")
  const modalBody = createText("pre", "force-story-modal-body", "")
  modalHeader.append(modalTitle, modalClose)
  modalPanel.append(modalHeader, modalBody)
  modal.append(modalPanel)

  shell.append(header, representation)
  stage.replaceChildren(shell, modal)

  const runtimes: ForceStoryViewRuntime[] = await Promise.all(
    viewElements.map(async (elements) => {
      const layoutSnapshot = initial.representation.layouts.find((layout) =>
        layout.id === elements.layout.id
      )
      if (!layoutSnapshot) {
        throw new Error(
          `Force Story layout ${elements.layout.id} is absent`,
        )
      }
      const viewport = await createVisualSceneViewport({
        canvas: elements.canvas,
        ...canvasSize(elements.canvas),
        scene: layoutSnapshot.scene,
        showLabels: true,
      })
      viewport.setView(elements.view.camera)
      const observer = new ResizeObserver(() => {
        const next = canvasSize(elements.canvas)
        viewport.setSize(next.width, next.height)
      })
      observer.observe(elements.canvas)
      return {...elements, observer, viewport}
    }),
  )
  let selected: ForceStoryDefinition = photon
  let disposed = false

  const resize = (runtime: ForceStoryViewRuntime): void => {
    const next = canvasSize(runtime.canvas)
    runtime.viewport.setSize(next.width, next.height)
  }

  const renderPhoton = (): void => {
    const snapshot = photonSession.snapshot()
    const activeProcessCount = snapshot.representation.manifest
      .orbitalParticles?.filter((particle) =>
        particle.orbitalParticleKind === "process" && particle.active
      ).length ?? 0
    const activeTransitionCount = snapshot.representation.manifest
      .transitionChannels?.filter((channel) => channel.active).length ?? 0
    const activeRelationCount = snapshot.representation.manifest
      .relationChannels?.filter((channel) => channel.active).length ?? 0
    shell.dataset.phase = snapshot.phase
    shell.dataset.currentState = snapshot.currentState
    shell.dataset.activeProcessCount = String(activeProcessCount)
    shell.dataset.activeTransitionCount = String(activeTransitionCount)
    shell.dataset.activeRelationCount = String(activeRelationCount)
    shell.dataset.layoutCount = String(snapshot.representation.layouts.length)
    shell.dataset.displayCount = String(runtimes.length)
    header.dataset.currentState = snapshot.currentState
    sceneSnapshotCode.textContent = JSON.stringify({
      provenance: photonSession.representation.preparedScene.provenance,
      closure: photonSession.representation.preparedScene.closure,
      preparedState: {
        atomId: photonSession.representation.preparedScene.atomId,
        stateId: photonSession.representation.preparedScene.initialStateId,
        state: photonSession.representation.preparedScene.initialStateName,
      },
      sourceSnapshot:
        photonSession.representation.preparedScene.sourceSnapshot,
    }, null, 2)
    apply.disabled = snapshot.phase === "applied"
    restart.disabled = snapshot.phase === "prepared"
    sharedSleeveLegend.hidden = false
    actions.hidden = false
    views.hidden = false
    unavailable.hidden = true
    renderSleeves(sharedSleeveLegend, snapshot)
    for (const runtime of runtimes) {
      const layoutSnapshot = snapshot.representation.layouts.find((layout) =>
        layout.id === runtime.layout.id
      )
      if (!layoutSnapshot) {
        throw new Error(
          `Force Story layout ${runtime.layout.id} is absent`,
        )
      }
      runtime.figure.dataset.currentState = snapshot.currentState
      runtime.viewport.applyScene(layoutSnapshot.scene)
      resize(runtime)
    }
  }

  const renderSelected = (): void => {
    const visual = resolveForceImpulseVisual(selected.patch)
    const accent = visual.color
      .slice(0, 3)
      .map((value) => Math.round(value * 255))
      .join(", ")
    shell.style.setProperty("--force-accent", accent)
    shell.dataset.part = selected.part
    shell.dataset.status = selected.status
    shell.dataset.representationCount = String(selected.representations.length)
    help.setAttribute("aria-label", `Открыть сценарий ${selected.label}`)
    patchCode.textContent = formatForceStoryPatch(selected)
    const selectedRepresentation = selected.representations[0]!
    shell.dataset.viewCount = String(selectedRepresentation.views.length)

    const verified = selectedRepresentation.status === "verified"
    if (verified) {
      renderPhoton()
      return
    }
    shell.dataset.phase = "template"
    shell.dataset.currentState = "unavailable"
    shell.dataset.layoutCount = "0"
    shell.dataset.displayCount = "0"
    delete header.dataset.currentState
    sharedSleeveLegend.hidden = true
    actions.hidden = true
    views.hidden = true
    unavailable.hidden = false
    sharedSleeveLegend.replaceChildren()
    sceneSnapshotCode.textContent = JSON.stringify({
      reason: selectedRepresentation.reason,
      representation: {
        id: selectedRepresentation.id,
        kind: selectedRepresentation.kind,
        views: selectedRepresentation.views,
      },
      status: selectedRepresentation.status,
    }, null, 2)
    unavailableReason.textContent = selectedRepresentation.reason
  }

  modalClose.addEventListener("click", () => modal.close(), {
    signal: listeners.signal,
  })
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close()
  }, {signal: listeners.signal})
  help.addEventListener("click", () => {
    modalTitle.textContent = selected.label
    modalBody.textContent = forceStoryModalText(selected)
    modal.showModal()
  }, {signal: listeners.signal})
  apply.addEventListener("click", () => {
    photonSession.apply()
    renderPhoton()
  }, {signal: listeners.signal})
  restart.addEventListener("click", () => {
    photonSession.restart()
    renderPhoton()
  }, {signal: listeners.signal})

  if (ForceStories.length !== 8) {
    throw new Error(`Force Stories expected eight parts, got ${ForceStories.length}`)
  }
  renderSelected()

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      listeners.abort()
      if (modal.open) modal.close()
      for (const runtime of runtimes) {
        runtime.observer.disconnect()
        runtime.viewport.dispose()
      }
      stage.replaceChildren()
    },
    hide(): void {
      if (disposed) return
      stage.hidden = true
      if (modal.open) modal.close()
    },
    show(part: Part): void {
      if (disposed) return
      selected = forceStoryForPart(part)
      stage.hidden = false
      renderSelected()
    },
  }
}
