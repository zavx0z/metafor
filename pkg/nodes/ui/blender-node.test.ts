import {beforeAll, describe, expect, test} from "bun:test"
import {CachedText, Object3D, TrueTypeFont, Vector3, type Color} from "@metafor/engine"
import {UiSurface, Z, createUiPolylineStrokeGeometry, uiIcons} from "@ui/elements"
import {
  BLENDER_SOCKET_KINDS,
  BLENDER_SOCKET_PRESETS,
  BLENDER_SOCKET_SHAPES,
  BLENDER_SOCKET_VISUAL_POLICY,
  blenderNodeRenderer,
  blenderSocketPreset,
  blenderSocketRenderer,
  blenderSocketVisualBounds,
  createBlenderNodeRenderers,
  measureBlenderNode,
  planBlenderNode,
  positionBlenderNode,
  type BlenderNode,
  type BlenderSocket,
  type BlenderSocketShape,
} from "./blender-node.ts"
import {blenderParameterRenderer} from "./parameter.ts"

type PaintCall =
  | Readonly<{kind: "rect"; x: number; y: number; w: number; h: number}>
  | Readonly<{kind: "line"; x1: number; y1: number; x2: number; y2: number; width: number}>
  | Readonly<{kind: "polyline"; points: readonly Readonly<{x: number; y: number}>[]; width: number}>

const HEADER_PIXEL_SCALE = 0.001
let projectFont: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  projectFont = new TrueTypeFont(bytes)
})

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
    expect(blenderSocketPreset("integer").defaultFieldKind).toBe("integer")
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
    expect(measured.width).toBe(140)
    expect(measured.height).toBeGreaterThan(80)
  })

  test("provides independent Node, Parameter, Socket and Link renderers", () => {
    const renderers = createBlenderNodeRenderers()
    expect(typeof renderers.frame.renderBackground).toBe("function")
    expect(typeof renderers.frame.renderForeground).toBe("function")
    expect(typeof renderers.node.measure).toBe("function")
    expect(typeof renderers.node.plan).toBe("function")
    expect(typeof renderers.node.presentation).toBe("function")
    expect(typeof renderers.node.render).toBe("function")
    expect("renderBackground" in renderers.node).toBeFalse()
    expect("renderForeground" in renderers.node).toBeFalse()
    expect(renderers.parameter).toBe(blenderParameterRenderer)
    expect(typeof renderers.parameter.render).toBe("function")
    expect(typeof renderers.socket.render).toBe("function")
    expect(typeof renderers.link.render).toBe("function")
  })

  test("delegates one public Parameter exactly once even when it owns two Sockets", () => {
    const node: BlenderNode = {
      id: "parameter-owner",
      title: "Parameter owner",
      parameters: [{
        id: "gain",
        label: "Gain",
        field: {id: "gain-field", label: "Gain", kind: "number", value: 0.5},
      }],
      sockets: [
        {id: "gain-input", label: "Gain", direction: "input", socketType: "float", parameterId: "gain", side: "left"},
        {id: "gain-output", label: "Gain", direction: "output", socketType: "float", parameterId: "gain", side: "right"},
      ],
    }
    const entry = positionBlenderNode(node, {x: 20, y: 30, w: 180, h: measureBlenderNode(node).height})
    const plan = blenderNodeRenderer.plan({entry, connectedSocketIds: new Set(), selected: false})
    const calls: Array<Readonly<{nodeId: string; parameterId: string}>> = []
    const surface = new RetainedHeaderSurface()
    try {
      surface.setRect({x: 0, y: 0, w: 240, h: 180}, HEADER_PIXEL_SCALE, projectFont)
      const parent = surface.createParent()
      surface.materialize(parent, () => blenderNodeRenderer.render({
        parameterRenderer: {render({nodeId, entry: parameter}) {
          calls.push({nodeId, parameterId: parameter.parameter.id})
        }},
        host: surface,
        entry,
        plan,
        connectedSocketIds: new Set(),
        selected: false,
      }))
      expect(calls).toEqual([{nodeId: "parameter-owner", parameterId: "gain"}])
      expect(plan.parameters).toHaveLength(1)
      expect(plan.sockets).toHaveLength(2)
    } finally {
      surface.dispose()
    }
  })

  test("renders canonical INT through public Field without a local Node control", async () => {
    const surface = new RetainedHeaderSurface()
    try {
      surface.setRect({x: 0, y: 0, w: 240, h: 120}, HEADER_PIXEL_SCALE, projectFont)
      const parent = surface.createParent()
      const node: BlenderNode = {
        id: "integer-node",
        title: "Integer owner",
        parameters: [{
          id: "iterations",
          label: "Iterations",
          field: {id: "iterations", label: "Iterations", kind: "integer", value: 3, min: 0, max: 100},
        }],
        sockets: [{
          id: "iterations",
          label: "Iterations",
          direction: "input",
          socketType: "integer",
          parameterId: "iterations",
          side: "left",
        }],
      }
      const rect = {x: 20, y: 30, w: 180, h: measureBlenderNode(node).height}
      const entry = positionBlenderNode(node, rect)
      const plan = blenderNodeRenderer.plan({entry, connectedSocketIds: new Set(), selected: false})
      surface.materialize(parent, () => blenderNodeRenderer.render({
        parameterRenderer: blenderParameterRenderer,
        host: surface,
        entry,
        plan,
        connectedSocketIds: new Set(),
        selected: false,
      }))
      expect(cachedTextValues(parent)).toEqual(expect.arrayContaining(["Iterations", "3"]))
      const source = await Bun.file(new URL("./blender-node.ts", import.meta.url)).text()
      expect(source).not.toContain("IntegerInput(")
    } finally {
      surface.dispose()
    }
  })

  test("uses one intrinsic symmetric shadow as the Node selection carrier", () => {
    const states = [
      paintedNodeShadow(false, false),
      paintedNodeShadow(false, true),
      paintedNodeShadow(true, false),
      paintedNodeShadow(true, true),
    ]

    for (const state of states) {
      const shadows = state.calls.filter((call) => call.kind === "shadow")
      const rects = state.calls.filter((call) => call.kind === "rect")
      expect(shadows).toHaveLength(1)
      expect(state.calls[0]).toBe(shadows[0])
      expect(shadows[0]).toEqual({
        kind: "shadow",
        ...state.rect,
        options: {
          radius: 6,
          blur: 12,
          spread: 0,
          color: state.selected ? [0.22, 0.48, 0.74, 0.8] : [0, 0, 0, 1],
          opacity: 0.5,
          z: Z.ELEMENT - 0.02,
        },
      })
      expect("scale" in shadows[0]!.options).toBeFalse()

      const body = rects[0]!
      expect({x: body.x, y: body.y, w: body.w, h: body.h}).toEqual(state.rect)
      expect(body.options.border).toEqual([0.075, 0.075, 0.075, 1])
      expect(body.options.borderWidth).toBe(1)
      expect(rects.some((call) =>
        call.x === state.rect.x + 3
        && call.y === state.rect.y + 5
        && call.w === state.rect.w
        && call.h === state.rect.h)).toBeFalse()

      for (const parentScale of [0.16, 0.5, 1, 2]) {
        expect(shadows[0]!.options.blur * parentScale).toBeCloseTo(12 * parentScale)
      }
    }

    for (const collapsed of [false, true]) {
      const ordinary = states.find((state) => state.collapsed === collapsed && !state.selected)!
      const selected = states.find((state) => state.collapsed === collapsed && state.selected)!
      const ordinaryBody = ordinary.calls.find((call) => call.kind === "rect")!
      const selectedBody = selected.calls.find((call) => call.kind === "rect")!
      expect(selectedBody.options.border).toEqual(ordinaryBody.options.border)
      expect(selectedBody.options.borderWidth).toBe(ordinaryBody.options.borderWidth)
    }
  })

  test("draws one intrinsic geometric chevron and shared title slot in both header states", () => {
    const expanded = paintedNodeHeader(false)
    const collapsed = paintedNodeHeader(true)

    expect(expanded.header).toEqual({x: 20, y: 30, w: 180, h: 24, radius: 6})
    expect(collapsed.header).toEqual(expanded.header)
    expect(expanded.chevron.width).toBe(1.5)
    expect(expanded.chevron.points.map(({x}) => x)).toEqual([30, 34, 38])
    expect(expanded.chevron.points[0]!.y).toBeCloseTo(39.133968)
    expect(expanded.chevron.points[1]!.y).toBeCloseTo(44.133968)
    expect(expanded.chevron.points[2]!.y).toBeCloseTo(39.133968)
    expect(collapsed.chevron.width).toBe(1.5)
    expect(collapsed.chevron.points.map(({y}) => y)).toEqual([38, 42, 46])
    expect(collapsed.chevron.points[0]!.x).toBeCloseTo(31.133968)
    expect(collapsed.chevron.points[1]!.x).toBeCloseTo(36.133968)
    expect(collapsed.chevron.points[2]!.x).toBeCloseTo(31.133968)
    expect(expanded.title).toEqual({value: "Mapping", x: 44, y: 36.5, fontPx: 11, maxWidthPx: 150})
    expect(collapsed.title).toEqual(expanded.title)

    for (const result of [expanded, collapsed]) {
      const xs = result.chevron.points.map(({x}) => x)
      const ys = result.chevron.points.map(({y}) => y)
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(30)
      expect(Math.max(...xs)).toBeLessThanOrEqual(38)
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(38)
      expect(Math.max(...ys)).toBeLessThanOrEqual(46)
      expect(result.title.y + result.title.fontPx / 2).toBe(42)
      const pathEnvelope = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      )
      for (const parentScale of [0.16, 0.5, 1, 2]) {
        expect(pathEnvelope * parentScale).toBeCloseTo(8 * parentScale)
        expect(result.chevron.width * parentScale).toBeCloseTo(1.5 * parentScale)
      }
    }

    const expandedStroke = paintedPolylineBounds(expanded.chevron.points, expanded.chevron.width)
    const collapsedStroke = paintedPolylineBounds(collapsed.chevron.points, collapsed.chevron.width)
    expect(expandedStroke.centerX).toBeCloseTo(34)
    expect(expandedStroke.centerY).toBeCloseTo(42)
    expect(collapsedStroke.centerX).toBeCloseTo(34)
    expect(collapsedStroke.centerY).toBeCloseTo(42)
    expect(expandedStroke.w).toBeCloseTo(collapsedStroke.h)
    expect(expandedStroke.h).toBeCloseTo(collapsedStroke.w)
  })

  test("centers actual project-font title bounds with the chevron through retained scale", () => {
    for (const label of ["Mapping", "Noise Texture", "gy"]) {
      for (const collapsed of [false, true]) {
        const surface = new RetainedHeaderSurface()
        try {
          surface.setRect({x: 0, y: 0, w: 240, h: 120}, HEADER_PIXEL_SCALE, projectFont)
          const parent = surface.createParent()
          const node: BlenderNode = {id: `${label}:${collapsed}`, title: label, collapsed}
          const rect = {x: 20, y: 30, w: 180, h: measureBlenderNode(node).height}
          const entry = positionBlenderNode(node, rect)
          const plan = planBlenderNode(node, rect)
          surface.materialize(parent, () => blenderNodeRenderer.render({
            parameterRenderer: blenderParameterRenderer,
            host: surface,
            entry,
            plan,
            connectedSocketIds: new Set(),
            selected: false,
          }))

          const title = findCachedText(parent, label)
          const geometry = title.stencilGeometry
          expect(title.position.x / HEADER_PIXEL_SCALE).toBeCloseTo(44, 5)
          expect(cachedTextWorldCenterY(surface, title)).toBeCloseTo(42, 5)

          for (const scale of [0.16, 0.5, 1, 2]) {
            surface.scaleParent(parent, scale)
            expect(title.stencilGeometry).toBe(geometry)
            expect(cachedTextWorldCenterY(surface, title)).toBeCloseTo(42 * scale, 5)
          }
        } finally {
          surface.dispose()
        }
      }
    }
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
    const parameter = plan.parameters.find(({parameter}) => parameter.id === "value")!.rect
    const output = plan.sockets.find(({socket}) => socket.id === "output")!
    const input = plan.sockets.find(({socket}) => socket.id === "input")!
    expect(output.center.y).toBeLessThan(property.y)
    expect(input.center.y).toBeGreaterThan(parameter.y + parameter.h)
    expect(output.side).toBe("right")
    expect(input.side).toBe("left")
  })

  test("uses one calibrated visual envelope for all eight Socket shapes without a scale floor", () => {
    const center = {x: 40, y: 60}
    const expected = blenderSocketVisualBounds(center)
    expect(BLENDER_SOCKET_VISUAL_POLICY).toEqual({
      diameter: 10,
      outlineWidth: 1,
      cornerRadius: 1,
      strokeWidth: 2,
      innerDotDiameter: 3,
    })

    for (const shape of BLENDER_SOCKET_SHAPES) {
      const painted = paintedSocketBounds(shape, center)
      expect(painted.x, `${shape} x`).toBeGreaterThanOrEqual(expected.x - 1e-6)
      expect(painted.y, `${shape} y`).toBeGreaterThanOrEqual(expected.y - 1e-6)
      expect(painted.x + painted.w, `${shape} right`).toBeLessThanOrEqual(expected.x + expected.w + 1e-6)
      expect(painted.y + painted.h, `${shape} bottom`).toBeLessThanOrEqual(expected.y + expected.h + 1e-6)
      expect(Math.max(painted.w, painted.h), `${shape} diameter`).toBeCloseTo(BLENDER_SOCKET_VISUAL_POLICY.diameter)

      for (const parentScale of [0.16, 0.5, 1, 2]) {
        const projectedDiameter = Math.max(painted.w, painted.h) * parentScale
        expect(projectedDiameter, `${shape} @ ${parentScale}`).toBeCloseTo(BLENDER_SOCKET_VISUAL_POLICY.diameter * parentScale)
      }
    }
  })

  test("keeps Parameter and loose Socket centers on their exact Flex rows and Node borders", () => {
    const node: BlenderNode = {
      id: "socket-rows",
      title: "Socket rows",
      parameters: [{
        id: "value",
        label: "Value",
        field: {id: "value", label: "Value", kind: "number", value: 0.5},
      }],
      sockets: [
        {id: "loose-right", label: "Loose right", direction: "input", socketType: "float", side: "right"},
        {id: "value-left", label: "Value left", direction: "output", socketType: "float", parameterId: "value", side: "left"},
        {id: "value-right", label: "Value right", direction: "input", socketType: "float", parameterId: "value", side: "right"},
        {id: "loose-left", label: "Loose left", direction: "output", socketType: "float", side: "left"},
      ],
    }
    const rect = {x: 20, y: 30, w: 240, h: measureBlenderNode(node).height}
    const plan = planBlenderNode(node, rect)
    const parameterRect = plan.parameters.find(({parameter}) => parameter.id === "value")!.rect
    const byId = new Map(plan.sockets.map((entry) => [entry.socket.id, entry] as const))
    const parameterCenterY = parameterRect.y + parameterRect.h / 2

    expect(byId.get("value-left")?.center).toEqual({x: rect.x, y: parameterCenterY})
    expect(byId.get("value-right")?.center).toEqual({x: rect.x + rect.w, y: parameterCenterY})
    expect(byId.get("value-left")?.socket.direction).toBe("output")
    expect(byId.get("value-right")?.socket.direction).toBe("input")
    expect(byId.get("loose-right")?.center.x).toBe(rect.x + rect.w)
    expect(byId.get("loose-left")?.center.x).toBe(rect.x)
    expect(byId.get("loose-right")!.center.y - plan.body.y).toBe(
      plan.body.y + plan.body.h - byId.get("loose-left")!.center.y,
    )

    for (const shape of BLENDER_SOCKET_SHAPES.slice(0, 6)) {
      const left = paintedSocketBounds(shape, byId.get("value-left")!.center)
      const right = paintedSocketBounds(shape, byId.get("value-right")!.center)
      expect(rect.x - left.x, `${shape} left outside`).toBeCloseTo(BLENDER_SOCKET_VISUAL_POLICY.diameter / 2)
      expect(left.x + left.w - rect.x, `${shape} left inside`).toBeCloseTo(BLENDER_SOCKET_VISUAL_POLICY.diameter / 2)
      expect(rect.x + rect.w - right.x, `${shape} right inside`).toBeCloseTo(BLENDER_SOCKET_VISUAL_POLICY.diameter / 2)
      expect(right.x + right.w - (rect.x + rect.w), `${shape} right outside`).toBeCloseTo(BLENDER_SOCKET_VISUAL_POLICY.diameter / 2)
    }
  })

  test("anchors Rotation sockets to the label row for input, output, linked and hide-value states", () => {
    for (const state of ["input", "output", "linked", "hidden"] as const) {
      for (const shape of BLENDER_SOCKET_SHAPES) {
        const socket: BlenderSocket = {
          id: `rotation-${state}-${shape}`,
          label: "Rotation",
          direction: state === "output" ? "output" : "input",
          socketType: "rotation",
          parameterId: "rotation",
          side: state === "output" ? "right" : "left",
          shape,
          ...(state === "hidden" ? {hideValue: true} : {}),
        }
        const node: BlenderNode = {
          id: `rotation-${state}`,
          title: "Rotation owner",
          parameters: [{
            id: "rotation",
            label: "Rotation",
            field: {id: "rotation", label: "Rotation", kind: "rotation", value: [0, 45, 90]},
          }],
          sockets: [socket],
        }
        const rect = {x: 20, y: 30, w: 180, h: measureBlenderNode(node).height}
        const connected = new Set(state === "linked" ? [socket.id] : [])
        const entry = positionBlenderNode(node, rect)
        const plan = blenderNodeRenderer.plan({entry, connectedSocketIds: connected, selected: false})
        const parameter = plan.parameters[0]!
        const field = parameter.rect
        const label = parameter.labelRect
        const positioned = plan.sockets[0]!

        expect(field).toEqual({
          x: 37,
          y: 62,
          w: 146,
          h: state === "input" || state === "output" ? 91 : 22,
        })
        expect(label).toEqual({x: 37, y: 62, w: 146, h: 22})
        expect(plan.parameters[0]).toMatchObject({
          side: state === "output" ? "right" : "left",
          separateLabel: true,
        })
        expect(parameter.editorVisible).toBe(state === "input" || state === "output")
        expect(positioned.center).toEqual({x: state === "output" ? 200 : 20, y: 73})

        if (shape === BLENDER_SOCKET_SHAPES[0]) {
          const surface = new RecordingLabelSurface()
          try {
            surface.setRect({x: 0, y: 0, w: 240, h: 180}, HEADER_PIXEL_SCALE, projectFont)
            const parent = surface.createParent()
            surface.materialize(parent, () => blenderNodeRenderer.render({
              parameterRenderer: blenderParameterRenderer,
              host: surface,
              entry,
              plan,
              connectedSocketIds: connected,
              selected: false,
            }))
            const texts = cachedTextValues(parent)
            const expectedLabel = state === "output" ? "Rotation" : "Rotation:"
            expect(texts).toContain(expectedLabel)
            expect(texts.filter((value) => value === expectedLabel)).toHaveLength(1)
            const labelCall = surface.texts.find(([value]) => value === expectedLabel)!
            if (state === "output") {
              expect(texts).not.toContain("Rotation:")
              expect(labelCall[1] + surface.measureText("Rotation", 11)).toBeCloseTo(183)
            } else {
              expect(labelCall[1]).toBeCloseTo(37)
            }
            if (state === "input" || state === "output") {
              expect(texts).toEqual(expect.arrayContaining(["X", "Y", "Z", "0°", "45°", "90°"]))
            } else {
              expect(texts).not.toEqual(expect.arrayContaining(["X", "0°"]))
            }
          } finally {
            surface.dispose()
          }
        }
      }
    }
  })

  test("removes only the hidden editor height while preserving label Socket anchor", () => {
    const node: BlenderNode = {
      id: "transform-linked-height",
      title: "Transform",
      parameters: [
        {
          id: "translation",
          label: "Translation",
          field: {id: "translation", label: "Translation", kind: "vector", value: [1, 2, 3]},
        },
        {
          id: "rotation",
          label: "Rotation",
          field: {id: "rotation", label: "Rotation", kind: "rotation", value: [0, 45, 90]},
        },
      ],
      sockets: [
        {id: "translation", label: "Translation", direction: "input", socketType: "vector", parameterId: "translation", side: "left"},
        {id: "rotation", label: "Rotation", direction: "input", socketType: "rotation", parameterId: "rotation", side: "left"},
      ],
    }
    const unlinkedMeasurement = measureBlenderNode(node)
    const frame = {x: 20, y: 30, w: 180, h: unlinkedMeasurement.height}
    const entry = positionBlenderNode(node, frame)
    const unlinked = blenderNodeRenderer.plan({entry, connectedSocketIds: new Set(), selected: false})
    const linked = blenderNodeRenderer.plan({entry, connectedSocketIds: new Set(["translation"]), selected: false})
    const hiddenNode: BlenderNode = {
      ...node,
      sockets: node.sockets!.map((socket) => socket.id === "translation" ? {...socket, hideValue: true} : socket),
    }
    const hiddenEntry = positionBlenderNode(hiddenNode, frame)
    const hidden = blenderNodeRenderer.plan({entry: hiddenEntry, connectedSocketIds: new Set(), selected: false})

    expect(unlinkedMeasurement.height).toBe(225)
    expect(measureBlenderNode(node, new Set(["translation"])).height).toBe(156)
    expect(unlinked.rect).toEqual(frame)
    expect(linked.rect).toEqual({...frame, h: 156})
    expect(hidden.rect).toEqual(linked.rect)
    expect(unlinked.rect.h - linked.rect.h).toBe(69)

    const unlinkedTranslation = unlinked.sockets.find(({socket}) => socket.id === "translation")!
    const linkedTranslation = linked.sockets.find(({socket}) => socket.id === "translation")!
    expect(unlinkedTranslation.center.y).toBe(73)
    expect(linkedTranslation.center.y).toBe(unlinkedTranslation.center.y)

    const unlinkedRotation = unlinked.sockets.find(({socket}) => socket.id === "rotation")!
    const linkedRotation = linked.sockets.find(({socket}) => socket.id === "rotation")!
    expect(unlinkedRotation.center.y).toBe(167)
    expect(linkedRotation.center.y).toBe(98)
    expect(unlinkedRotation.center.y - linkedRotation.center.y).toBe(69)
    expect(linked.parameters.find(({parameter}) => parameter.id === "translation")?.rect.h).toBe(22)
    expect(linked.parameters.find(({parameter}) => parameter.id === "rotation")?.rect.y).toBe(87)

    const restored = blenderNodeRenderer.plan({entry, connectedSocketIds: new Set(), selected: false})
    expect(restored.rect).toEqual(unlinked.rect)
    expect(blenderNodeRenderer.presentation?.({entry, connectedSocketIds: new Set(["translation"]), selected: false}, linked)).toEqual({
      ...entry,
      rect: linked.rect,
      sockets: linked.sockets,
    })

    const surface = new RecordingShadowSurface()
    try {
      surface.setRect({x: 0, y: 0, w: 260, h: 260}, HEADER_PIXEL_SCALE, projectFont)
      const parent = surface.createParent()
      const presentation = blenderNodeRenderer.presentation!({
        entry,
        connectedSocketIds: new Set(["translation"]),
        selected: false,
      }, linked)
      surface.materialize(parent, () => blenderNodeRenderer.render({
        parameterRenderer: blenderParameterRenderer,
        host: surface,
        entry: presentation,
        connectedSocketIds: new Set(["translation"]),
        selected: false,
        plan: linked,
      }))
      expect(surface.shadows[0]?.slice(0, 4)).toEqual([20, 30, 180, 156])
      expect(surface.nodeRects[0]?.slice(0, 4)).toEqual([20, 30, 180, 156])
    } finally {
      surface.dispose()
    }
  })

  test("measures compact default width from intrinsic controls while preserving explicit resize", () => {
    const node: BlenderNode = {
      id: "default-width",
      title: "Transform",
      parameters: [
        {id: "translation", label: "Translation", field: {id: "translation", label: "Translation", kind: "vector", value: [1, 2, 3]}},
        {id: "rotation", label: "Rotation", field: {id: "rotation", label: "Rotation", kind: "rotation", value: [0, 45, 90]}},
      ],
      sockets: [
        {id: "translation", label: "Translation", direction: "input", socketType: "vector", parameterId: "translation", side: "left"},
        {id: "rotation", label: "Rotation", direction: "input", socketType: "rotation", parameterId: "rotation", side: "left"},
      ],
    }
    const unlinked = measureBlenderNode(node)
    const linked = measureBlenderNode(node, new Set(["translation"]))
    expect(unlinked.width).toBe(166)
    expect(linked.width).toBe(unlinked.width)
    expect(linked.height).toBeLessThan(unlinked.height)

    const defaultFrame = {x: 20, y: 30, w: unlinked.width, h: unlinked.height}
    const defaultPlan = planBlenderNode(node, defaultFrame)
    expect(defaultPlan.rect.w).toBe(166)
    expect(defaultPlan.parameters.map(({rect}) => ({x: rect.x, w: rect.w}))).toEqual([
      {x: 30, w: 146},
      {x: 30, w: 146},
    ])

    const resized = planBlenderNode(node, {...defaultFrame, w: 240})
    expect(resized.rect.w).toBe(240)
    expect(resized.parameters[0]?.rect).toMatchObject({x: 67, w: 146})

    const longHeaderLabel = "Transform Geometry With A Very Long Header"
    const longSocketLabel = "Extremely Long Translation Property Socket Label"
    const longHeader = measureBlenderNode({...node, title: longHeaderLabel})
    const longSocket = measureBlenderNode({
      ...node,
      sockets: [...node.sockets!, {
        id: "long-loose-socket",
        label: longSocketLabel,
        direction: "input",
        socketType: "vector",
        side: "left",
      }],
    })
    const surface = new RetainedHeaderSurface()
    try {
      surface.setRect({x: 0, y: 0, w: 600, h: 120}, HEADER_PIXEL_SCALE, projectFont)
      expect(longHeader.width).toBe(Math.ceil(8 + 12 + 4 + surface.measureText(longHeaderLabel, 11) + 6))
      expect(longSocket.width).toBe(Math.ceil(surface.measureText(longSocketLabel, 11) + 20))
    } finally {
      surface.dispose()
    }
  })

  test("keeps preview toggle state separate from the image panel and ordinary Node geometry", () => {
    const toggles: boolean[] = []
    const base: BlenderNode = {
      id: "previewable",
      title: "Previewable",
      preview: {
        enabled: false,
        image: {src: "preview-a.png", width: 160, height: 90},
        onToggle: (enabled) => toggles.push(enabled),
      },
    }
    const measured = measureBlenderNode(base)
    const rect = {x: 20, y: 120, w: 180, h: measured.height}
    const entry = positionBlenderNode(base, rect)
    const visible = {overlays: true, previews: true} as const
    const closed = planBlenderNode(base, rect, new Set(), visible)
    expect(closed.preview).toMatchObject({capable: true, enabled: false, panel: null, image: null})
    expect(closed.rect).toEqual(rect)
    expect(closed.bounds).toEqual(rect)

    const openNode: BlenderNode = {...base, preview: {...base.preview!, enabled: true}}
    const openEntry = positionBlenderNode(openNode, rect)
    const open = planBlenderNode(openNode, rect, new Set(), visible)
    expect(open.rect).toEqual(rect)
    expect(open.bounds.y).toBeLessThan(rect.y)
    expect(open.bounds.x).toBe(rect.x)
    expect(open.bounds.w).toBe(rect.w)
    expect(open.preview?.panel).toMatchObject({x: rect.x + 3, w: rect.w - 6})
    expect(open.preview?.image).toMatchObject({x: rect.x + 6, w: rect.w - 12})
    expect(open.sockets).toEqual(closed.sockets)
    expect(blenderNodeRenderer.bounds?.({
      entry: openEntry,
      connectedSocketIds: new Set(),
      selected: false,
      overlayState: visible,
    }, open)).toEqual(open.bounds)

    const globalHidden = planBlenderNode(openNode, rect, new Set(), {overlays: true, previews: false})
    expect(globalHidden.preview).toMatchObject({capable: true, enabled: true, panel: null, image: null})
    expect(globalHidden.bounds).toEqual(rect)
    expect(planBlenderNode(openNode, rect, new Set(), {overlays: false, previews: true}).preview)
      .toMatchObject({capable: true, enabled: true, panel: null, image: null})
    const zero = planBlenderNode({
      ...openNode,
      preview: {...openNode.preview!, image: {src: "zero.png", width: 0, height: 90}},
    }, rect, new Set(), visible)
    expect(zero.preview?.panel).toBeNull()
    expect(zero.preview?.image).toBeNull()

    const surface = new PreviewRecordingSurface()
    try {
      surface.setRect({x: 0, y: 0, w: 260, h: 260}, HEADER_PIXEL_SCALE, projectFont)
      const parent = surface.createParent()
      surface.materialize(parent, () => blenderNodeRenderer.render({
        parameterRenderer: blenderParameterRenderer,
        host: surface,
        entry,
        connectedSocketIds: new Set(),
        selected: false,
        overlayState: visible,
        plan: closed,
      }))
      expect(surface.images.map(([src]) => src)).toContain(uiIcons.visibilityOff)
      surface.hits.at(-1)?.[4]()
      expect(toggles).toEqual([true])

      surface.clearRecording()
      surface.materialize(parent, () => blenderNodeRenderer.render({
        parameterRenderer: blenderParameterRenderer,
        host: surface,
        entry: openEntry,
        connectedSocketIds: new Set(),
        selected: false,
        overlayState: visible,
        plan: open,
      }))
      expect(surface.images.map(([src]) => src)).toEqual(expect.arrayContaining([
        uiIcons.visibilityOn,
        "preview-a.png",
      ]))
    } finally {
      surface.dispose()
    }
  })
})

function paintedSocketBounds(
  shape: BlenderSocketShape,
  center: Readonly<{x: number; y: number}>,
): Readonly<{x: number; y: number; w: number; h: number}> {
  const calls: PaintCall[] = []
  const host = {
    drawRoundedRect(x: number, y: number, w: number, h: number) {
      calls.push({kind: "rect", x, y, w, h})
    },
    drawLine(x1: number, y1: number, x2: number, y2: number, _color: unknown, width: number) {
      calls.push({kind: "line", x1, y1, x2, y2, width})
    },
    drawPolyline(points: readonly Readonly<{x: number; y: number}>[], _color: unknown, width: number) {
      calls.push({kind: "polyline", points, width})
    },
  } as unknown as Parameters<typeof blenderSocketRenderer.render>[0]["host"]
  const socket: BlenderSocket = {
    id: `socket-${shape}`,
    label: shape,
    direction: "bidirectional",
    socketType: "custom",
    shape,
  }
  blenderSocketRenderer.render({
    host,
    entry: {socket, side: "right", center},
    selected: false,
    nodeId: "visual-policy",
  })

  const boxes = calls.map((call) => {
    if (call.kind === "rect") return {x: call.x, y: call.y, w: call.w, h: call.h}
    const coordinates = call.kind === "polyline"
      ? Array.from(createUiPolylineStrokeGeometry(call.points, call.width)!.attributes.position!.array)
      : lineQuad(call)
    const xs = coordinates.filter((_, index) => index % 3 === 0)
    const ys = coordinates.filter((_, index) => index % 3 === 1)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return {
      x,
      y,
      w: Math.max(...xs) - x,
      h: Math.max(...ys) - y,
    }
  })
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  }
}

type PaintedNodeHeader = Readonly<{
  header: Readonly<{x: number; y: number; w: number; h: number; radius: number}>
  chevron: Readonly<{
    points: readonly Readonly<{x: number; y: number}>[]
    width: number
  }>
  title: Readonly<{
    value: string
    x: number
    y: number
    fontPx: number
    maxWidthPx: number
  }>
}>

type NodeShadowCall = Readonly<{
  kind: "shadow"
  x: number
  y: number
  w: number
  h: number
  options: Readonly<{
    radius: number
    blur: number
    spread: number
    color: readonly [number, number, number, number]
    opacity: number
    z: number
  }>
}>

type NodeRectCall = Readonly<{
  kind: "rect"
  x: number
  y: number
  w: number
  h: number
  options: Readonly<{
    radius: number
    fill: readonly [number, number, number, number] | null
    border: readonly [number, number, number, number] | null
    borderWidth: number
    z: number
  }>
}>

type NodeVisualCall = NodeShadowCall | NodeRectCall

function paintedNodeShadow(collapsed: boolean, selected: boolean): Readonly<{
  collapsed: boolean
  selected: boolean
  rect: Readonly<{x: number; y: number; w: number; h: number}>
  calls: readonly NodeVisualCall[]
}> {
  const node: BlenderNode = {
    id: `shadow-${collapsed ? "collapsed" : "expanded"}-${selected ? "selected" : "ordinary"}`,
    title: "Shadow",
    collapsed,
    headerColor: {r: 0.22, g: 0.48, b: 0.74, a: 0.8},
  }
  const rect = {x: 20, y: 30, w: 180, h: measureBlenderNode(node).height}
  const entry = positionBlenderNode(node, rect)
  const plan = planBlenderNode(node, rect)
  const calls: NodeVisualCall[] = []
  const material = {}
  const host = {
    materials: {text: material, orange: material},
    drawRoundedShadow(
      x: number,
      y: number,
      w: number,
      h: number,
      options: {radius: number; blur: number; spread: number; color: Color; opacity?: number; z?: number},
    ) {
      calls.push({
        kind: "shadow",
        x,
        y,
        w,
        h,
        options: {
          radius: options.radius,
          blur: options.blur,
          spread: options.spread,
          color: requiredColorTuple(options.color),
          opacity: options.opacity ?? 1,
          z: options.z ?? Z.CONTAINER,
        },
      })
    },
    drawRoundedRect(
      x: number,
      y: number,
      w: number,
      h: number,
      options: {
        radius: number
        fill?: Color | null
        border?: Color | null
        borderWidth?: number
        z?: number
      },
    ) {
      calls.push({
        kind: "rect",
        x,
        y,
        w,
        h,
        options: {
          radius: options.radius,
          fill: colorTuple(options.fill ?? null),
          border: colorTuple(options.border ?? null),
          borderWidth: options.borderWidth ?? 0,
          z: options.z ?? Z.ELEMENT,
        },
      })
    },
    drawPolyline() {},
    textTopForVisualCenter(_value: string, centerY: number, fontPx: number) {
      return centerY - fontPx / 2
    },
    drawText() {
      return 0
    },
  } as unknown as Parameters<typeof blenderNodeRenderer.render>[0]["host"]

  blenderNodeRenderer.render({
    parameterRenderer: blenderParameterRenderer,
    host,
    entry,
    plan,
    connectedSocketIds: new Set(),
    selected,
  })

  return {collapsed, selected, rect, calls}
}

function colorTuple(color: Color | null): readonly [number, number, number, number] | null {
  return color === null ? null : [color.r, color.g, color.b, color.a]
}

function requiredColorTuple(color: Color): readonly [number, number, number, number] {
  return [color.r, color.g, color.b, color.a]
}

function paintedNodeHeader(collapsed: boolean): PaintedNodeHeader {
  const node: BlenderNode = {id: "mapping", title: "Mapping", collapsed}
  const rect = {x: 20, y: 30, w: 180, h: measureBlenderNode(node).height}
  const entry = positionBlenderNode(node, rect)
  const plan = planBlenderNode(node, rect)
  const rounded: Array<{x: number; y: number; w: number; h: number; radius: number}> = []
  const polylines: Array<{
    points: readonly Readonly<{x: number; y: number}>[]
    width: number
  }> = []
  const texts: Array<{
    value: string
    x: number
    y: number
    fontPx: number
    maxWidthPx: number
  }> = []
  const material = {}
  const host = {
    materials: {text: material, orange: material},
    drawRoundedShadow() {},
    drawRoundedRect(x: number, y: number, w: number, h: number, opts: {radius: number}) {
      rounded.push({x, y, w, h, radius: opts.radius})
    },
    drawPolyline(points: readonly Readonly<{x: number; y: number}>[], _color: unknown, width: number) {
      polylines.push({points, width})
    },
    textTopForVisualCenter(_value: string, centerY: number, fontPx: number) {
      return centerY - fontPx / 2
    },
    drawText(value: string, x: number, y: number, opts: {fontPx: number; maxWidthPx: number}) {
      texts.push({value, x, y, fontPx: opts.fontPx, maxWidthPx: opts.maxWidthPx})
      return 0
    },
  } as unknown as Parameters<typeof blenderNodeRenderer.render>[0]["host"]

  blenderNodeRenderer.render({
    parameterRenderer: blenderParameterRenderer,
    host,
    entry,
    plan,
    connectedSocketIds: new Set(),
    selected: false,
  })

  return {
    header: rounded.at(-1)!,
    chevron: polylines[0]!,
    title: texts.find(({value}) => value === node.title)!,
  }
}

class RetainedHeaderSurface extends UiSurface {
  createParent(): Object3D {
    return this.createRetainedParent()
  }

  materialize(parent: Object3D, draw: () => void): void {
    this.materializeRetainedParent(parent, draw)
  }

  scaleParent(parent: Object3D, scale: number): void {
    this.updateRetainedTransform(parent, (target) => target.scale.set(scale, scale, 1))
  }

  protected render(): void {}
}

type ShadowCall = Parameters<UiSurface["drawRoundedShadow"]>
type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>

class RecordingShadowSurface extends RetainedHeaderSurface {
  readonly shadows: ShadowCall[] = []
  readonly nodeRects: RoundedRectCall[] = []

  override drawRoundedShadow(...args: ShadowCall): void {
    this.shadows.push(args)
    super.drawRoundedShadow(...args)
  }

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.nodeRects.push(args)
    super.drawRoundedRect(...args)
  }
}

type ImageCall = Parameters<UiSurface["drawImage"]>
type HitCall = Parameters<UiSurface["hit"]>

class PreviewRecordingSurface extends RetainedHeaderSurface {
  readonly images: ImageCall[] = []
  readonly hits: HitCall[] = []

  override drawImage(...args: ImageCall): void {
    this.images.push(args)
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  clearRecording(): void {
    this.images.length = 0
    this.hits.length = 0
  }
}

type TextCall = Parameters<UiSurface["drawText"]>

class RecordingLabelSurface extends RetainedHeaderSurface {
  readonly texts: TextCall[] = []

  override drawText(...args: TextCall): number {
    this.texts.push(args)
    return super.drawText(...args)
  }
}

function findCachedText(parent: Object3D, value: string): CachedText {
  let result: CachedText | undefined
  parent.traverse((object) => {
    if (object instanceof CachedText && object.text === value) result = object
  })
  if (result === undefined) throw new Error(`Missing materialized title: ${value}`)
  return result
}

function cachedTextValues(parent: Object3D): readonly string[] {
  const values: string[] = []
  parent.traverse((object) => {
    if (object instanceof CachedText) values.push(object.text)
  })
  return values
}

function cachedTextWorldCenterY(surface: UiSurface, text: CachedText): number {
  const positions = text.stencilGeometry.attributes.position?.array
  if (positions === undefined) throw new Error(`Missing stencil geometry for ${text.text}`)
  surface.node.updateWorldMatrix(true)
  const ys: number[] = []
  for (let index = 0; index < positions.length; index += 3) {
    const world = new Vector3(
      Number(positions[index]),
      Number(positions[index + 1]),
      Number(positions[index + 2]),
    ).applyMatrix4(text.matrixWorld)
    ys.push(-world.y / HEADER_PIXEL_SCALE)
  }
  return (Math.min(...ys) + Math.max(...ys)) / 2
}

function paintedPolylineBounds(
  points: readonly Readonly<{x: number; y: number}>[],
  width: number,
): Readonly<{w: number; h: number; centerX: number; centerY: number}> {
  const coordinates = Array.from(createUiPolylineStrokeGeometry(points, width)!.attributes.position!.array)
  const xs = coordinates.filter((_, index) => index % 3 === 0)
  const ys = coordinates.filter((_, index) => index % 3 === 1)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    w: maxX - minX,
    h: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

function lineQuad(call: Extract<PaintCall, {kind: "line"}>): number[] {
  const dx = call.x2 - call.x1
  const dy = call.y2 - call.y1
  const length = Math.hypot(dx, dy)
  const offsetX = -dy / length * call.width / 2
  const offsetY = dx / length * call.width / 2
  return [
    call.x1 + offsetX, call.y1 + offsetY, 0,
    call.x1 - offsetX, call.y1 - offsetY, 0,
    call.x2 + offsetX, call.y2 + offsetY, 0,
    call.x2 - offsetX, call.y2 - offsetY, 0,
  ]
}
