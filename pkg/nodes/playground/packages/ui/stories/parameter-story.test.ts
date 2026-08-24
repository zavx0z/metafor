import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {createParameterStoryFixture} from "../fixtures/parameter-fixtures.ts"
import {NODE_COMPONENT_STORIES, type NodeParameterStoryRoute} from "../ui-story-catalog.ts"

const storiesRoot = fileURLToPath(new URL(".", import.meta.url))
const uiPlaygroundRoot = fileURLToPath(new URL("..", import.meta.url))
const frame = Object.freeze({x: 80, y: 80, w: 360, h: 128})

const PARAMETER_STORY_ROUTES = Object.freeze([
  "parameter/composition/field",
  "parameter/composition/left",
  "parameter/composition/right",
  "parameter/composition/both",
  "parameter/connection/unconnected",
  "parameter/connection/connected",
] as const satisfies readonly NodeParameterStoryRoute[])

describe("Node Parameter package-owned story boundary", () => {
  test("loads the production Parameter renderer only through the lazy story module", async () => {
    const metadata = await Bun.file(join(uiPlaygroundRoot, "ui-story-catalog.ts")).text()
    const story = await Bun.file(join(storiesRoot, "parameter.ts")).text()
    expect(metadata).toContain('import("./stories/parameter.ts")')
    expect(metadata).not.toContain('from "@nodes/ui/parameter"')
    expect(story).toContain('from "@nodes/ui/parameter"')
    expect(story).toContain("blenderParameterRenderer.render")
    expect(story).not.toContain('from "../../../ui/parameter.ts"')
  })

  test("keeps one Parameter and Field identity across every Socket composition", () => {
    const field = createParameterStoryFixture("field", frame)
    const left = createParameterStoryFixture("left", frame)
    const right = createParameterStoryFixture("right", frame)
    const both = createParameterStoryFixture("both", frame)

    expect(left.entry.parameter).toBe(field.entry.parameter)
    expect(right.entry.parameter.field).toBe(field.entry.parameter.field)
    expect(both.entry.parameter).toBe(field.entry.parameter)
    expect(field.sockets).toHaveLength(0)
    expect(left.sockets.map(({side}) => side)).toEqual(["left"])
    expect(right.sockets.map(({side}) => side)).toEqual(["right"])
    expect(both.sockets.map(({side}) => side)).toEqual(["left", "right"])
    expect(new Set(both.sockets.map(({socket}) => socket.id)).size).toBe(2)
    expect(both.sockets.every(({socket}) => socket.parameterId === field.entry.parameter.id)).toBeTrue()
  })

  test("derives connected presentation from an exact Link without changing Parameter identity", () => {
    const unconnected = createParameterStoryFixture("unconnected", frame)
    const connected = createParameterStoryFixture("connected", frame)

    expect(connected.entry.parameter).toBe(unconnected.entry.parameter)
    expect(unconnected.links).toHaveLength(0)
    expect(connected.links).toHaveLength(1)
    expect(connected.links[0]!.link.to).toEqual({
      nodeId: connected.nodeId,
      socketId: connected.sockets[0]!.socket.id,
    })
    expect(unconnected.entry.editorVisible).toBeTrue()
    expect(connected.entry.editorVisible).toBeFalse()
    expect(connected.entry.editorRect.h).toBe(0)
    expect(connected.entry.rect.h).toBeGreaterThan(0)
  })

  test("publishes exact source for all Parameter leaves", async () => {
    for (const route of PARAMETER_STORY_ROUTES) {
      const story = await NODE_COMPONENT_STORIES.load(route)
      const source = story.source(story.defaultArgs)
      expect(source, route).toContain('type ParameterPlan} from "@nodes/ui/parameter"')
      expect(source, route).toContain("blenderParameterRenderer.render")
      expect(source, route).toContain('nodeId: "parameter-story"')
    }
  })
})
