import {Button} from "@ui/components/button"
import {uiIcons} from "@ui/components/icons"
import type {
  Document,
  DocumentFragment,
  HTMLButtonElement,
  HTMLDivElement,
} from "@zavx0z/dom"
import {createRoot} from "@zavx0z/react"

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

type DisplayDockViewProps = Readonly<{
  expanded: boolean
  pinned: boolean
  title: string
  left: string
  width: string
  returnButtonLeft: string
  onDockClick(): void
  onReturnClick(): void
}>

function DisplayDockView(props: DisplayDockViewProps) {
  return <div
    id="main-display-dock"
    data-expanded={props.expanded ? "true" : "false"}
    style={css`
      position: absolute;
      left: ${props.left};
      bottom: 13px;
      width: ${props.width};
      height: 17px;

      &[data-expanded="true"] {
        height: 82px;
      }
    `}
  >
    <Button
      label="Вернуться к предыдущему обзору"
      aria-label="Вернуться к предыдущему обзору"
      title={props.title}
      iconSrc={uiIcons.chevronLeft}
      iconOnly={true}
      variant="glass"
      size="small"
      onClick={props.onReturnClick}
      style={css`
        position: absolute;
        left: ${props.returnButtonLeft};
        top: 0;
        width: 38px;
        min-width: 38px;
        height: 38px;
        padding: 8px;

        ${props.expanded === false && css`
          display: none;
        `}
      `}
    />
    <Button
      label="—"
      aria-label="Навигация основной поверхности"
      title={props.title}
      selected={props.pinned}
      variant="glass"
      size="small"
      onClick={props.onDockClick}
      style={css`
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        min-width: 100%;
        height: 17px;
        padding: 0;
        border-radius: 9px;
      `}
    />
  </div>
}

/**
Mounts the camera-locked navigation dock through one compiled component root.

Both controls are exact production `@ui/components/button` owners; this
controller retains only Visual navigation state and same-Document placement.
*/
export function createDisplayDock(
  document: Document,
  onReturn: () => void,
): DisplayDock {
  if (typeof onReturn !== "function") throw new TypeError("Display dock onReturn must be a function")
  const root = document.createDocumentFragment()
  const host = document.createElement("div")
  root.appendChild(host)
  const componentRoot = createRoot(host, {identifierPrefix: "internal-visual-dock"})
  let mode: DisplayMode = "far"
  let pinned = false
  let expanded = false
  let disposed = false
  let viewportWidth = 1

  const render = (): void => {
    const width = displayDockWidth(viewportWidth)
    componentRoot.render(<DisplayDockView
      expanded={expanded}
      pinned={pinned}
      title={mode === "far"
        ? "Приблизить основную поверхность"
        : "Вернуть пространственный обзор"}
      left={`${(viewportWidth - width) / 2}px`}
      width={`${width}px`}
      returnButtonLeft={`${(width - 38) / 2}px`}
      onDockClick={onDockClick}
      onReturnClick={onReturnClick}
    />)
  }
  const setExpanded = (value: boolean): void => {
    if (disposed || expanded === value) return
    expanded = value
    render()
  }
  const onPointerEnter = (): void => setExpanded(true)
  const onPointerLeave = (): void => {
    if (!pinned) setExpanded(false)
  }
  function onDockClick(): void {
    if (disposed) return
    pinned = !pinned
    if (pinned) expanded = true
    render()
  }
  function onReturnClick(): void {
    if (disposed) return
    pinned = false
    expanded = false
    render()
    onReturn()
  }

  render()
  const container = host.querySelector("#main-display-dock") as HTMLDivElement | null
  const buttons = container === null
    ? []
    : [...container.querySelectorAll("button")] as HTMLButtonElement[]
  if (container === null || buttons.length !== 2) {
    componentRoot.unmount()
    throw new Error(`Display dock requires one root and two production Buttons, received ${buttons.length}`)
  }
  const returnButton = buttons[0]!
  const dockButton = buttons[1]!
  container.addEventListener("pointerenter", onPointerEnter)
  container.addEventListener("pointerleave", onPointerLeave)

  return Object.freeze({
    root,
    container,
    dockButton,
    returnButton,
    get mode() { return mode },
    get pinned() { return pinned },
    get expanded() { return expanded },
    resize(value) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError("Display dock viewport width must be finite and non-negative")
      }
      viewportWidth = Math.max(1, value)
      render()
    },
    setMode(value) {
      if (value !== "far" && value !== "near") {
        throw new TypeError("Display mode must be far or near")
      }
      mode = value
      render()
    },
    dispose() {
      if (disposed) return
      disposed = true
      container.removeEventListener("pointerenter", onPointerEnter)
      container.removeEventListener("pointerleave", onPointerLeave)
      componentRoot.unmount()
      host.remove()
    },
  })
}

const displayDockWidth = (viewportWidth: number): number =>
  Math.max(58, Math.min(88, viewportWidth * 0.075))
