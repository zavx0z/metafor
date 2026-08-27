import {describe, expect, test} from "bun:test"
import {
	createDocument,
	HTMLElement,
	MouseEvent,
	PointerEvent,
} from "@zavx0z/dom"
import {
	createBulkHudDocument,
	bulkHudDocumentCss,
	bulkHudDocumentDefaultProps,
	type BulkHudDocumentProps,
} from "./hud.ts"

const controlledProps: BulkHudDocumentProps = Object.freeze({
	title: "Bulk Visual",
	subtitle: "Causal projection",
	fullscreen: false,
	fullscreenDisabled: false,
	causalTimeline: Object.freeze({
		title: "Время · causal stack",
		min: 0,
		max: 20,
		current: 10,
		playing: false,
		tracks: Object.freeze([
			Object.freeze({
				key: "force",
				label: "Force",
				markers: Object.freeze([
					Object.freeze({key: "frame-1", tick: 4, label: "frame 1", selected: false}),
					Object.freeze({key: "frame-2", tick: 10, label: "frame 2", selected: true}),
				]),
			}),
			Object.freeze({
				key: "boundary",
				label: "Boundary",
				markers: Object.freeze([
					Object.freeze({key: "frame-2", tick: 10, label: "frame 2", selected: true}),
				]),
			}),
		]),
	}),
})

describe("Bulk DOM HUD production proof", () => {
	test("composes exact public HudWindow and Timeline controllers into one stable root", () => {
		const controller = createBulkHudDocument(createDocument())
		const {root, window, fullscreenButton, timeline} = controller.refs

		expect(controller.element).toBe(root)
		expect(root).toBeInstanceOf(HTMLElement)
		expect(root.localName).toBe("section")
		expect(root.className).toBe("bulk-hud-document")
		expect(root.getAttribute("data-fullscreen")).toBe("false")
		expect(root.getAttribute("aria-label")).toBe("Bulk Visual")
		expect(root.childNodes).toEqual([window])
		expect(controller.controllers.window.element).toBe(window)
		expect(controller.controllers.timeline.element).toBe(timeline)
		expect(controller.controllers.window.refs.body.childNodes).toEqual([timeline])
		expect(fullscreenButton).toBe(controller.controllers.window.refs.actionButtons.get("fullscreen")!)
		expect(fullscreenButton.getAttribute("data-action-key")).toBe("fullscreen")
		expect(fullscreenButton.getAttribute("aria-pressed")).toBe("false")
		expect(fullscreenButton.textContent).toBe("Полный экран")
		expect(controller.controllers.timeline.props).toEqual(bulkHudDocumentDefaultProps.causalTimeline)
		expect(controller.props).toEqual(bulkHudDocumentDefaultProps)
	})

	test("updates fullscreen and causal snapshot without replacing composite identities", () => {
		const controller = createBulkHudDocument(createDocument(), controlledProps)
		const root = controller.element
		const window = controller.refs.window
		const timeline = controller.refs.timeline
		const fullscreenButton = controller.refs.fullscreenButton
		const forceTrack = controller.controllers.timeline.refs.trackElements.get("force")!
		const forceLabel = controller.controllers.timeline.refs.trackLabelTexts.get("force")!
		const frame2 = controller.controllers.timeline.refs.markerTimes.get("force/frame-2")!
		const frame2Text = controller.controllers.timeline.refs.markerTexts.get("force/frame-2")!

		controller.update({
			title: "Bulk Visual · Fullscreen",
			subtitle: "Causal snapshot",
			fullscreen: true,
			fullscreenDisabled: true,
			causalTimeline: {
				title: "Время · paused frontier",
				min: 0,
				max: 24,
				current: 16,
				playing: false,
				tracks: [
					{
						key: "boundary",
						label: "Boundary",
						markers: [{key: "frame-2", tick: 16, label: "frame 2", selected: true}],
					},
					{
						key: "force",
						label: "Force frontier",
						markers: [
							{key: "frame-2", tick: 16, label: "frame 2 · seq 16", selected: true},
							{key: "frame-1", tick: 4, label: "frame 1", selected: false},
						],
					},
				],
			},
		})

		expect(controller.element).toBe(root)
		expect(controller.refs.window).toBe(window)
		expect(controller.refs.timeline).toBe(timeline)
		expect(controller.refs.fullscreenButton).toBe(fullscreenButton)
		expect(controller.controllers.window.refs.actionButtons.get("fullscreen")).toBe(fullscreenButton)
		expect(controller.controllers.timeline.refs.trackElements.get("force")).toBe(forceTrack)
		expect(controller.controllers.timeline.refs.trackLabelTexts.get("force")).toBe(forceLabel)
		expect(controller.controllers.timeline.refs.markerTimes.get("force/frame-2")).toBe(frame2)
		expect(controller.controllers.timeline.refs.markerTexts.get("force/frame-2")).toBe(frame2Text)
		expect(root.getAttribute("data-fullscreen")).toBe("true")
		expect(root.className).toContain("--fullscreen")
		expect(fullscreenButton.getAttribute("aria-pressed")).toBe("true")
		expect(fullscreenButton.disabled).toBeTrue()
		expect(fullscreenButton.textContent).toBe("Выйти из полного экрана")
		expect(controller.controllers.timeline.refs.currentTime.getAttribute("datetime")).toBe("16")
		expect(controller.controllers.timeline.refs.currentText.data).toBe("Current 16")
		expect(forceLabel.data).toBe("Force frontier")
		expect(frame2.getAttribute("data-tick")).toBe("16")
		expect(frame2Text.data).toBe("frame 2 · seq 16")
	})

	test("keeps standard bubbling observable without changing controlled state", () => {
		const document = createDocument()
		const host = document.createElement("div")
		const controller = createBulkHudDocument(document, controlledProps)
		document.appendChild(host)
		host.appendChild(controller.element)
		const props = controller.props
		const events: string[] = []
		host.addEventListener("click", (event) => {
			events.push(`${event.type}:${(event.target as HTMLElement).localName}`)
		})
		host.addEventListener("pointerdown", (event) => {
			events.push(`${event.type}:${(event.target as HTMLElement).localName}`)
		})

		controller.refs.fullscreenButton.click()
		controller.controllers.timeline.refs.playButton.click()
		controller.controllers.timeline.refs.markerTimes.get("force/frame-2")!
			.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}))
		controller.controllers.timeline.refs.currentTime
			.dispatchEvent(new MouseEvent("click", {bubbles: true}))

		expect(events).toEqual(["click:button", "click:button", "pointerdown:time", "click:time"])
		expect(controller.props).toBe(props)
		expect(controller.props.fullscreen).toBeFalse()
		expect(controller.props.causalTimeline.playing).toBeFalse()
		expect(controller.refs.fullscreenButton.getAttribute("aria-pressed")).toBe("false")
	})

	test("validates the complete snapshot before child mutation and disposes in place", () => {
		const document = createDocument()
		const host = document.createElement("div")
		const controller = createBulkHudDocument(document, controlledProps)
		document.appendChild(host)
		host.appendChild(controller.element)
		const props = controller.props
		const title = controller.controllers.window.refs.titleText.data
		const current = controller.controllers.timeline.refs.currentTime.getAttribute("datetime")
		const tracks = [...controller.controllers.timeline.refs.tracksList.childNodes]

		expect(() => controller.update({
			...controller.props,
			fullscreen: true,
			causalTimeline: {...controller.props.causalTimeline, max: 0},
		})).toThrow("Bulk HUD causalTimeline max must be greater than min")
		expect(() => controller.update({
			...controller.props,
			causalTimeline: {
				...controller.props.causalTimeline,
				tracks: [
					{key: "same", label: "A", markers: []},
					{key: "same", label: "B", markers: []},
				],
			},
		})).toThrow("Bulk HUD causalTimeline track key must be unique: same")
		expect(() => controller.update({
			...controller.props,
			causalTimeline: {
				...controller.props.causalTimeline,
				tracks: [{
					key: "force",
					label: "Force",
					markers: [{key: "late", tick: 21, label: "Late", selected: false}],
				}],
			},
		})).toThrow("Bulk HUD causalTimeline marker is outside the range: force/late")

		expect(controller.props).toBe(props)
		expect(controller.refs.fullscreenButton.getAttribute("aria-pressed")).toBe("false")
		expect(controller.controllers.window.refs.titleText.data).toBe(title)
		expect(controller.controllers.timeline.refs.currentTime.getAttribute("datetime")).toBe(current)
		expect(controller.controllers.timeline.refs.tracksList.childNodes).toEqual(tracks)

		controller.dispose()
		controller.dispose()
		expect(controller.element.parentNode).toBe(host)
		expect(controller.refs.timeline.parentNode).toBe(controller.controllers.window.refs.body)
		expect(() => controller.update(props)).toThrow("BulkHudDocument controller is disposed")
		expect(() => controller.controllers.window.update(controller.controllers.window.props))
			.toThrow("HudWindow controller is disposed")
	})

	test("keeps an exact package-private DOM/UI boundary", async () => {
		const source = await Bun.file(new URL("./hud.ts", import.meta.url)).text()
		const visual = await Bun.file(new URL("../VISUAL.md", import.meta.url)).text()
		const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json() as {
			dependencies: Record<string, string>
			exports: Record<string, string>
		}

		expect(source).toContain('from "@zavx0z/dom"')
		expect(source).toContain('from "@ui/components/hud"')
		for (const forbidden of [
			'from "../hud.ts"',
			'from "../viewport',
			"@engine/core",
			"@layout/core",
			"@ui/elements",
			"@ui/hud",
			"@zavx0z/renderer",
			["@zavx0z", "storybook"].join("/"),
			"UiSurface",
			"dispatchEvent",
			"addEventListener",
			"onClick",
			"onChange",
			"Story",
			"source:",
		]) expect(source).not.toContain(forbidden)
		expect(bulkHudDocumentCss).toContain(".bulk-hud-document")
		expect(bulkHudDocumentCss).toContain(".ui-hud-window")
		expect(bulkHudDocumentCss).toContain(".ui-timeline")
		expect(bulkHudDocumentCss).not.toContain("&")
		expect(manifest.dependencies["@zavx0z/dom"]).toBe("link:@zavx0z/dom")
		expect(manifest.dependencies["@ui/components"]).toBe("link:@ui/components")
		expect(manifest.exports["./dom/hud"]).toBeUndefined()
		expect(Object.values(manifest.exports)).not.toContain("./dom/hud.ts")
		expect(visual).toContain("Production HUD собирает один semantic Document")
	})
})
