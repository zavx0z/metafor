import {describe, expect, test} from "bun:test"
import {createDocument, type HTMLElement} from "@zavx0z/dom"
import {
  createBulkHudController,
  type BulkFullscreenHost,
} from "./hud-controller.ts"

describe("Bulk DOM HUD controller", () => {
  test("binds standard HUD buttons to causal transport without replacing identities", async () => {
    const document = createDocument()
    const host = document.createElement("div")
    document.appendChild(host)
    const calls: string[] = []
    let stack: unknown = []
    const controller = createBulkHudController({
      document,
      parent: host,
      transport: {
        async stack() {
          calls.push("stack")
          return stack
        },
        async pause() {
          calls.push("pause")
          stack = [
            {id: 1, frontier: {acceptanceSequence: 4}, resolution: "exact"},
            {id: 2, frontier: {acceptanceSequence: 16}, resolution: "degraded"},
          ]
        },
        async resume() {
          calls.push("resume")
          stack = []
        },
      },
    })
    const root = controller.element
    const timeline = controller.presentation.refs.timeline
    const playButton = controller.presentation.controllers.timeline.refs.playButton
    const firstTrack = controller.presentation.controllers.timeline.refs.trackElements

    await controller.ready
    expect(controller.element).toBe(root)
    expect(controller.presentation.refs.timeline).toBe(timeline)
    expect(controller.presentation.controllers.timeline.refs.trackElements).toBe(firstTrack)
    expect(root.parentNode).toBe(host)
    expect(controller.time.state).toBe("open")
    expect(playButton.disabled).toBeFalse()
    expect(playButton.getAttribute("aria-pressed")).toBe("true")
    expect(controller.presentation.controllers.window.refs.subtitleText.data)
      .toBe("Пауза создаёт первый keyframe")

    const bubbled: string[] = []
    host.addEventListener("click", (event) => {
      bubbled.push((event.target as HTMLElement).localName)
    })
    playButton.click()
    await eventually(() => controller.time.state === "paused")

    expect(calls).toEqual(["stack", "pause", "stack"])
    expect(bubbled).toEqual(["button"])
    expect(controller.presentation.refs.timeline).toBe(timeline)
    expect(controller.presentation.controllers.timeline.refs.trackElements.get("force")).toBeDefined()
    expect(controller.presentation.controllers.timeline.refs.markerTimes.get("force/frame-2")
      ?.getAttribute("data-tick")).toBe("16")
    expect(controller.presentation.controllers.timeline.refs.markerItems.get("force/frame-1")
      ?.getAttribute("data-resolution")).toBe("exact")
    expect(controller.presentation.controllers.timeline.refs.markerItems.get("force/frame-2")
      ?.getAttribute("data-resolution")).toBe("degraded")
    expect(playButton.getAttribute("aria-pressed")).toBe("false")

    controller.presentation.controllers.timeline.refs.previousButton.click()
    expect(controller.time.playhead).toBe(0)
    expect(controller.presentation.controllers.timeline.refs.markerItems.get("force/frame-1")
      ?.getAttribute("aria-current")).toBe("true")

    playButton.click()
    await eventually(() => controller.time.state === "open")
    expect(calls).toEqual(["stack", "pause", "stack", "resume"])
    expect(controller.time.frames).toEqual([])

    controller.dispose()
    expect(root.parentNode).toBeNull()
    expect(() => controller.time.setPlayhead(0.5)).toThrow("disposed")
  })

  test("mirrors one controlled fullscreen host through the native click path", async () => {
    const document = createDocument()
    let active = false
    const listeners = new Set<() => void>()
    const fullscreen: BulkFullscreenHost = {
      active: () => active,
      async toggle() {
        active = !active
        for (const listener of listeners) listener()
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const controller = createBulkHudController({
      document,
      fullscreen,
      transport: {
        async stack() { return [] },
        async pause() {},
        async resume() {},
      },
    })
    await controller.ready
    const button = controller.presentation.refs.fullscreenButton

    expect(button.getAttribute("aria-pressed")).toBe("false")
    button.click()
    await eventually(() => button.getAttribute("aria-pressed") === "true")
    expect(controller.element.getAttribute("data-fullscreen")).toBe("true")
    expect(button.textContent).toBe("Выйти из полного экрана")

    controller.dispose()
    expect(listeners.size).toBe(0)
  })

  test("keeps the production controller on exact DOM owners", async () => {
    const source = await Bun.file(new URL("./hud-controller.ts", import.meta.url)).text()
    const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json() as {
      dependencies: Record<string, string>
    }

    expect(source).toContain('from "./hud.ts"')
    expect(source).toContain('from "./causal-time.ts"')
    expect(source).toContain('addEventListener("click"')
    for (const forbidden of [
      "@layout/core",
      "@ui/elements",
      "@ui/hud",
      "UiSurface",
      "dispatchEvent",
    ]) expect(source).not.toContain(forbidden)
    expect(manifest.dependencies).toMatchObject({
      "@ui/components": "link:@ui/components",
      "@zavx0z/dom": "link:@zavx0z/dom",
      "@zavx0z/renderer": "link:@zavx0z/renderer",
      "@zavx0z/renderer-webgpu": "link:@zavx0z/renderer-webgpu",
    })
    expect(manifest.dependencies["@layout/core"]).toBeUndefined()
    expect(manifest.dependencies["@ui/elements"]).toBeUndefined()
    expect(manifest.dependencies["@ui/hud"]).toBeUndefined()
  })
})

async function eventually(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("Expected asynchronous HUD state was not reached")
}
