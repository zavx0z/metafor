import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineGlowMaterial,
  LineSegments,
  Matrix4,
  Object3D,
  Renderer,
  Space,
  SphereGeometry,
  Text,
  TextMaterial,
  TrueTypeFont,
  Vector3,
  ViewPoint,
} from "@metafor/engine"
import type {
  StateGraphLayoutEdge,
  StateGraphLayoutNode,
  StateGraphRootLayout,
} from "./StateGraphLayout.ts"

const BACKGROUND = new Color(0.012, 0.03, 0.05)
const EDGE_COLOR = new Color(0.28, 0.78, 1, 0.82)
const EDGE_GLOW = new Color(0.45, 0.9, 1, 0.28)
const RETURN_EDGE_COLOR = new Color(1, 0.55, 0.22, 0.9)
const RETURN_EDGE_GLOW = new Color(1, 0.39, 0.12, 0.36)
const LEVEL_COLOR = new Color(0.34, 0.46, 0.62, 0.2)
const LEVEL_LABEL_COLOR = new Color(0.48, 0.59, 0.74)
const NODE_LABEL_SIZE = 1.2
const LEVEL_LABEL_SIZE = 0.9
const EDGE_SEGMENTS = 24
const FRAME_PADDING = 1.3

export type StateGraphViewport = Readonly<{
  dispose(): void
  setSize(width: number, height: number): void
  setView(view: StateGraphView): void
}>

export type StateGraphView =
  | "back"
  | "bottom"
  | "front"
  | "left"
  | "right"
  | "top"

export type CreateStateGraphViewportOptions = Readonly<{
  canvas: HTMLCanvasElement
  height: number
  layout: StateGraphRootLayout
  width: number
}>

type LabelTracker = {
  anchor: Vector3
  container: Object3D
  offset: number
}

const geometryFromSegments = (
  segments: readonly (readonly [Vector3, Vector3])[],
): BufferGeometry => {
  const positions = new Float32Array(segments.length * 6)
  let offset = 0
  for (const [from, to] of segments) {
    positions[offset++] = from.x
    positions[offset++] = from.y
    positions[offset++] = from.z
    positions[offset++] = to.x
    positions[offset++] = to.y
    positions[offset++] = to.z
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))
  return geometry
}

const nodePosition = (node: StateGraphLayoutNode): Vector3 =>
  new Vector3(node.x, node.y, node.z)

const edgeGeometry = (
  edge: StateGraphLayoutEdge,
  nodeById: ReadonlyMap<string, StateGraphLayoutNode>,
): BufferGeometry => {
  const fromNode = nodeById.get(edge.fromNodeId)
  const toNode = nodeById.get(edge.toNodeId)
  if (!fromNode || !toNode) return geometryFromSegments([])
  const fromCenter = nodePosition(fromNode)
  const toCenter = nodePosition(toNode)
  const direction = toCenter.clone().sub(fromCenter)
  const length = Math.max(direction.length(), 1e-6)
  const unit = direction.clone().multiplyScalar(1 / length)
  const from = fromCenter.clone().add(unit.clone().multiplyScalar(fromNode.radius))
  const to = toCenter.clone().sub(unit.clone().multiplyScalar(toNode.radius))
  const middleX = (from.x + to.x) / 2
  const returnOffset = edge.returning
    ? (from.y <= to.y ? -8 : 8)
    : 0
  const segments: Array<readonly [Vector3, Vector3]> = []
  let previous = from
  for (let index = 1; index <= EDGE_SEGMENTS; index += 1) {
    const t = index / EDGE_SEGMENTS
    const inverse = 1 - t
    const point = new Vector3(
      inverse ** 3 * from.x +
        3 * inverse ** 2 * t * middleX +
        3 * inverse * t ** 2 * middleX +
        t ** 3 * to.x,
      inverse ** 3 * from.y +
        3 * inverse ** 2 * t * (from.y + returnOffset) +
        3 * inverse * t ** 2 * (to.y + returnOffset) +
        t ** 3 * to.y,
      Math.sin(Math.PI * t) * 0.7,
    )
    segments.push([previous, point])
    previous = point
  }
  return geometryFromSegments(segments)
}

const textCenter = (text: Text): {x: number; y: number} => {
  const positions = text.coverGeometry.attributes.position?.array
  if (!positions || positions.length < 3) return {x: 0, y: 0}
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < positions.length; index += 3) {
    const x = Number(positions[index])
    const y = Number(positions[index + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return {x: 0, y: 0}
  return {x: (minX + maxX) / 2, y: (minY + maxY) / 2}
}

const addLabel = (
  space: Space,
  font: TrueTypeFont,
  text: string,
  fontSize: number,
  color: Color,
  anchor: Vector3,
  offset: number,
): LabelTracker => {
  const node = new Text(
    text,
    font,
    fontSize,
    new TextMaterial({color, opacity: 1, depthWrite: false}),
  )
  const center = textCenter(node)
  node.position.set(-center.x, -center.y, 0)
  node.frustumCulled = false
  node.updateMatrix()
  const container = new Object3D()
  container.frustumCulled = false
  container.add(node)
  container.updateMatrix()
  space.add(container)
  return {anchor, container, offset}
}

const addLevelGuides = (
  space: Space,
  layout: StateGraphRootLayout,
): void => {
  const minimumY = Math.min(...layout.nodes.map((node) => node.y), 0) - 11
  const maximumY = Math.max(...layout.nodes.map((node) => node.y), 0) + 11
  const geometry = geometryFromSegments(
    layout.levels.map((level) => [
      new Vector3(level.x, minimumY, -0.5),
      new Vector3(level.x, maximumY, -0.5),
    ] as const),
  )
  const guides = new LineSegments(
    geometry,
    new LineBasicMaterial({color: LEVEL_COLOR, opacity: 1}),
  )
  guides.updateMatrix()
  space.add(guides)
}

const fitDistance = (
  layout: StateGraphRootLayout,
  aspect: number,
  fov: number,
): {distance: number; target: Vector3} => {
  const xs = layout.nodes.map((node) => node.x)
  const ys = layout.nodes.map((node) => node.y)
  const minX = Math.min(...xs, 0) - 9
  const maxX = Math.max(...xs, 0) + 9
  const minY = Math.min(...ys, 0) - 13
  const maxY = Math.max(...ys, 0) + 13
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const verticalTan = Math.tan(fov / 2)
  const horizontalTan = verticalTan * Math.max(0.1, aspect)
  return {
    target: new Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0),
    distance: Math.max(
      height / 2 / verticalTan,
      width / 2 / horizontalTan,
    ) * FRAME_PADDING,
  }
}

export const createStateGraphViewport = async ({
  canvas,
  height,
  layout,
  width,
}: CreateStateGraphViewportOptions): Promise<StateGraphViewport> => {
  const renderer = new Renderer()
  await renderer.init(canvas)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  renderer.setSize(width, height)
  const font = await TrueTypeFont.fromUrl("/engine-static/JetBrainsMono-Bold.ttf")
  const space = new Space()
  space.background = BACKGROUND.clone()
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node] as const))

  addLevelGuides(space, layout)
  for (const edge of layout.edges) {
    const color = edge.returning ? RETURN_EDGE_COLOR : EDGE_COLOR
    const glowColor = edge.returning ? RETURN_EDGE_GLOW : EDGE_GLOW
    const line = new LineSegments(
      edgeGeometry(edge, nodeById),
      new LineGlowMaterial({
        color,
        glowColor,
        glowIntensity: 1.65,
        opacity: 1,
        visibilityMode: "scene",
      }),
    )
    line.updateMatrix()
    space.add(line)
  }

  const labels: LabelTracker[] = []
  for (const node of layout.nodes) {
    const alpha = node.current ? 1 : 0.76
    const color = new Color(node.color[0], node.color[1], node.color[2], alpha)
    const glow = new Color(
      node.color[0],
      node.color[1],
      node.color[2],
      node.current ? 0.64 : 0.3,
    )
    const sphere = new LineSegments(
      new SphereGeometry({
        radius: node.radius,
        widthSegments: 22,
        heightSegments: 14,
      }).toWireframe(),
      new LineGlowMaterial({
        color,
        glowColor: glow,
        glowIntensity: node.current ? 3.8 : 2.1,
        luminanceBoost: node.current ? 1.3 : 1,
        opacity: 1,
        visibilityMode: "scene",
      }),
    )
    sphere.position.set(node.x, node.y, node.z)
    sphere.updateMatrix()
    space.add(sphere)
    labels.push(addLabel(
      space,
      font,
      node.label,
      NODE_LABEL_SIZE,
      new Color(node.color[0], node.color[1], node.color[2]),
      nodePosition(node),
      node.radius + 1.8,
    ))
  }

  const guideLabelY = Math.max(...layout.nodes.map((node) => node.y), 0) + 10
  for (const level of layout.levels) {
    labels.push(addLabel(
      space,
      font,
      `Шаг ${level.step + 1}`,
      LEVEL_LABEL_SIZE,
      LEVEL_LABEL_COLOR,
      new Vector3(level.x, guideLabelY, 0),
      0,
    ))
  }

  const fov = Math.PI / 3.2
  const initialFit = fitDistance(layout, width / Math.max(1, height), fov)
  const viewPoint = new ViewPoint({
    element: canvas,
    fov,
    near: 0.01,
    far: 10000,
    position: {
      x: initialFit.target.x,
      y: initialFit.target.y,
      z: initialFit.distance,
    },
    target: initialFit.target,
  })
  viewPoint.getUp().set(0, 1, 0)
  viewPoint.setAspectRatio(width / Math.max(1, height))
  viewPoint.update()

  const basisMatrix = new Matrix4()
  const normal = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const updateLabels = (): void => {
    for (const label of labels) {
      normal.copy(viewPoint.position).sub(label.anchor)
      if (normal.length() < 1e-6) normal.set(0, 0, 1)
      else normal.normalize()
      up.copy(viewPoint.getUp()).normalize()
      right.crossVectors(up, normal)
      if (right.length() < 1e-6) {
        up.set(0, 1, 0)
        right.crossVectors(up, normal)
      }
      right.normalize()
      up.crossVectors(normal, right).normalize()
      label.container.position
        .copy(label.anchor)
        .add(up.clone().multiplyScalar(label.offset))
        .add(normal.clone().multiplyScalar(0.35))
      const elements = basisMatrix.elements
      elements[0] = right.x; elements[1] = right.y; elements[2] = right.z; elements[3] = 0
      elements[4] = up.x; elements[5] = up.y; elements[6] = up.z; elements[7] = 0
      elements[8] = normal.x; elements[9] = normal.y; elements[10] = normal.z; elements[11] = 0
      elements[12] = 0; elements[13] = 0; elements[14] = 0; elements[15] = 1
      label.container.quaternion.setFromRotationMatrix(basisMatrix)
      label.container.updateMatrix()
    }
  }

  let disposed = false
  let frame = 0
  let dragging = false
  const render = (): void => {
    frame = 0
    if (disposed) return
    updateLabels()
    space.updateWorldMatrix()
    renderer.render(space, viewPoint)
  }
  const requestRender = (): void => {
    if (disposed || frame !== 0) return
    frame = requestAnimationFrame(render)
  }
  const handleMouseDown = (): void => {
    dragging = true
    requestRender()
  }
  const handleMouseMove = (): void => {
    if (dragging) requestRender()
  }
  const handleMouseUp = (): void => {
    dragging = false
    requestRender()
  }
  const handleViewChange = (): void => requestRender()
  canvas.addEventListener("mousedown", handleMouseDown)
  canvas.addEventListener("wheel", handleViewChange)
  canvas.addEventListener("touchstart", handleViewChange)
  canvas.addEventListener("touchmove", handleViewChange)
  canvas.addEventListener("touchend", handleViewChange)
  document.addEventListener("mousemove", handleMouseMove)
  document.addEventListener("mouseup", handleMouseUp)
  requestRender()

  return {
    dispose() {
      if (disposed) return
      disposed = true
      if (frame !== 0) cancelAnimationFrame(frame)
      viewPoint.dispose()
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("wheel", handleViewChange)
      canvas.removeEventListener("touchstart", handleViewChange)
      canvas.removeEventListener("touchmove", handleViewChange)
      canvas.removeEventListener("touchend", handleViewChange)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    },
    setSize(nextWidth: number, nextHeight: number) {
      if (disposed) return
      const safeWidth = Math.max(1, nextWidth)
      const safeHeight = Math.max(1, nextHeight)
      renderer.setSize(safeWidth, safeHeight)
      viewPoint.setAspectRatio(safeWidth / safeHeight)
      viewPoint.update()
      requestRender()
    },
    setView(view: StateGraphView) {
      if (disposed) return
      const target = viewPoint.getTarget()
      const distance = Math.max(
        viewPoint.position.clone().sub(target).length(),
        1,
      )
      const direction = new Vector3()
      const up = viewPoint.getUp()
      switch (view) {
        case "top":
          direction.set(0, 0, 1)
          up.set(0, 1, 0)
          break
        case "bottom":
          direction.set(0, 0, -1)
          up.set(0, 1, 0)
          break
        case "front":
          direction.set(0, -1, 0)
          up.set(0, 0, 1)
          break
        case "back":
          direction.set(0, 1, 0)
          up.set(0, 0, 1)
          break
        case "right":
          direction.set(1, 0, 0)
          up.set(0, 0, 1)
          break
        case "left":
          direction.set(-1, 0, 0)
          up.set(0, 0, 1)
          break
      }
      viewPoint.position.copy(target).add(direction.multiplyScalar(distance))
      viewPoint.update()
      requestRender()
    },
  }
}
