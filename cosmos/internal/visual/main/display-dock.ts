import type {
  Document,
  DocumentFragment,
  HTMLButtonElement,
  HTMLDivElement,
} from "@zavx0z/dom"
import {uiIcons} from "@ui/components/icons"

export type DisplayMode = "far" | "near"

export type DisplayDock = Readonly<{
  root: DocumentFragment
  container: HTMLDivElement
  dockButton: HTMLButtonElement
  returnButton: HTMLButtonElement
  mode: DisplayMode
  pinned: boolean
  expanded: boolean
  resize(viewportWidth: number): void
  setMode(mode: DisplayMode): void
  dispose(): void
}>

/** Creates the camera-locked navigation dock as an ordinary semantic DOM tree. */
export function createDisplayDock(
  document: Document,
  onReturn: () => void,
): DisplayDock {
  if (typeof onReturn !== "function") throw new TypeError("Display dock onReturn must be a function")
  const root = document.createDocumentFragment()
  const container = document.createElement("div")
  const returnButton = document.createElement("button")
  const returnIcon = document.createElement("img")
  const dockButton = document.createElement("button")
  const dockMark = document.createElement("span")
  let mode: DisplayMode = "far"
  let pinned = false
  let expanded = false
  let disposed = false
  let viewportWidth = 1

  container.id = "main-display-dock"
  container.setAttribute("style", containerStyle(viewportWidth, expanded))

  returnButton.type = "button"
  returnButton.setAttribute("aria-label", "Вернуться к предыдущему обзору")
  returnButton.setAttribute("style", returnButtonStyle(58))
  returnIcon.src = uiIcons.chevronLeft
  returnIcon.alt = ""
  returnIcon.width = 22
  returnIcon.height = 22
  returnButton.appendChild(returnIcon)

  dockButton.type = "button"
  dockButton.setAttribute("aria-label", "Навигация основной поверхности")
  dockButton.setAttribute("aria-pressed", "false")
  dockButton.setAttribute("style", dockButtonStyle)
  dockMark.setAttribute("style", dockMarkStyle)
  dockButton.appendChild(dockMark)

  container.append(returnButton, dockButton)
  root.appendChild(container)

  const synchronize = (): void => {
    const islandWidth = displayDockWidth(viewportWidth)
    container.setAttribute("style", containerStyle(viewportWidth, expanded))
    returnButton.setAttribute("style", expanded
      ? returnButtonStyle(islandWidth)
      : `${returnButtonStyle(islandWidth)}; display: none`)
    dockButton.setAttribute("aria-pressed", pinned ? "true" : "false")
    dockButton.title = mode === "far"
      ? "Приблизить основную поверхность"
      : "Вернуть пространственный обзор"
    returnButton.title = dockButton.title
  }

  const setExpanded = (value: boolean): void => {
    if (disposed || expanded === value) return
    expanded = value
    synchronize()
  }

  const onPointerEnter = (): void => setExpanded(true)
  const onPointerLeave = (): void => {
    if (!pinned) setExpanded(false)
  }
  const onDockClick = (): void => {
    pinned = !pinned
    setExpanded(pinned || expanded)
    synchronize()
  }
  const onReturnClick = (): void => {
    pinned = false
    setExpanded(false)
    synchronize()
    onReturn()
  }

  container.addEventListener("pointerenter", onPointerEnter)
  container.addEventListener("pointerleave", onPointerLeave)
  dockButton.addEventListener("click", onDockClick)
  returnButton.addEventListener("click", onReturnClick)
  synchronize()

  return Object.freeze({
    root,
    container,
    dockButton,
    returnButton,
    get mode() { return mode },
    get pinned() { return pinned },
    get expanded() { return expanded },
    resize(value) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError("Display dock viewport width must be finite and non-negative")
      viewportWidth = Math.max(1, value)
      synchronize()
    },
    setMode(value) {
      if (value !== "far" && value !== "near") throw new TypeError("Display mode must be far or near")
      mode = value
      synchronize()
    },
    dispose() {
      if (disposed) return
      disposed = true
      container.removeEventListener("pointerenter", onPointerEnter)
      container.removeEventListener("pointerleave", onPointerLeave)
      dockButton.removeEventListener("click", onDockClick)
      returnButton.removeEventListener("click", onReturnClick)
    },
  })
}

const containerStyle = (viewportWidth: number, expanded: boolean): string => {
  const islandWidth = displayDockWidth(viewportWidth)
  return [
    "position: absolute",
    `left: ${(viewportWidth - islandWidth) / 2}px`,
    "bottom: 13px",
    `width: ${islandWidth}px`,
    `height: ${expanded ? 82 : 17}px`,
  ].join("; ")
}

const dockButtonStyle = [
  "position: absolute",
  "left: 0",
  "bottom: 0",
  "box-sizing: border-box",
  "width: 100%",
  "height: 17px",
  "padding: 0",
  "display: flex",
  "align-items: center",
  "justify-content: center",
  "background: rgba(8, 132, 255, 0.10)",
  "border: 1px solid rgba(92, 240, 255, 0.48)",
  "border-radius: 9px",
  "color: #dffcff",
].join("; ")

const dockMarkStyle = [
  "display: block",
  "width: 32px",
  "height: 2px",
  "background: rgba(223, 252, 255, 0.72)",
  "border-radius: 1px",
].join("; ")

const returnButtonStyle = (islandWidth: number): string => [
  "position: absolute",
  `left: ${(islandWidth - 38) / 2}px`,
  "top: 0",
  "box-sizing: border-box",
  "width: 38px",
  "height: 38px",
  "padding: 8px",
  "background: rgba(8, 132, 255, 0.12)",
  "border: 1px solid rgba(92, 240, 255, 0.72)",
  "border-radius: 8px",
  "color: #dffcff",
].join("; ")

const displayDockWidth = (viewportWidth: number): number =>
  Math.max(58, Math.min(88, viewportWidth * 0.075))
