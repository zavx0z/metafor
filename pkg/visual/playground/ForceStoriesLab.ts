import {resolveForceImpulseVisual} from "../../../bulk/web/force-protocol.ts"
import {
  ForceStories,
  createForceStorySession,
  forceStoryModalText,
  formatForceStoryPatch,
  type ForceStoryDefinition,
  type ForceStorySessionSnapshot,
} from "./ForceStories.ts"

export type ForceStoriesLab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
}>

type ForceStoryCardView = Readonly<{
  apply: HTMLButtonElement
  article: HTMLElement
  carrier: HTMLElement
  currentState: HTMLElement
  restart: HTMLButtonElement
  result: HTMLElement
  session: ReturnType<typeof createForceStorySession>
}>

const createText = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  text: string,
): HTMLElementTagNameMap[Tag] => {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}

const storyResult = (
  definition: ForceStoryDefinition,
  snapshot: ForceStorySessionSnapshot,
): string => {
  if (snapshot.phase === "prepared") {
    return `Подготовлено · State ${snapshot.currentState}`
  }
  if (definition.part === "photon") {
    return `Photon применён · State ${snapshot.currentState}`
  }
  return snapshot.change?.changed === true
    ? "Patch применён · visual outcome не подтверждён"
    : "Patch принят · visual reaction пока не определена"
}

const renderCardState = (view: ForceStoryCardView): void => {
  const snapshot = view.session.snapshot()
  view.article.dataset.phase = snapshot.phase
  view.article.dataset.currentState = snapshot.currentState
  view.article.classList.toggle("applied", snapshot.phase === "applied")
  view.carrier.classList.toggle("arrived", snapshot.phase === "applied")
  view.currentState.textContent = snapshot.currentState
  view.result.textContent = storyResult(view.session.definition, snapshot)
  view.apply.disabled = snapshot.phase === "applied"
  view.restart.disabled = snapshot.phase === "prepared"
}

export const createForceStoriesLab = (
  stage: HTMLElement,
): ForceStoriesLab => {
  const listeners = new AbortController()
  const heading = createText("header", "force-stories-heading", "")
  const eyebrow = createText("span", "force-stories-eyebrow", "Force Stories")
  const title = createText("h2", "", "Force patches управляют сценой")
  const intro = createText(
    "p",
    "",
    "Каждая карточка — отдельная подготовленная сцена и одна входящая Particle. Полностью подтверждённая реакция сейчас у Photon; остальные части сохранены как самостоятельные честные шаблоны.",
  )
  heading.append(eyebrow, title, intro)

  const grid = document.createElement("div")
  grid.className = "force-stories-grid"
  grid.setAttribute("aria-label", "Force particle Stories")

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

  modalClose.addEventListener("click", () => modal.close(), {
    signal: listeners.signal,
  })
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close()
  }, {signal: listeners.signal})

  const cards = ForceStories.map((definition): ForceStoryCardView => {
    const session = createForceStorySession(definition)
    const impulse = resolveForceImpulseVisual(definition.patch)
    const accent = impulse.color
      .slice(0, 3)
      .map((value) => Math.round(value * 255))
      .join(", ")
    const article = document.createElement("article")
    article.className = "force-story-card"
    article.dataset.part = definition.part
    article.dataset.sceneId = definition.preparedScene.id
    article.style.setProperty("--force-accent", accent)

    const cardHeader = document.createElement("header")
    const identity = document.createElement("div")
    const part = createText("span", "force-story-part", definition.part)
    const cardTitle = createText("h3", "", definition.label)
    identity.append(part, cardTitle)
    const status = createText(
      "span",
      `force-story-status ${definition.status}`,
      definition.status === "complete" ? "verified" : "template",
    )
    const help = createText("button", "force-story-help", "?")
    help.type = "button"
    help.setAttribute("aria-label", `Открыть сценарий ${definition.label}`)
    cardHeader.append(identity, status, help)

    const scene = document.createElement("section")
    scene.className = "force-story-scene"
    scene.setAttribute(
      "aria-label",
      `${definition.label}: подготовленная сцена ${definition.preparedScene.id}`,
    )
    const carrier = createText("span", "force-story-carrier", definition.part)
    const trajectory = createText("span", "force-story-trajectory", "")
    const atom = document.createElement("div")
    atom.className = "force-story-atom"
    const atomName = createText(
      "strong",
      "force-story-atom-name",
      definition.preparedScene.atomLabel,
    )
    const atomId = createText(
      "span",
      "force-story-atom-id",
      `Atom ${definition.preparedScene.atomId}`,
    )
    const stateLine = createText("span", "force-story-state", "State ")
    const currentState = createText("b", "force-story-current-state", "idle")
    stateLine.append(currentState)
    atom.append(atomName, atomId, stateLine)
    scene.append(carrier, trajectory, atom)

    const patch = document.createElement("details")
    patch.className = "force-story-patch"
    patch.open = true
    const patchSummary = createText("summary", "", "Incoming Force patch")
    const patchCode = createText(
      "code",
      "",
      formatForceStoryPatch(definition),
    )
    patch.append(patchSummary, patchCode)

    const result = createText("p", "force-story-result", "")
    result.setAttribute("aria-live", "polite")
    const actions = document.createElement("div")
    actions.className = "force-story-actions"
    const apply = createText("button", "force-story-apply", "Применить patch")
    apply.type = "button"
    const restart = createText("button", "force-story-restart", "Начать заново")
    restart.type = "button"
    actions.append(apply, restart)

    const view: ForceStoryCardView = {
      apply,
      article,
      carrier,
      currentState,
      restart,
      result,
      session,
    }
    renderCardState(view)

    help.addEventListener("click", () => {
      modalTitle.textContent = `${definition.label} · ${definition.part}`
      modalBody.textContent = forceStoryModalText(definition)
      modal.showModal()
    }, {signal: listeners.signal})
    apply.addEventListener("click", () => {
      session.apply()
      renderCardState(view)
    }, {signal: listeners.signal})
    restart.addEventListener("click", () => {
      session.restart()
      renderCardState(view)
    }, {signal: listeners.signal})

    article.append(cardHeader, scene, patch, result, actions)
    grid.append(article)
    return view
  })

  stage.replaceChildren(heading, grid, modal)

  return {
    dispose() {
      listeners.abort()
      if (modal.open) modal.close()
      stage.replaceChildren()
    },
    hide() {
      stage.hidden = true
      if (modal.open) modal.close()
    },
    show() {
      stage.hidden = false
      for (const card of cards) renderCardState(card)
    },
  }
}
