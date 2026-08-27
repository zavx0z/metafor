import type {
	Document,
	HTMLButtonElement,
	HTMLElement,
} from "@zavx0z/dom"
import {
	createHudWindow,
	createTimeline,
	type HudWindowController,
	type TimelineController,
	type TimelineMarker,
	type TimelineProps,
	type TimelineTrack,
} from "@ui/components/hud"

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

export type BulkHudDocumentControllers = Readonly<{
	window: HudWindowController
	timeline: TimelineController
}>

export type BulkHudDocumentController = Readonly<{
	element: HTMLElement
	refs: BulkHudDocumentRefs
	controllers: BulkHudDocumentControllers
	props: BulkHudDocumentProps
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

export const bulkHudDocumentCss = String.raw`
.bulk-hud-document {
  box-sizing: border-box;
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: block;
  width: 100%;
  max-width: 720px;
  min-height: 220px;
  z-index: 20;
}

.bulk-hud-document .ui-hud-window {
  width: 100%;
  min-height: 220px;
}

.bulk-hud-document .ui-hud-window__body {
  padding: 0;
}

.bulk-hud-document .ui-timeline {
  width: 100%;
  min-height: 180px;
  border: 0 solid transparent;
  border-radius: 0;
}

.bulk-hud-document[data-fullscreen="true"] .ui-hud-window {
  border-color: #7edcec;
}

.bulk-hud-document .ui-timeline__marker[data-resolution="exact"] {
  background: #22603e;
}

.bulk-hud-document .ui-timeline__marker[data-resolution="degraded"] {
  background: #7a5719;
}

.bulk-hud-document .ui-timeline__marker[data-resolution="overloaded"] {
  background: #7a2b2b;
}

.bulk-hud-document .ui-timeline__marker[data-resolution="unknown"] {
  background: #424852;
}
`

export function createBulkHudDocument(
	document: Document,
	initialProps: BulkHudDocumentProps = bulkHudDocumentDefaultProps,
): BulkHudDocumentController {
	const props = normalizeProps(initialProps)
	const root = document.createElement("section")
	const windowController = createHudWindow(document, windowProps(props))
	const timelineController = createTimeline(document, props.causalTimeline)
	const fullscreenButton = required(
		windowController.refs.actionButtons.get("fullscreen"),
		"Bulk HUD fullscreen action is missing",
	)

	root.className = "bulk-hud-document"
	windowController.refs.body.appendChild(timelineController.element)
	root.appendChild(windowController.element)

	let currentProps = props
	let disposed = false

	const update = (nextProps: BulkHudDocumentProps): void => {
		if (disposed) throw new Error("BulkHudDocument controller is disposed")
		const next = normalizeProps(nextProps)
		windowController.update(windowProps(next))
		timelineController.update(next.causalTimeline)
		root.className = next.fullscreen
			? "bulk-hud-document bulk-hud-document--fullscreen"
			: "bulk-hud-document"
		root.setAttribute("data-fullscreen", String(next.fullscreen))
		root.setAttribute("aria-label", next.title)
		fullscreenButton.setAttribute("aria-pressed", String(next.fullscreen))
		currentProps = next
	}

	const refs: BulkHudDocumentRefs = Object.freeze({
		root,
		window: windowController.element,
		fullscreenButton,
		timeline: timelineController.element,
	})
	const controllers: BulkHudDocumentControllers = Object.freeze({
		window: windowController,
		timeline: timelineController,
	})
	const controller: BulkHudDocumentController = Object.freeze({
		element: root,
		refs,
		controllers,
		get props() { return currentProps },
		update,
		dispose() {
			if (disposed) return
			disposed = true
			windowController.dispose()
			timelineController.dispose()
		},
	})
	update(props)
	return controller
}

function windowProps(props: BulkHudDocumentProps) {
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

function required<Value>(value: Value | undefined, message: string): Value {
	if (value === undefined) throw new Error(message)
	return value
}
