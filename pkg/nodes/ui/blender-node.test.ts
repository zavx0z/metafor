import {beforeAll, describe, expect, test} from "bun:test"
import {CachedText, Object3D, TrueTypeFont, Vector3, type Color} from "@metafor/engine"
import {UiSurface, Z, createUiPolylineStrokeGeometry} from "@ui/elements"
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
    const parameter = plan.fields.find(({field}) => field.id === "value")!.rect
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

function findCachedText(parent: Object3D, value: string): CachedText {
  let result: CachedText | undefined
  parent.traverse((object) => {
    if (object instanceof CachedText && object.text === value) result = object
  })
  if (result === undefined) throw new Error(`Missing materialized title: ${value}`)
  return result
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
