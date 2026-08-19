import {describe, expect, test} from "bun:test"
import {
  BLENDER_SOCKET_KINDS,
  BLENDER_SOCKET_PRESETS,
  BLENDER_SOCKET_SHAPES,
  blenderSocketPreset,
  createBlenderNodeRenderers,
  measureBlenderNode,
  type BlenderNode,
} from "./blender-node.ts"

describe("Blender-like Node presets", () => {
  test("publishes the complete first socket catalog and six shapes", () => {
    expect(BLENDER_SOCKET_KINDS).toHaveLength(19)
    expect(BLENDER_SOCKET_SHAPES).toEqual([
      "circle",
      "square",
      "diamond",
      "circle-dot",
      "square-dot",
      "diamond-dot",
    ])
    expect(Object.keys(BLENDER_SOCKET_PRESETS).sort()).toEqual([...BLENDER_SOCKET_KINDS].sort())
    expect(blenderSocketPreset("float").defaultFieldKind).toBe("number")
    expect(blenderSocketPreset("geometry").defaultFieldKind).toBeUndefined()
  })

  test("measures standalone properties and socket default fields through shared UI fields", () => {
    const node: BlenderNode = {
      id: "math",
      title: "Math",
      properties: [{
        id: "operation",
        label: "Operation",
        kind: "enum",
        value: "add",
        options: [{value: "add", label: "Add"}],
      }],
      sockets: [{
        id: "value",
        label: "Value",
        direction: "input",
        socketType: "float",
        field: {id: "value", label: "Value", kind: "number", value: 0.5, min: 0, max: 1},
      }],
    }
    const measured = measureBlenderNode(node)
    expect(measured.width).toBeGreaterThanOrEqual(190)
    expect(measured.height).toBeGreaterThan(100)
  })

  test("provides independent Node, Socket and Link renderers", () => {
    const renderers = createBlenderNodeRenderers()
    expect(typeof renderers.node.measure).toBe("function")
    expect(typeof renderers.node.renderBackground).toBe("function")
    expect(typeof renderers.node.renderForeground).toBe("function")
    expect(typeof renderers.socket.render).toBe("function")
    expect(typeof renderers.link.render).toBe("function")
  })
})
