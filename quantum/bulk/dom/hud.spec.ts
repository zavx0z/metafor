import {describe, expect, test} from "bun:test"
import {
  createDocument,
  HTMLElement,
} from "@zavx0z/dom"
import {
  buildBulkCausalTimePresentation,
  readBulkTimeFrames,
} from "./causal-time.ts"
import {
  createBulkHudDocument,
  bulkHudDocumentDefaultProps,
  type BulkHudDocumentProps,
} from "./hud.tsx"

const controlledFrames = readBulkTimeFrames([
  {id: 1, frontier: {acceptanceSequence: 4}, resolution: "exact"},
  {id: 2, frontier: {acceptanceSequence: 10}, resolution: "degraded"},
])

const controlledProps: BulkHudDocumentProps = Object.freeze({
  title: "Bulk Visual",
  subtitle: "Causal projection",
  fullscreen: false,
  fullscreenDisabled: false,
  causalTime: buildBulkCausalTimePresentation(controlledFrames, 1, "paused"),
})

describe("Bulk DOM HUD production proof", () => {
  test("composes exact Timeline and Button owners inside separate Bulk causal controllers", () => {
    const controller = createBulkHudDocument(createDocument())
    const {root, window, fullscreenButton, timeline, playback, channels} = controller.refs

    expect(controller.element).toBe(root)
    expect(root).toBeInstanceOf(HTMLElement)
    expect(root.localName).toBe("section")
    expect(root.className).toBe("")
    expect(root.getAttribute("data-bulk-hud")).toBe("")
    expect(root.getAttribute("data-fullscreen")).toBe("false")
    expect(root.getAttribute("aria-label")).toBe("Bulk Visual")
    expect([...root.children]).toEqual([window])
    expect(controller.controllers.window.element).toBe(window)
    expect(controller.controllers.timeline.element).toBe(timeline)
    expect(controller.controllers.playback.element).toBe(playback)
    expect(controller.controllers.channels.element).toBe(channels)
    expect(fullscreenButton).toBe(controller.controllers.window.refs.actionButtons.get("fullscreen")!)
    expect(fullscreenButton.getAttribute("data-action-key")).toBe("fullscreen")
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("false")
    expect(fullscreenButton.textContent).toBe("Полный экран")
    expect(playback.parentElement).toBe(timeline.parentElement)
    expect(channels.parentElement).toBe(timeline.parentElement)
    expect(timeline.querySelector('[aria-label="Timeline transport"]')).toBeNull()
    expect(timeline.querySelector('[aria-label="Timeline tracks"]')).toBeNull()
    expect(timeline.querySelector('[aria-label="Summary keyframes"]')).not.toBeNull()
    expect(timeline.querySelector('[aria-label="Timeline markers"]')).not.toBeNull()
    expect(controller.controllers.timeline.props).toEqual(bulkHudDocumentDefaultProps.causalTime.timeline)
    expect(controller.props).toEqual(bulkHudDocumentDefaultProps)

    const cssText = controller.componentRoot.readStyleSheets().styleSheets
      .map(({cssText}) => cssText).join("\n")
    expect(cssText).toContain("bottom:8px")
    expect(cssText).toContain("min-height:280px")
    expect(cssText).toContain("border-top:var(--border-width-control) solid var(--widget-regular-outline)")
    expect(cssText).toContain("--material-editor-outline-active:var(--widget-regular-background-selected)")
  })

  test("updates one neutral Timeline and separate causal channels without replacing identities", () => {
    const controller = createBulkHudDocument(createDocument(), controlledProps)
    const root = controller.element
    const window = controller.refs.window
    const timeline = controller.refs.timeline
    const playback = controller.refs.playback
    const channels = controller.refs.channels
    const fullscreenButton = controller.refs.fullscreenButton
    const forceChannel = controller.controllers.channels.refs.channelElements.get("force")!
    const frame2Keyframe = controller.controllers.timeline.refs.keyframeItems.get("frame-2")!
    const frame2Point = controller.controllers.channels.refs.pointItems.get("force/frame-2")!
    const nextFrames = readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 4}, resolution: "exact"},
      {id: 2, frontier: {acceptanceSequence: 16}, resolution: "overloaded"},
    ])

    controller.update({
      title: "Bulk Visual · Fullscreen",
      subtitle: "Causal snapshot",
      fullscreen: true,
      fullscreenDisabled: true,
      causalTime: buildBulkCausalTimePresentation(nextFrames, 1, "paused"),
    })

    expect(controller.element).toBe(root)
    expect(controller.refs.window).toBe(window)
    expect(controller.refs.timeline).toBe(timeline)
    expect(controller.refs.playback).toBe(playback)
    expect(controller.refs.channels).toBe(channels)
    expect(controller.refs.fullscreenButton).toBe(fullscreenButton)
    expect(controller.controllers.channels.refs.channelElements.get("force")).toBe(forceChannel)
    expect(controller.controllers.timeline.refs.keyframeItems.get("frame-2")).toBe(frame2Keyframe)
    expect(controller.controllers.channels.refs.pointItems.get("force/frame-2")).toBe(frame2Point)
    expect(root.getAttribute("data-fullscreen")).toBe("true")
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("true")
    expect(fullscreenButton.disabled).toBeTrue()
    expect(fullscreenButton.textContent).toBe("Выйти из полного экрана")
    expect(controller.controllers.timeline.refs.currentOutput.getAttribute("aria-label"))
      .toBe("Current frame 16")
    expect(controller.controllers.timeline.refs.currentText.data).toBe("16")
    expect(frame2Keyframe.getAttribute("data-frame")).toBe("16")
    expect(frame2Point.getAttribute("data-frame")).toBe("16")
    expect(frame2Point.getAttribute("data-resolution")).toBe("overloaded")
    expect(controller.controllers.playback.refs.toggleButton.textContent).toBe("Продолжить")
  })

  test("keeps ordinary bubbling intent without changing controlled presentation state", () => {
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

    controller.refs.fullscreenButton.click()
    controller.controllers.playback.refs.toggleButton.click()
    controller.controllers.timeline.refs.keyframeButtons.get("frame-1")!.click()
    controller.controllers.channels.refs.pointButtons.get("force/frame-2")!.click()

    expect(events).toEqual([
      "click:button",
      "click:button",
      "click:button",
      "click:button",
    ])
    expect(controller.props).toBe(props)
    expect(controller.props.fullscreen).toBeFalse()
    expect(controller.props.causalTime.playback.playing).toBeFalse()
  })

  test("validates the complete coordinated snapshot before mutation and disposes in place", () => {
    const document = createDocument()
    const host = document.createElement("div")
    const controller = createBulkHudDocument(document, controlledProps)
    document.appendChild(host)
    host.appendChild(controller.element)
    const props = controller.props
    const current = controller.controllers.timeline.refs.currentOutput.getAttribute("aria-label")
    const channels = [...controller.controllers.channels.refs.channelsList.childNodes]

    expect(() => controller.update({
      ...controller.props,
      causalTime: {
        ...controller.props.causalTime,
        timeline: {...controller.props.causalTime.timeline, frameEnd: 0},
      },
    })).toThrow("frameEnd must be greater than frameStart")
    expect(() => controller.update({
      ...controller.props,
      causalTime: {
        ...controller.props.causalTime,
        channels: {
          ...controller.props.causalTime.channels,
          channels: [
            controller.props.causalTime.channels.channels[0]!,
            controller.props.causalTime.channels.channels[0]!,
          ],
        },
      },
    })).toThrow("Bulk HUD causal channel key must be unique: force")
    const force = controller.props.causalTime.channels.channels[0]!
    expect(() => controller.update({
      ...controller.props,
      causalTime: {
        ...controller.props.causalTime,
        channels: {
          ...controller.props.causalTime.channels,
          channels: [{
            ...force,
            points: [{...force.points[0]!, frame: 5}, force.points[1]!],
          }],
        },
      },
    })).toThrow("diverges from the summary timeline")

    expect(controller.props).toBe(props)
    expect(controller.controllers.timeline.refs.currentOutput.getAttribute("aria-label")).toBe(current)
    expect(controller.controllers.channels.refs.channelsList.childNodes).toEqual(channels)

    controller.dispose()
    controller.dispose()
    expect(controller.element.parentNode).toBe(host)
    expect(() => controller.update(props)).toThrow("BulkHudDocument controller is disposed")
  })

  test("keeps an exact package-private DOM/UI boundary without Timeline compatibility transport", async () => {
    const source = await Bun.file(new URL("./hud.tsx", import.meta.url)).text()
    const controller = await Bun.file(new URL("./hud-controller.ts", import.meta.url)).text()
    const overlay = await Bun.file(new URL("./overlay-runtime.ts", import.meta.url)).text()
    const visual = await Bun.file(new URL("../VISUAL.md", import.meta.url)).text()
    const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json() as {
      dependencies: Record<string, string>
      exports: Record<string, string>
    }

    expect(source).toContain('from "@zavx0z/dom"')
    expect(source).toContain('from "@ui/components/button"')
    expect(source).toContain('from "@ui/components/hud"')
    expect(source).toContain("function BulkPlayback")
    expect(source).toContain("function BulkCausalChannels")
    expect(source).toContain("frameStart={timeline.frameStart}")
    expect(source).toContain("keyframes={timeline.keyframes}")
    expect(source).toContain("markers={timeline.markers}")
    for (const forbidden of [
      "TimelineTrack",
      "Timeline transport",
      "Timeline tracks",
      "min={timeline",
      "max={timeline",
      "current={timeline",
      "tracks={timeline",
      "@engine/core",
      "@layout/core",
      "@ui/elements",
      "@ui/hud",
      "@zavx0z/renderer",
      "addEventListener",
      "onClick",
      "onChange",
    ]) expect(source).not.toContain(forbidden)
    expect(controller).toContain('addEventListener("click"')
    expect(controller).toContain("controllers.playback.refs")
    expect(controller).toContain("time.selectFrame(id)")
    expect(source).toContain('data-bulk-causal-channels=""')
    expect(source).toContain('data-bulk-causal-time=""')
    expect(source).not.toContain("bulkHudDocumentCss")
    expect(source).not.toContain("String.raw")
    expect(overlay).not.toContain("styleSheets")
    expect(manifest.dependencies["@zavx0z/dom"]).toBe("link:@zavx0z/dom")
    expect(manifest.dependencies["@ui/components"]).toBe("link:@ui/components")
    expect(manifest.exports["./dom/hud"]).toBeUndefined()
    expect(Object.values(manifest.exports)).not.toContain("./dom/hud.ts")
    expect(visual).toContain("Production Bulk Experience содержит один semantic Document")
  })
})
