import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {FIELD_KINDS} from "@ui/components/field"
import {createParameterStoryFixture} from "../fixtures/parameter-fixtures.ts"
import {
  NODE_PARAMETER_FIELD_KINDS,
  NODE_PARAMETER_VARIANTS,
  nodeParameterStoryRoute,
} from "../parameter-catalog.ts"
import {NODE_COMPONENT_STORIES} from "../ui-story-catalog.ts"

const storiesRoot = fileURLToPath(new URL(".", import.meta.url))
const uiPlaygroundRoot = fileURLToPath(new URL("..", import.meta.url))
const frame = Object.freeze({x: 80, y: 80, w: 360, h: 320})

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

  test("generates the complete Field kind by Parameter variant matrix", () => {
    expect(NODE_PARAMETER_FIELD_KINDS).toEqual([...FIELD_KINDS])
    expect(NODE_PARAMETER_VARIANTS).toEqual(["field", "input", "output", "both", "connected"])
    const routes = NODE_PARAMETER_FIELD_KINDS.flatMap((kind) =>
      NODE_PARAMETER_VARIANTS.map((variant) => nodeParameterStoryRoute(kind, variant)))
    expect(routes).toHaveLength(FIELD_KINDS.length * NODE_PARAMETER_VARIANTS.length)
    expect(new Set(routes).size).toBe(routes.length)
    expect(routes[0]).toBe("parameter/text/field")
    expect(routes.at(-1)).toBe("parameter/readonly/connected")
  })

  test("keeps one Parameter and Field identity across every variant of each Field kind", () => {
    for (const kind of NODE_PARAMETER_FIELD_KINDS) {
      const field = createParameterStoryFixture(kind, "field", frame)
      const input = createParameterStoryFixture(kind, "input", frame)
      const output = createParameterStoryFixture(kind, "output", frame)
      const both = createParameterStoryFixture(kind, "both", frame)
      const connected = createParameterStoryFixture(kind, "connected", frame)

      for (const fixture of [input, output, both, connected]) {
        expect(fixture.entry.parameter, `${kind} Parameter`).toBe(field.entry.parameter)
        expect(fixture.entry.parameter.field, `${kind} Field`).toBe(field.entry.parameter.field)
        expect(fixture.entry.parameter.field.kind).toBe(kind)
        expect(fixture.sockets.every(({socket}) => socket.parameterId === field.entry.parameter.id)).toBeTrue()
      }
      expect(field.sockets).toHaveLength(0)
      expect(input.sockets.map(({socket, side}) => [socket.direction, side])).toEqual([["input", "left"]])
      expect(output.sockets.map(({socket, side}) => [socket.direction, side])).toEqual([["output", "right"]])
      expect(both.sockets.map(({socket, side}) => [socket.direction, side])).toEqual([
        ["input", "left"],
        ["output", "right"],
      ])
      expect(new Set(both.sockets.map(({socket}) => socket.id)).size).toBe(2)
    }
  })

  test("derives connected presentation from one exact Link for every Field kind", () => {
    for (const kind of NODE_PARAMETER_FIELD_KINDS) {
      const input = createParameterStoryFixture(kind, "input", frame)
      const connected = createParameterStoryFixture(kind, "connected", frame)

      expect(connected.entry.parameter).toBe(input.entry.parameter)
      expect(input.links).toHaveLength(0)
      expect(connected.links).toHaveLength(1)
      expect(connected.links[0]!.link.to).toEqual({
        nodeId: connected.nodeId,
        socketId: connected.sockets[0]!.socket.id,
      })
      expect(input.entry.editorVisible).toBeTrue()
      expect(connected.entry.editorVisible).toBeFalse()
      if (connected.entry.separateLabel) expect(connected.entry.editorRect.h).toBe(0)
      else expect(connected.entry.editorRect).toEqual(connected.entry.rect)
      expect(connected.entry.labelRect.h).toBeGreaterThan(0)
    }
  })

  test("publishes exact source for all sixty-five Parameter leaves", async () => {
    for (const kind of NODE_PARAMETER_FIELD_KINDS) {
      for (const variant of NODE_PARAMETER_VARIANTS) {
        const route = nodeParameterStoryRoute(kind, variant)
        const story = await NODE_COMPONENT_STORIES.load(route)
        expect(story.defaultArgs).toEqual({kind, variant})
        const source = story.source(story.defaultArgs)
        expect(source, route).toContain('type ParameterPlan} from "@nodes/ui/parameter"')
        expect(source, route).toContain("blenderParameterRenderer.render")
        expect(source, route).toContain('nodeId: "parameter-story"')
      }
    }
  })
})
