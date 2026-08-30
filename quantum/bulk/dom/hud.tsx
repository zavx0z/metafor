import type {
  Document,
  HTMLButtonElement,
  HTMLElement,
  Text,
} from "@zavx0z/dom"
import {
  HudWindow,
  Timeline,
  type HudWindowProps,
  type TimelineMarker,
  type TimelineProps,
  type TimelineTrack,
} from "@ui/components/hud"
import {createRoot, type ComponentRoot} from "@zavx0z/react"

export type BulkHudDocumentProps = Readonly<{
  title: string
  subtitle: string
  fullscreen: boolean
  fullscreenDisabled: boolean
  causalTimeline: TimelineProps
}>

export type BulkHudDocumentRefs = Readonly<{
  root: HTMLElement
  window: HTMLElement
  fullscreenButton: HTMLButtonElement
  timeline: HTMLElement
}>

type BulkHudWindowProps = Omit<HudWindowProps, "children">

export type BulkHudWindowController = Readonly<{
  element: HTMLElement
  refs: Readonly<{
    body: HTMLElement
    titleText: Text
    subtitleText: Text
    actionButtons: ReadonlyMap<string, HTMLButtonElement>
  }>
  readonly props: BulkHudWindowProps
  update(props: BulkHudWindowProps): void
  dispose(): void
}>

export type BulkTimelineController = Readonly<{
  element: HTMLElement
  refs: Readonly<{
    currentTime: HTMLElement
    currentText: Text
    tracksList: HTMLElement
    previousButton: HTMLButtonElement
    playButton: HTMLButtonElement
    nextButton: HTMLButtonElement
    trackElements: ReadonlyMap<string, HTMLElement>
    trackLabelTexts: ReadonlyMap<string, Text>
    markerItems: ReadonlyMap<string, HTMLElement>
    markerTimes: ReadonlyMap<string, HTMLElement>
    markerTexts: ReadonlyMap<string, Text>
  }>
  readonly props: TimelineProps
  update(props: TimelineProps): void
  dispose(): void
}>

export type BulkHudDocumentControllers = Readonly<{
  window: BulkHudWindowController
  timeline: BulkTimelineController
}>

export type BulkHudDocumentController = Readonly<{
  element: HTMLElement
  componentRoot: Pick<ComponentRoot, "readStyleSheets">
  refs: BulkHudDocumentRefs
  controllers: BulkHudDocumentControllers
  readonly props: BulkHudDocumentProps
  update(props: BulkHudDocumentProps): void
  dispose(): void
}>

export const bulkHudDocumentDefaultProps: BulkHudDocumentProps = Object.freeze({
  title: "Bulk Visual",
  subtitle: "Наблюдаемая проекция",
  fullscreen: false,
  fullscreenDisabled: false,
  causalTimeline: Object.freeze({
    title: "Время · causal stack",
    min: 0,
    max: 1,
    current: 0,
    playing: true,
    tracks: Object.freeze([
      Object.freeze({
        key: "causal",
        label: "Causal frontier",
        markers: Object.freeze([]),
      }),
    ]),
  }),
})

const bulkHudRootStyle: CssStyle = css`
  & {
    box-sizing: border-box;
    position: absolute;
    left: 50%;
    bottom: 8px;
    transform: translateX(-50%);
    display: block;
    width: 100%;
    max-width: 640px;
    min-height: 140px;
    z-index: 20;
  }
  &[data-fullscreen="true"] {
    --material-editor-outline-active: var(--widget-regular-background-selected);
  }
`

const bulkHudWindowStyle: CssStyle = css`
  & { width: 100%; min-height: 140px; }
`

const bulkTimelineStyle: CssStyle = css`
  & {
    width: 100%;
    min-height: 106px;
    border: 0 solid transparent;
    border-radius: 0;
  }
`

function BulkHudOwners(props: Readonly<{value: BulkHudDocumentProps}>) {
  const window = windowProps(props.value)
  return <section
    aria-label={props.value.title}
    data-bulk-hud=""
    data-fullscreen={String(props.value.fullscreen)}
    style={bulkHudRootStyle}
  >
    <HudWindow
      title={window.title}
      subtitle={window.subtitle}
      active={window.active}
      minimized={window.minimized}
      actions={window.actions}
      style={bulkHudWindowStyle}
    >
      <Timeline
        title={props.value.causalTimeline.title}
        min={props.value.causalTimeline.min}
        max={props.value.causalTimeline.max}
        current={props.value.causalTimeline.current}
        playing={props.value.causalTimeline.playing}
        tracks={props.value.causalTimeline.tracks}
        style={bulkTimelineStyle}
      />
    </HudWindow>
  </section>
}

/** Mounts current TSX HUD owners while preserving the existing Bulk controller contract. */
export function createBulkHudDocument(
  document: Document,
  initialProps: BulkHudDocumentProps = bulkHudDocumentDefaultProps,
): BulkHudDocumentController {
  const staging = document.createElement("div")
  const reactRoot = createRoot(staging)
  let currentProps = normalizeProps(initialProps)
  reactRoot.render(<BulkHudOwners value={currentProps} />)
  const root = requiredElement(staging.firstElementChild, "Bulk HUD TSX root is missing")
  staging.removeChild(root)
  const maps = mutableMaps()
  const initial = readRenderedHud(root, currentProps, maps)
  let disposed = false
  let windowDisposed = false
  let timelineDisposed = false

  const update = (nextProps: BulkHudDocumentProps): void => {
    assertActive(disposed, "BulkHudDocument controller")
    const next = normalizeProps(nextProps)
    reactRoot.render(<BulkHudOwners value={next} />)
    const rendered = readRenderedHud(root, next, maps)
    if (rendered.window !== initial.window ||
      rendered.timeline !== initial.timeline ||
      rendered.fullscreenButton !== initial.fullscreenButton ||
      rendered.body !== initial.body ||
      rendered.currentTime !== initial.currentTime ||
      rendered.tracksList !== initial.tracksList) {
      throw new Error("Bulk HUD TSX owner replaced a stable controller identity")
    }
    currentProps = next
  }

  const windowController: BulkHudWindowController = Object.freeze({
    element: initial.window,
    refs: Object.freeze({
      body: initial.body,
      titleText: initial.titleText,
      subtitleText: initial.subtitleText,
      actionButtons: maps.actionButtons,
    }),
    get props() { return windowProps(currentProps) },
    update(next) {
      assertActive(disposed || windowDisposed, "HudWindow controller")
      update({
        ...currentProps,
        title: next.title,
        subtitle: next.subtitle,
        fullscreenDisabled: next.actions[0]?.disabled ?? currentProps.fullscreenDisabled,
      })
    },
    dispose() { windowDisposed = true },
  })
  const timelineController: BulkTimelineController = Object.freeze({
    element: initial.timeline,
    refs: Object.freeze({
      currentTime: initial.currentTime,
      currentText: initial.currentText,
      tracksList: initial.tracksList,
      previousButton: initial.previousButton,
      playButton: initial.playButton,
      nextButton: initial.nextButton,
      trackElements: maps.trackElements,
      trackLabelTexts: maps.trackLabelTexts,
      markerItems: maps.markerItems,
      markerTimes: maps.markerTimes,
      markerTexts: maps.markerTexts,
    }),
    get props() { return currentProps.causalTimeline },
    update(next) {
      assertActive(disposed || timelineDisposed, "Timeline controller")
      update({...currentProps, causalTimeline: next})
    },
    dispose() { timelineDisposed = true },
  })
  const refs: BulkHudDocumentRefs = Object.freeze({
    root,
    window: initial.window,
    fullscreenButton: initial.fullscreenButton,
    timeline: initial.timeline,
  })
  const controllers: BulkHudDocumentControllers = Object.freeze({
    window: windowController,
    timeline: timelineController,
  })

  return Object.freeze({
    element: root,
    componentRoot: reactRoot,
    refs,
    controllers,
    get props() { return currentProps },
    update,
    dispose() {
      if (disposed) return
      disposed = true
      windowDisposed = true
      timelineDisposed = true
      reactRoot.unmount()
    },
  })
}

type MutableHudMaps = Readonly<{
  actionButtons: Map<string, HTMLButtonElement>
  trackElements: Map<string, HTMLElement>
  trackLabelTexts: Map<string, Text>
  markerItems: Map<string, HTMLElement>
  markerTimes: Map<string, HTMLElement>
  markerTexts: Map<string, Text>
}>

type RenderedHud = Readonly<{
  window: HTMLElement
  body: HTMLElement
  titleText: Text
  subtitleText: Text
  fullscreenButton: HTMLButtonElement
  timeline: HTMLElement
  currentTime: HTMLElement
  currentText: Text
  tracksList: HTMLElement
  previousButton: HTMLButtonElement
  playButton: HTMLButtonElement
  nextButton: HTMLButtonElement
}>

function mutableMaps(): MutableHudMaps {
  return Object.freeze({
    actionButtons: new Map(),
    trackElements: new Map(),
    trackLabelTexts: new Map(),
    markerItems: new Map(),
    markerTimes: new Map(),
    markerTexts: new Map(),
  })
}

function readRenderedHud(
  root: HTMLElement,
  props: BulkHudDocumentProps,
  maps: MutableHudMaps,
): RenderedHud {
  const window = requiredElement(root.firstElementChild, "Bulk HUD window is missing")
  const windowHeader = requiredElement(window.querySelector("header"), "Bulk HUD window header is missing")
  const spans = [...windowHeader.children].filter((element) => element.localName === "span")
  const titleText = requiredTextNode(spans[0]?.firstChild, "Bulk HUD title is missing")
  const subtitleText = requiredTextNode(spans[1]?.firstChild, "Bulk HUD subtitle is missing")
  const actions = requiredElement(
    window.querySelector('nav[aria-label="Window actions"]'),
    "Bulk HUD actions are missing",
  )
  const fullscreenButton = requiredButton(actions.querySelector("button"), "Bulk HUD fullscreen action is missing")
  fullscreenButton.setAttribute("data-action-key", "fullscreen")
  fullscreenButton.setAttribute("aria-pressed", String(props.fullscreen))
  maps.actionButtons.clear()
  maps.actionButtons.set("fullscreen", fullscreenButton)

  const timeline = requiredElement(
    [...window.querySelectorAll("section")].find((element) =>
      element.getAttribute("aria-label") === props.causalTimeline.title),
    "Bulk HUD Timeline is missing",
  )
  const body = requiredElement(timeline.parentElement, "Bulk HUD window body is missing")
  const currentTime = requiredElement(timeline.querySelector("time"), "Bulk HUD current time is missing")
  const currentText = requiredTextNode(currentTime.firstChild, "Bulk HUD current text is missing")
  const transport = requiredElement(
    timeline.querySelector('nav[aria-label="Timeline transport"]'),
    "Bulk HUD Timeline transport is missing",
  )
  const transportButtons = [...transport.querySelectorAll("button")]
  const previousButton = requiredButton(transportButtons[0], "Bulk HUD previous action is missing")
  const playButton = requiredButton(transportButtons[1], "Bulk HUD play action is missing")
  const nextButton = requiredButton(transportButtons[2], "Bulk HUD next action is missing")
  playButton.setAttribute("aria-pressed", String(props.causalTimeline.playing))
  const tracksList = requiredElement(
    timeline.querySelector('ul[aria-label="Timeline tracks"]'),
    "Bulk HUD Timeline tracks are missing",
  )

  synchronizeTimelineMaps(tracksList, maps)
  return Object.freeze({
    window,
    body,
    titleText,
    subtitleText,
    fullscreenButton,
    timeline,
    currentTime,
    currentText,
    tracksList,
    previousButton,
    playButton,
    nextButton,
  })
}

function synchronizeTimelineMaps(tracksList: HTMLElement, maps: MutableHudMaps): void {
  maps.trackElements.clear()
  maps.trackLabelTexts.clear()
  maps.markerItems.clear()
  maps.markerTimes.clear()
  maps.markerTexts.clear()
  for (const trackNode of tracksList.querySelectorAll("[data-track-key]")) {
    const track = requiredElement(trackNode, "Bulk HUD Timeline track is invalid")
    const trackKey = track.getAttribute("data-track-key")!
    const label = requiredTextNode(track.querySelector("span")?.firstChild, `Bulk HUD track label is missing: ${trackKey}`)
    maps.trackElements.set(trackKey, track)
    maps.trackLabelTexts.set(trackKey, label)
    for (const markerNode of track.querySelectorAll("[data-marker-key]")) {
      const marker = requiredElement(markerNode, `Bulk HUD Timeline marker is invalid: ${trackKey}`)
      const markerKey = marker.getAttribute("data-marker-key")!
      const key = `${trackKey}/${markerKey}`
      const button = requiredButton(marker.querySelector("button"), `Bulk HUD marker is missing: ${key}`)
      maps.markerItems.set(key, marker)
      maps.markerTimes.set(key, marker)
      maps.markerTexts.set(key, firstText(button, `Bulk HUD marker text is missing: ${key}`))
    }
  }
}

function windowProps(props: BulkHudDocumentProps): BulkHudWindowProps {
  const label = props.fullscreen ? "Выйти из полного экрана" : "Полный экран"
  return Object.freeze({
    title: props.title,
    subtitle: props.subtitle,
    active: true,
    minimized: false,
    actions: Object.freeze([
      Object.freeze({
        key: "fullscreen",
        label,
        disabled: props.fullscreenDisabled,
      }),
    ]),
  })
}

function normalizeProps(props: BulkHudDocumentProps): BulkHudDocumentProps {
  if (typeof props !== "object" || props === null) {
    throw new TypeError("Bulk HUD props must be an object")
  }
  assertNonEmpty(props.title, "Bulk HUD title")
  assertString(props.subtitle, "Bulk HUD subtitle")
  assertBoolean(props.fullscreen, "Bulk HUD fullscreen")
  assertBoolean(props.fullscreenDisabled, "Bulk HUD fullscreenDisabled")
  const causalTimeline = normalizeTimeline(props.causalTimeline)
  return Object.freeze({
    title: props.title,
    subtitle: props.subtitle,
    fullscreen: props.fullscreen,
    fullscreenDisabled: props.fullscreenDisabled,
    causalTimeline,
  })
}

function normalizeTimeline(timeline: TimelineProps): TimelineProps {
  if (typeof timeline !== "object" || timeline === null) {
    throw new TypeError("Bulk HUD causalTimeline must be an object")
  }
  assertNonEmpty(timeline.title, "Bulk HUD causalTimeline title")
  assertFinite(timeline.min, "Bulk HUD causalTimeline min")
  assertFinite(timeline.max, "Bulk HUD causalTimeline max")
  assertFinite(timeline.current, "Bulk HUD causalTimeline current")
  assertBoolean(timeline.playing, "Bulk HUD causalTimeline playing")
  if (timeline.max <= timeline.min) {
    throw new RangeError("Bulk HUD causalTimeline max must be greater than min")
  }
  if (timeline.current < timeline.min || timeline.current > timeline.max) {
    throw new RangeError("Bulk HUD causalTimeline current must be inside the range")
  }
  if (!Array.isArray(timeline.tracks)) {
    throw new TypeError("Bulk HUD causalTimeline tracks must be an array")
  }
  const trackKeys = new Set<string>()
  const tracks = timeline.tracks.map((track: TimelineTrack) => normalizeTrack(
    track,
    trackKeys,
    timeline.min,
    timeline.max,
  ))
  return Object.freeze({
    title: timeline.title,
    min: timeline.min,
    max: timeline.max,
    current: timeline.current,
    playing: timeline.playing,
    tracks: Object.freeze(tracks),
  })
}

function normalizeTrack(
  track: TimelineTrack,
  trackKeys: Set<string>,
  min: number,
  max: number,
): TimelineTrack {
  if (typeof track !== "object" || track === null) {
    throw new TypeError("Bulk HUD causalTimeline track must be an object")
  }
  assertKey(track.key, trackKeys, "Bulk HUD causalTimeline track")
  assertString(track.label, `Bulk HUD causalTimeline track ${track.key} label`)
  if (!Array.isArray(track.markers)) {
    throw new TypeError(`Bulk HUD causalTimeline track ${track.key} markers must be an array`)
  }
  const markerKeys = new Set<string>()
  const markers = track.markers.map((marker: TimelineMarker) => normalizeMarker(
    track.key,
    marker,
    markerKeys,
    min,
    max,
  ))
  return Object.freeze({
    key: track.key,
    label: track.label,
    markers: Object.freeze(markers),
  })
}

function normalizeMarker(
  trackKey: string,
  marker: TimelineMarker,
  markerKeys: Set<string>,
  min: number,
  max: number,
): TimelineMarker {
  if (typeof marker !== "object" || marker === null) {
    throw new TypeError("Bulk HUD causalTimeline marker must be an object")
  }
  assertKey(marker.key, markerKeys, `Bulk HUD causalTimeline track ${trackKey} marker`)
  assertFinite(marker.tick, `Bulk HUD causalTimeline marker ${marker.key} tick`)
  assertString(marker.label, `Bulk HUD causalTimeline marker ${marker.key} label`)
  assertBoolean(marker.selected, `Bulk HUD causalTimeline marker ${marker.key} selected`)
  if (marker.tick < min || marker.tick > max) {
    throw new RangeError(`Bulk HUD causalTimeline marker is outside the range: ${trackKey}/${marker.key}`)
  }
  return Object.freeze({...marker})
}

function assertKey(value: unknown, keys: Set<string>, label: string): asserts value is string {
  assertNonEmpty(value, `${label} key`)
  if (keys.has(value)) throw new Error(`${label} key must be unique: ${value}`)
  keys.add(value)
}

function assertNonEmpty(value: unknown, label: string): asserts value is string {
  assertString(value, label)
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty`)
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`)
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`)
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`)
  }
}

function requiredElement(value: unknown, message: string): HTMLElement {
  if (value === null || typeof value !== "object" || !("localName" in value)) throw new Error(message)
  return value as HTMLElement
}

function requiredButton(value: unknown, message: string): HTMLButtonElement {
  const element = requiredElement(value, message)
  if (element.localName !== "button") throw new Error(message)
  return element as HTMLButtonElement
}

function requiredTextNode(value: unknown, message: string): Text {
  if (value === null || typeof value !== "object" || !("data" in value)) throw new Error(message)
  return value as Text
}

function firstText(root: HTMLElement, message: string): Text {
  const pending = [...root.childNodes]
  while (pending.length > 0) {
    const node = pending.shift()!
    if ("data" in node && typeof (node as Text).data === "string" && (node as Text).data.length > 0) {
      return node as Text
    }
    pending.unshift(...node.childNodes)
  }
  throw new Error(message)
}

function assertActive(disposed: boolean, label: string): void {
  if (disposed) throw new Error(`${label} is disposed`)
}
