import type {
  Document,
  HTMLButtonElement,
  HTMLElement,
  Text,
} from "@zavx0z/dom"
import {Button} from "@ui/components/button"
import {
  HudWindow,
  Timeline,
  type HudWindowProps,
  type TimelineKeyframe,
  type TimelineMarker,
} from "@ui/components/hud"
import {createRoot, type ComponentRoot} from "@zavx0z/react"
import {
  buildBulkCausalTimePresentation,
  type BulkCausalChannel,
  type BulkCausalChannelPoint,
  type BulkCausalChannelsProps,
  type BulkCausalPlaybackProps,
  type BulkCausalTimelineProps,
  type BulkCausalTimePresentation,
} from "./causal-time.ts"

export type BulkHudDocumentProps = Readonly<{
  title: string
  subtitle: string
  fullscreen: boolean
  fullscreenDisabled: boolean
  causalTime: BulkCausalTimePresentation
}>

export type BulkHudDocumentRefs = Readonly<{
  root: HTMLElement
  window: HTMLElement
  fullscreenButton: HTMLButtonElement
  timeline: HTMLElement
  playback: HTMLElement
  channels: HTMLElement
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
}>

export type BulkTimelineController = Readonly<{
  element: HTMLElement
  refs: Readonly<{
    currentOutput: HTMLElement
    currentText: Text
    keyframesList: HTMLElement
    markersList: HTMLElement
    keyframeItems: ReadonlyMap<string, HTMLElement>
    keyframeButtons: ReadonlyMap<string, HTMLButtonElement>
    sceneMarkerItems: ReadonlyMap<string, HTMLElement>
    sceneMarkerButtons: ReadonlyMap<string, HTMLButtonElement>
  }>
  readonly props: BulkCausalTimelineProps
}>

export type BulkPlaybackController = Readonly<{
  element: HTMLElement
  refs: Readonly<{
    previousButton: HTMLButtonElement
    toggleButton: HTMLButtonElement
    nextButton: HTMLButtonElement
  }>
  readonly props: BulkCausalPlaybackProps
}>

export type BulkCausalChannelsController = Readonly<{
  element: HTMLElement
  refs: Readonly<{
    channelsList: HTMLElement
    channelElements: ReadonlyMap<string, HTMLElement>
    channelLabelTexts: ReadonlyMap<string, Text>
    pointItems: ReadonlyMap<string, HTMLElement>
    pointButtons: ReadonlyMap<string, HTMLButtonElement>
    pointTexts: ReadonlyMap<string, Text>
  }>
  readonly props: BulkCausalChannelsProps
}>

export type BulkHudDocumentControllers = Readonly<{
  window: BulkHudWindowController
  timeline: BulkTimelineController
  playback: BulkPlaybackController
  channels: BulkCausalChannelsController
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
  causalTime: buildBulkCausalTimePresentation([], 0, "open"),
})

function BulkPlayback(props: Readonly<{value: BulkCausalPlaybackProps}>) {
  return <nav
    aria-label="Causal playback"
    style={css`
      & {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        gap: 4px;
        min-height: 22px;
      }
    `}
  >
    <Button
      label="Назад"
      aria-label="Предыдущий causal frame"
      disabled={props.value.previousDisabled}
      size="small"
      style={css`& { width: auto; min-width: 64px; height: 22px; padding: 2px 8px; }`}
    />
    <Button
      label={props.value.playing ? "Пауза" : "Продолжить"}
      aria-label={props.value.playing ? "Приостановить causal time" : "Продолжить causal time"}
      disabled={props.value.toggleDisabled}
      selected={props.value.playing}
      size="small"
      style={css`& { width: auto; min-width: 64px; height: 22px; padding: 2px 8px; }`}
    />
    <Button
      label="Вперёд"
      aria-label="Следующий causal frame"
      disabled={props.value.nextDisabled}
      size="small"
      style={css`& { width: auto; min-width: 64px; height: 22px; padding: 2px 8px; }`}
    />
  </nav>
}

function BulkCausalPointView(props: Readonly<{
  channelLabel: string
  point: BulkCausalChannelPoint
}>) {
  const point = props.point
  return <li
    data-channel-point-key={point.key}
    data-frame={String(point.frame)}
    data-resolution={point.resolution}
    style={css`& { display: block; list-style: none; }`}
  >
    <Button
      label={String(point.frame)}
      aria-label={`${props.channelLabel} ${point.label} at ${point.frame}`}
      title={`${props.channelLabel} · ${point.label} · ${point.resolution}`}
      selected={point.selected}
      tone={point.resolution === "overloaded"
        ? "error"
        : point.resolution === "degraded" ? "warning" : "neutral"}
      size="small"
      style={css`& { width: auto; min-width: 28px; height: 18px; padding: 1px 4px; font-size: var(--font-size-2xs); }`}
    />
  </li>
}

function BulkCausalChannelView(props: Readonly<{channel: BulkCausalChannel}>) {
  const channel = props.channel
  return <li
    data-channel-key={channel.key}
    style={css`& { display: flex; flex-direction: row; align-items: center; min-height: 22px; gap: 4px; list-style: none; }`}
  >
    <span data-channel-label="" style={css`
      & { display: inline; width: 68px; flex-shrink: 0; color: var(--widget-text-content-readonly); font-size: var(--font-size-2xs); }
    `}>{channel.label}</span>
    <ol aria-label={`${channel.label} causal frames`} style={css`
      & { display: flex; flex-direction: row; align-items: center; flex-grow: 1; gap: 3px; min-width: 0; margin: 0; padding: 0; overflow: clip; }
    `}>
      {channel.points.map((point) => <BulkCausalPointView
        key={point.key}
        channelLabel={channel.label}
        point={point}
      />)}
    </ol>
  </li>
}

function BulkCausalChannels(props: Readonly<{value: BulkCausalChannelsProps}>) {
  return <section
    aria-label={props.value.title}
    data-bulk-causal-channels=""
    style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 2px;
        border-top: var(--border-width-control) solid var(--widget-regular-outline);
        color: var(--widget-toolbar-content);
      }
    `}
  >
    <header style={css`
      & { display: flex; align-items: center; min-height: 20px; padding: 2px 6px; color: var(--widget-text-content-readonly); font-size: var(--font-size-2xs); }
    `}><span>{props.value.title}</span></header>
    <ul aria-label="Causal channels" style={css`
      & { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; }
    `}>
      {props.value.channels.map((channel) => <BulkCausalChannelView
        key={channel.key}
        channel={channel}
      />)}
    </ul>
  </section>
}

function BulkCausalTimeProjection(props: Readonly<{value: BulkCausalTimePresentation}>) {
  const timeline = props.value.timeline
  return <section
    aria-label="Bulk causal time"
    data-bulk-causal-time=""
    style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 4px;
      }
    `}
  >
    <BulkPlayback value={props.value.playback} />
    <Timeline
      title={timeline.title}
      frameStart={timeline.frameStart}
      frameEnd={timeline.frameEnd}
      frameCurrent={timeline.frameCurrent}
      visibleStart={timeline.visibleStart}
      visibleEnd={timeline.visibleEnd}
      previewStart={timeline.previewStart}
      previewEnd={timeline.previewEnd}
      keyframes={timeline.keyframes}
      markers={timeline.markers}
      style={css`& { width: 100%; min-height: 112px; border: 0 solid transparent; border-radius: 0; }`}
    />
    <BulkCausalChannels value={props.value.channels} />
  </section>
}

function BulkHudOwners(props: Readonly<{value: BulkHudDocumentProps}>) {
  const window = windowProps(props.value)
  return <section
    aria-label={props.value.title}
    data-bulk-hud=""
    data-fullscreen={String(props.value.fullscreen)}
    style={css`
      & {
        box-sizing: border-box;
        position: absolute;
        left: 50%;
        bottom: 8px;
        transform: translateX(-50%);
        display: block;
        width: 100%;
        max-width: 640px;
        min-height: 280px;
        z-index: 20;
      }
      &[data-fullscreen="true"] {
        --material-editor-outline-active: var(--widget-regular-background-selected);
      }
    `}
  >
    <HudWindow
      title={window.title}
      subtitle={window.subtitle}
      active={window.active}
      minimized={window.minimized}
      actions={window.actions}
      style={css`& { width: 100%; min-height: 280px; }`}
    >
      <BulkCausalTimeProjection value={props.value.causalTime} />
    </HudWindow>
  </section>
}

/** Mounts the Bulk-owned causal controls around the exact neutral UI Timeline owner. */
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

  const update = (nextProps: BulkHudDocumentProps): void => {
    assertActive(disposed, "BulkHudDocument controller")
    const next = normalizeProps(nextProps)
    reactRoot.render(<BulkHudOwners value={next} />)
    const rendered = readRenderedHud(root, next, maps)
    if (
      rendered.window !== initial.window ||
      rendered.body !== initial.body ||
      rendered.fullscreenButton !== initial.fullscreenButton ||
      rendered.timeProjection !== initial.timeProjection ||
      rendered.timeline !== initial.timeline ||
      rendered.currentOutput !== initial.currentOutput ||
      rendered.keyframesList !== initial.keyframesList ||
      rendered.markersList !== initial.markersList ||
      rendered.playback !== initial.playback ||
      rendered.previousButton !== initial.previousButton ||
      rendered.toggleButton !== initial.toggleButton ||
      rendered.nextButton !== initial.nextButton ||
      rendered.channels !== initial.channels ||
      rendered.channelsList !== initial.channelsList
    ) {
      throw new Error("Bulk HUD TSX owner replaced a stable controller identity")
    }
    currentProps = next
  }

  const refs: BulkHudDocumentRefs = Object.freeze({
    root,
    window: initial.window,
    fullscreenButton: initial.fullscreenButton,
    timeline: initial.timeline,
    playback: initial.playback,
    channels: initial.channels,
  })
  const controllers: BulkHudDocumentControllers = Object.freeze({
    window: Object.freeze({
      element: initial.window,
      refs: Object.freeze({
        body: initial.body,
        titleText: initial.titleText,
        subtitleText: initial.subtitleText,
        actionButtons: maps.actionButtons,
      }),
      get props() { return windowProps(currentProps) },
    }),
    timeline: Object.freeze({
      element: initial.timeline,
      refs: Object.freeze({
        currentOutput: initial.currentOutput,
        currentText: initial.currentText,
        keyframesList: initial.keyframesList,
        markersList: initial.markersList,
        keyframeItems: maps.keyframeItems,
        keyframeButtons: maps.keyframeButtons,
        sceneMarkerItems: maps.sceneMarkerItems,
        sceneMarkerButtons: maps.sceneMarkerButtons,
      }),
      get props() { return currentProps.causalTime.timeline },
    }),
    playback: Object.freeze({
      element: initial.playback,
      refs: Object.freeze({
        previousButton: initial.previousButton,
        toggleButton: initial.toggleButton,
        nextButton: initial.nextButton,
      }),
      get props() { return currentProps.causalTime.playback },
    }),
    channels: Object.freeze({
      element: initial.channels,
      refs: Object.freeze({
        channelsList: initial.channelsList,
        channelElements: maps.channelElements,
        channelLabelTexts: maps.channelLabelTexts,
        pointItems: maps.pointItems,
        pointButtons: maps.pointButtons,
        pointTexts: maps.pointTexts,
      }),
      get props() { return currentProps.causalTime.channels },
    }),
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
      reactRoot.unmount()
    },
  })
}

type MutableHudMaps = Readonly<{
  actionButtons: Map<string, HTMLButtonElement>
  keyframeItems: Map<string, HTMLElement>
  keyframeButtons: Map<string, HTMLButtonElement>
  sceneMarkerItems: Map<string, HTMLElement>
  sceneMarkerButtons: Map<string, HTMLButtonElement>
  channelElements: Map<string, HTMLElement>
  channelLabelTexts: Map<string, Text>
  pointItems: Map<string, HTMLElement>
  pointButtons: Map<string, HTMLButtonElement>
  pointTexts: Map<string, Text>
}>

type RenderedHud = Readonly<{
  window: HTMLElement
  body: HTMLElement
  titleText: Text
  subtitleText: Text
  fullscreenButton: HTMLButtonElement
  timeProjection: HTMLElement
  timeline: HTMLElement
  currentOutput: HTMLElement
  currentText: Text
  keyframesList: HTMLElement
  markersList: HTMLElement
  playback: HTMLElement
  previousButton: HTMLButtonElement
  toggleButton: HTMLButtonElement
  nextButton: HTMLButtonElement
  channels: HTMLElement
  channelsList: HTMLElement
}>

function mutableMaps(): MutableHudMaps {
  return Object.freeze({
    actionButtons: new Map(),
    keyframeItems: new Map(),
    keyframeButtons: new Map(),
    sceneMarkerItems: new Map(),
    sceneMarkerButtons: new Map(),
    channelElements: new Map(),
    channelLabelTexts: new Map(),
    pointItems: new Map(),
    pointButtons: new Map(),
    pointTexts: new Map(),
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

  const timeProjection = requiredElement(
    window.querySelector("[data-bulk-causal-time]"),
    "Bulk HUD causal-time projection is missing",
  )
  const body = requiredElement(timeProjection.parentElement, "Bulk HUD window body is missing")
  const timeline = requiredElement(
    timeProjection.querySelector("[data-timeline]"),
    "Bulk HUD neutral Timeline is missing",
  )
  const currentOutput = requiredElement(timeline.querySelector("output"), "Bulk HUD current output is missing")
  const currentText = requiredTextNode(currentOutput.firstChild, "Bulk HUD current text is missing")
  const keyframesList = requiredElement(
    timeline.querySelector('ol[aria-label="Summary keyframes"]'),
    "Bulk HUD summary keyframes are missing",
  )
  const markersList = requiredElement(
    timeline.querySelector('ol[aria-label="Timeline markers"]'),
    "Bulk HUD scene markers are missing",
  )
  synchronizeTimelineMaps(timeline, maps)

  const playback = requiredElement(
    timeProjection.querySelector('nav[aria-label="Causal playback"]'),
    "Bulk HUD playback controller is missing",
  )
  const playbackButtons = [...playback.querySelectorAll("button")]
  const previousButton = requiredButton(playbackButtons[0], "Bulk HUD previous action is missing")
  const toggleButton = requiredButton(playbackButtons[1], "Bulk HUD playback toggle is missing")
  const nextButton = requiredButton(playbackButtons[2], "Bulk HUD next action is missing")
  previousButton.setAttribute("data-action-key", "previous")
  toggleButton.setAttribute("data-action-key", "toggle")
  nextButton.setAttribute("data-action-key", "next")

  const channels = requiredElement(
    timeProjection.querySelector("[data-bulk-causal-channels]"),
    "Bulk HUD causal channels are missing",
  )
  const channelsList = requiredElement(
    channels.querySelector('ul[aria-label="Causal channels"]'),
    "Bulk HUD causal channel list is missing",
  )
  synchronizeChannelMaps(channelsList, maps)

  return Object.freeze({
    window,
    body,
    titleText,
    subtitleText,
    fullscreenButton,
    timeProjection,
    timeline,
    currentOutput,
    currentText,
    keyframesList,
    markersList,
    playback,
    previousButton,
    toggleButton,
    nextButton,
    channels,
    channelsList,
  })
}

function synchronizeTimelineMaps(timeline: HTMLElement, maps: MutableHudMaps): void {
  maps.keyframeItems.clear()
  maps.keyframeButtons.clear()
  maps.sceneMarkerItems.clear()
  maps.sceneMarkerButtons.clear()
  for (const node of timeline.querySelectorAll("[data-keyframe-key]")) {
    const item = requiredElement(node, "Bulk HUD Timeline keyframe is invalid")
    const key = requiredAttribute(item, "data-keyframe-key", "Bulk HUD Timeline keyframe key is missing")
    maps.keyframeItems.set(key, item)
    maps.keyframeButtons.set(key, requiredButton(item.querySelector("button"), `Bulk HUD keyframe button is missing: ${key}`))
  }
  for (const node of timeline.querySelectorAll("[data-marker-key]")) {
    const item = requiredElement(node, "Bulk HUD Timeline scene marker is invalid")
    const key = requiredAttribute(item, "data-marker-key", "Bulk HUD Timeline scene marker key is missing")
    maps.sceneMarkerItems.set(key, item)
    maps.sceneMarkerButtons.set(key, requiredButton(item.querySelector("button"), `Bulk HUD scene marker button is missing: ${key}`))
  }
}

function synchronizeChannelMaps(channelsList: HTMLElement, maps: MutableHudMaps): void {
  maps.channelElements.clear()
  maps.channelLabelTexts.clear()
  maps.pointItems.clear()
  maps.pointButtons.clear()
  maps.pointTexts.clear()
  for (const node of channelsList.querySelectorAll("[data-channel-key]")) {
    const channel = requiredElement(node, "Bulk HUD causal channel is invalid")
    const channelKey = requiredAttribute(channel, "data-channel-key", "Bulk HUD causal channel key is missing")
    const label = requiredElement(channel.querySelector("[data-channel-label]"), `Bulk HUD channel label is missing: ${channelKey}`)
    maps.channelElements.set(channelKey, channel)
    maps.channelLabelTexts.set(channelKey, requiredTextNode(label.firstChild, `Bulk HUD channel text is missing: ${channelKey}`))
    for (const pointNode of channel.querySelectorAll("[data-channel-point-key]")) {
      const point = requiredElement(pointNode, `Bulk HUD causal channel point is invalid: ${channelKey}`)
      const pointKey = requiredAttribute(point, "data-channel-point-key", `Bulk HUD channel point key is missing: ${channelKey}`)
      const key = `${channelKey}/${pointKey}`
      const button = requiredButton(point.querySelector("button"), `Bulk HUD channel point button is missing: ${key}`)
      maps.pointItems.set(key, point)
      maps.pointButtons.set(key, button)
      maps.pointTexts.set(key, firstText(button, `Bulk HUD channel point text is missing: ${key}`))
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
  return Object.freeze({
    title: props.title,
    subtitle: props.subtitle,
    fullscreen: props.fullscreen,
    fullscreenDisabled: props.fullscreenDisabled,
    causalTime: normalizeCausalTime(props.causalTime),
  })
}

function normalizeCausalTime(value: BulkCausalTimePresentation): BulkCausalTimePresentation {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Bulk HUD causalTime must be an object")
  }
  const timeline = normalizeTimeline(value.timeline)
  const playback = normalizePlayback(value.playback)
  const channels = normalizeChannels(value.channels, timeline)
  return Object.freeze({timeline, playback, channels})
}

function normalizeTimeline(timeline: BulkCausalTimelineProps): BulkCausalTimelineProps {
  if (typeof timeline !== "object" || timeline === null) {
    throw new TypeError("Bulk HUD causal timeline must be an object")
  }
  assertNonEmpty(timeline.title, "Bulk HUD causal timeline title")
  assertFinite(timeline.frameStart, "Bulk HUD causal timeline frameStart")
  assertFinite(timeline.frameEnd, "Bulk HUD causal timeline frameEnd")
  assertFinite(timeline.frameCurrent, "Bulk HUD causal timeline frameCurrent")
  assertFinite(timeline.visibleStart, "Bulk HUD causal timeline visibleStart")
  assertFinite(timeline.visibleEnd, "Bulk HUD causal timeline visibleEnd")
  if (timeline.frameEnd <= timeline.frameStart) {
    throw new RangeError("Bulk HUD causal timeline frameEnd must be greater than frameStart")
  }
  if (timeline.frameCurrent < timeline.frameStart || timeline.frameCurrent > timeline.frameEnd) {
    throw new RangeError("Bulk HUD causal timeline frameCurrent must be inside the playback range")
  }
  if (timeline.visibleEnd <= timeline.visibleStart) {
    throw new RangeError("Bulk HUD causal timeline visibleEnd must be greater than visibleStart")
  }
  if ((timeline.previewStart === undefined) !== (timeline.previewEnd === undefined)) {
    throw new Error("Bulk HUD causal timeline preview range requires both endpoints")
  }
  if (timeline.previewStart !== undefined && timeline.previewEnd !== undefined) {
    assertFinite(timeline.previewStart, "Bulk HUD causal timeline previewStart")
    assertFinite(timeline.previewEnd, "Bulk HUD causal timeline previewEnd")
    if (timeline.previewEnd < timeline.previewStart) {
      throw new RangeError("Bulk HUD causal timeline previewEnd must not be less than previewStart")
    }
  }
  const keyframes = normalizeTimelinePoints(
    timeline.keyframes,
    timeline.frameStart,
    timeline.frameEnd,
    "keyframe",
  )
  const markers = normalizeTimelinePoints(
    timeline.markers,
    timeline.frameStart,
    timeline.frameEnd,
    "scene marker",
  )
  return Object.freeze({
    title: timeline.title,
    frameStart: timeline.frameStart,
    frameEnd: timeline.frameEnd,
    frameCurrent: timeline.frameCurrent,
    visibleStart: timeline.visibleStart,
    visibleEnd: timeline.visibleEnd,
    ...(timeline.previewStart === undefined ? {} : {
      previewStart: timeline.previewStart,
      previewEnd: timeline.previewEnd,
    }),
    keyframes,
    markers,
  })
}

function normalizeTimelinePoints<T extends TimelineKeyframe | TimelineMarker>(
  values: readonly T[],
  minimum: number,
  maximum: number,
  label: string,
): readonly T[] {
  if (!Array.isArray(values)) throw new TypeError(`Bulk HUD causal timeline ${label}s must be an array`)
  const keys = new Set<string>()
  return Object.freeze(values.map((value) => {
    if (typeof value !== "object" || value === null) {
      throw new TypeError(`Bulk HUD causal timeline ${label} must be an object`)
    }
    assertKey(value.key, keys, `Bulk HUD causal timeline ${label}`)
    assertFinite(value.frame, `Bulk HUD causal timeline ${label} ${value.key} frame`)
    assertString(value.label, `Bulk HUD causal timeline ${label} ${value.key} label`)
    if (value.selected !== undefined) {
      assertBoolean(value.selected, `Bulk HUD causal timeline ${label} ${value.key} selected`)
    }
    if (value.frame < minimum || value.frame > maximum) {
      throw new RangeError(`Bulk HUD causal timeline ${label} is outside the playback range: ${value.key}`)
    }
    return Object.freeze({...value})
  })) as readonly T[]
}

function normalizePlayback(playback: BulkCausalPlaybackProps): BulkCausalPlaybackProps {
  if (typeof playback !== "object" || playback === null) {
    throw new TypeError("Bulk HUD causal playback must be an object")
  }
  assertBoolean(playback.playing, "Bulk HUD causal playback playing")
  assertBoolean(playback.previousDisabled, "Bulk HUD causal playback previousDisabled")
  assertBoolean(playback.toggleDisabled, "Bulk HUD causal playback toggleDisabled")
  assertBoolean(playback.nextDisabled, "Bulk HUD causal playback nextDisabled")
  return Object.freeze({...playback})
}

function normalizeChannels(
  channels: BulkCausalChannelsProps,
  timeline: BulkCausalTimelineProps,
): BulkCausalChannelsProps {
  if (typeof channels !== "object" || channels === null) {
    throw new TypeError("Bulk HUD causal channels must be an object")
  }
  assertNonEmpty(channels.title, "Bulk HUD causal channels title")
  if (!Array.isArray(channels.channels)) throw new TypeError("Bulk HUD causal channels must be an array")
  const keys = new Set<string>()
  const normalized = channels.channels.map((channel) => normalizeChannel(
    channel,
    keys,
    timeline.frameStart,
    timeline.frameEnd,
  ))
  assertSharedCausalPoints(normalized, timeline.keyframes)
  return Object.freeze({
    title: channels.title,
    channels: Object.freeze(normalized),
  })
}

function normalizeChannel(
  channel: BulkCausalChannel,
  keys: Set<string>,
  minimum: number,
  maximum: number,
): BulkCausalChannel {
  if (typeof channel !== "object" || channel === null) {
    throw new TypeError("Bulk HUD causal channel must be an object")
  }
  assertKey(channel.key, keys, "Bulk HUD causal channel")
  assertNonEmpty(channel.label, `Bulk HUD causal channel ${channel.key} label`)
  if (!Array.isArray(channel.points)) {
    throw new TypeError(`Bulk HUD causal channel ${channel.key} points must be an array`)
  }
  const pointKeys = new Set<string>()
  const points = channel.points.map((point) => normalizeChannelPoint(
    channel.key,
    point,
    pointKeys,
    minimum,
    maximum,
  ))
  return Object.freeze({
    key: channel.key,
    label: channel.label,
    points: Object.freeze(points),
  })
}

function normalizeChannelPoint(
  channelKey: string,
  point: BulkCausalChannelPoint,
  keys: Set<string>,
  minimum: number,
  maximum: number,
): BulkCausalChannelPoint {
  if (typeof point !== "object" || point === null) {
    throw new TypeError("Bulk HUD causal channel point must be an object")
  }
  assertKey(point.key, keys, `Bulk HUD causal channel ${channelKey} point`)
  assertFinite(point.frame, `Bulk HUD causal channel point ${point.key} frame`)
  assertNonEmpty(point.label, `Bulk HUD causal channel point ${point.key} label`)
  assertBoolean(point.selected, `Bulk HUD causal channel point ${point.key} selected`)
  if (!isResolution(point.resolution)) {
    throw new TypeError(`Bulk HUD causal channel point ${point.key} resolution is invalid`)
  }
  if (point.frame < minimum || point.frame > maximum) {
    throw new RangeError(`Bulk HUD causal channel point is outside the playback range: ${channelKey}/${point.key}`)
  }
  return Object.freeze({...point})
}

function assertSharedCausalPoints(
  channels: readonly BulkCausalChannel[],
  keyframes: readonly TimelineKeyframe[],
): void {
  const expected = new Map(keyframes.map((keyframe) => [keyframe.key, keyframe]))
  for (const channel of channels) {
    if (channel.points.length !== keyframes.length) {
      throw new Error(`Bulk HUD causal channel must project every summary keyframe: ${channel.key}`)
    }
    for (const point of channel.points) {
      const keyframe = expected.get(point.key)
      if (
        keyframe === undefined ||
        keyframe.frame !== point.frame ||
        (keyframe.selected === true) !== point.selected
      ) {
        throw new Error(`Bulk HUD causal channel diverges from the summary timeline: ${channel.key}/${point.key}`)
      }
    }
  }
}

function isResolution(value: unknown): boolean {
  return value === "exact" || value === "degraded" || value === "overloaded" || value === "unknown"
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

function requiredAttribute(element: HTMLElement, name: string, message: string): string {
  const value = element.getAttribute(name)
  if (value === null || value.length === 0) throw new Error(message)
  return value
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
