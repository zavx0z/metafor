import {describe, expect, test} from "bun:test"
import {
  BLENDER_SOCKET_KINDS,
  BLENDER_SOCKET_PRESETS,
  BLENDER_SOCKET_SHAPES,
  blenderSocketPreset,
  createBlenderNodeRenderers,
  measureBlenderNode,
  planBlenderNode,
  type BlenderNode,
} from "./blender-node.ts"

describe("Blender-like Node presets", () => {
  test("publishes the complete first socket catalog and eight source shapes", () => {
    expect(BLENDER_SOCKET_KINDS).toHaveLength(19)
    expect(BLENDER_SOCKET_SHAPES).toEqual([
      "circle",
      "square",
      "diamond",
      "circle-dot",
      "square-dot",
      "diamond-dot",
      "line",
      "volume-grid",
    ])
    expect(Object.keys(BLENDER_SOCKET_PRESETS).sort()).toEqual([...BLENDER_SOCKET_KINDS].sort())
    expect(blenderSocketPreset("float").defaultFieldKind).toBe("number")
    expect(blenderSocketPreset("geometry").defaultFieldKind).toBeUndefined()
  })

  test("measures standalone Properties and Parameter Fields through shared UI fields", () => {
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
      parameters: [{
        id: "value",
        label: "Value",
        field: {id: "value", label: "Value", kind: "number", value: 0.5, min: 0, max: 1},
      }],
      sockets: [{
        id: "value",
        label: "Value",
        direction: "input",
        socketType: "float",
        parameterId: "value",
        side: "left",
      }],
    }
    const measured = measureBlenderNode(node)
    expect(measured.width).toBeGreaterThanOrEqual(180)
    expect(measured.height).toBeGreaterThan(80)
  })

  test("provides independent Node, Socket and Link renderers", () => {
    const renderers = createBlenderNodeRenderers()
    expect(typeof renderers.frame.renderBackground).toBe("function")
    expect(typeof renderers.frame.renderForeground).toBe("function")
    expect(typeof renderers.node.measure).toBe("function")
    expect(typeof renderers.node.plan).toBe("function")
    expect(typeof renderers.node.render).toBe("function")
    expect("renderBackground" in renderers.node).toBeFalse()
    expect("renderForeground" in renderers.node).toBeFalse()
    expect(typeof renderers.socket.render).toBe("function")
    expect(typeof renderers.link.render).toBe("function")
  })

  test("places loose right sockets above properties and loose left sockets below parameters", () => {
    const node: BlenderNode = {
      id: "ordered",
      title: "Ordered",
      properties: [{id: "mode", label: "Mode", kind: "enum", value: "a", options: [{value: "a", label: "A"}]}],
      parameters: [{id: "value", label: "Value", field: {id: "value", label: "Value", kind: "number", value: 1}}],
      sockets: [
        {id: "input", label: "Input", direction: "output", socketType: "float", side: "left"},
        {id: "output", label: "Output", direction: "input", socketType: "float", side: "right"},
      ],
    }
    const plan = planBlenderNode(node, {x: 20, y: 30, w: 240, h: measureBlenderNode(node).height})
    const property = plan.fields.find(({field}) => field.id === "mode")!.rect
    const parameter = plan.fields.find(({field}) => field.id === "value")!.rect
    const output = plan.sockets.find(({socket}) => socket.id === "output")!
    const input = plan.sockets.find(({socket}) => socket.id === "input")!
    expect(output.center.y).toBeLessThan(property.y)
    expect(input.center.y).toBeGreaterThan(parameter.y + parameter.h)
    expect(output.side).toBe("right")
    expect(input.side).toBe("left")
  })
})
