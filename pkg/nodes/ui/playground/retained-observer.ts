import {Matrix4, Vector3, type Object3D} from "@metafor/engine"
import {
  type NodeCanvasDiagnostics,
  type NodeCanvasTransform,
  type NodeEditor,
  type NodeEditorSelection,
} from "../node-editor.ts"
import type {
  BlenderFrame,
  BlenderLink,
  BlenderNode,
  BlenderNodePlan,
  BlenderSocket,
} from "../blender-node.ts"

type GeometryLike = Readonly<{
  attributes?: Readonly<Record<string, Readonly<{
    array?: ArrayLike<number>
    itemSize?: number
  }>>>
}>

type InspectableObject = Object3D & Readonly<{
  isText?: boolean
  geometry?: object
  stencilGeometry?: object
  coverGeometry?: object
  material?: Readonly<{clipBounds?: readonly number[] | null}>
  clipBounds?: readonly number[] | null
}>

type RetainedEditor = NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame, BlenderNodePlan>

export type RetainedVisualSample = Readonly<{
  objectId: string
  parentObjectId: string | null
  kind: "mesh" | "text"
  name: string
  geometryIds: readonly string[]
  worldScale: readonly [number, number]
  worldScaleRatioToContentRoot: readonly [number, number]
}>

export type RetainedComponentSample = Readonly<{
  name: string
  objectId: string
  visible: boolean
  childObjectIds: readonly string[]
  descendantCount: number
  geometryCount: number
  textCount: number
  geometryIds: readonly string[]
  visualSamples: readonly RetainedVisualSample[]
  bounded: boolean
}>

export type RetainedLinkEvidence = Readonly<{
  id: string
  parentObjectId: string
  geometryObjectId: string
  geometryId: string
  rawFirstPoint: Readonly<{x: number; y: number}>
  rawLastPoint: Readonly<{x: number; y: number}>
  sourceSocketCenter: Readonly<{x: number; y: number}>
  targetSocketCenter: Readonly<{x: number; y: number}>
  actualGeometryFirstPoint: Readonly<{x: number; y: number}>
  actualGeometryLastPoint: Readonly<{x: number; y: number}>
  framebufferClip: readonly number[] | null
}>

export type PlaygroundRetainedSnapshot = Readonly<{
  transform: NodeCanvasTransform
  selection: NodeEditorSelection
  diagnostics: NodeCanvasDiagnostics
  contentRoot: Readonly<{
    count: number
    objectId: string | null
    parentObjectId: string | null
    childObjectIds: readonly string[]
    childNames: readonly string[]
    worldScale: readonly [number, number] | null
  }>
  components: readonly RetainedComponentSample[]
  representativeNode: RetainedComponentSample | null
  links: readonly RetainedLinkEvidence[]
}>

export type PlaygroundRetainedObserver = Readonly<{
  snapshot(): PlaygroundRetainedSnapshot
  setTransform(transform: NodeCanvasTransform): Readonly<{accepted: boolean; snapshot: PlaygroundRetainedSnapshot}>
  wheelZoom(): Readonly<{before: NodeCanvasTransform; after: NodeCanvasTransform; snapshot: PlaygroundRetainedSnapshot}>
  pinchZoom(): Readonly<{before: NodeCanvasTransform; after: NodeCanvasTransform; snapshot: PlaygroundRetainedSnapshot}>
  hitNode(nodeId: string): Readonly<{
    nodeId: string
    before: NodeEditorSelection
    after: NodeEditorSelection
    surfacePoint: Readonly<{x: number; y: number}>
    snapshot: PlaygroundRetainedSnapshot
  }>
  select(selection: NodeEditorSelection): Readonly<{accepted: boolean; snapshot: PlaygroundRetainedSnapshot}>
  publish(): void
  publishAfterFrame(): void
}>

declare global {
  var __nodeComponentRetainedObserver: PlaygroundRetainedObserver | undefined
}

const MAX_COMPONENT_CHILDREN = 64
const MAX_COMPONENT_GEOMETRIES = 64
const MAX_COMPONENT_VISUAL_SAMPLES = 24

/** Dev-only observer over the actual NodeEditor engine graph used by the playground. */
export function createPlaygroundRetainedObserver(editor: RetainedEditor): PlaygroundRetainedObserver {
  const objectIds = new WeakMap<object, string>()
  const geometryIds = new WeakMap<object, string>()
  let nextObjectId = 1
  let nextGeometryId = 1

  const objectId = (value: object): string => {
    const current = objectIds.get(value)
    if (current !== undefined) return current
    const next = `object-${nextObjectId++}`
    objectIds.set(value, next)
    return next
  }

  const geometryId = (value: object): string => {
    const current = geometryIds.get(value)
    if (current !== undefined) return current
    const next = `geometry-${nextGeometryId++}`
    geometryIds.set(value, next)
    return next
  }

  const contentRoots = (): Object3D[] => {
    const roots: Object3D[] = []
    editor.node.traverse((object) => {
      if (object.name === "NodeCanvas.contentRoot") roots.push(object)
    })
    return roots
  }

  const requiredContentRoot = (): Object3D => {
    const roots = contentRoots()
    if (roots.length !== 1) throw new Error(`Expected one NodeCanvas.contentRoot, got ${roots.length}`)
    return roots[0]!
  }

  const componentSample = (component: Object3D, contentRoot: Object3D): RetainedComponentSample => {
    const descendants: InspectableObject[] = []
    component.traverse((object) => {
      if (object !== component) descendants.push(object as InspectableObject)
    })
    const geometries: object[] = []
    const visuals: InspectableObject[] = []
    let textCount = 0
    for (const object of descendants) {
      const objectGeometries = geometriesOf(object)
      geometries.push(...objectGeometries)
      if (object.isText === true) textCount += 1
      if (object.isText === true || objectGeometries.length > 0) visuals.push(object)
    }
    const rootScale = worldScale2D(contentRoot)
    const boundedChildren = component.children.slice(0, MAX_COMPONENT_CHILDREN)
    const boundedGeometries = geometries.slice(0, MAX_COMPONENT_GEOMETRIES)
    const boundedVisuals = visuals.slice(0, MAX_COMPONENT_VISUAL_SAMPLES)
    return {
      name: component.name,
      objectId: objectId(component),
      visible: component.visible,
      childObjectIds: boundedChildren.map(objectId),
      descendantCount: descendants.length,
      geometryCount: geometries.length,
      textCount,
      geometryIds: boundedGeometries.map(geometryId),
      visualSamples: boundedVisuals.map((object): RetainedVisualSample => {
        const scale = worldScale2D(object)
        return {
          objectId: objectId(object),
          parentObjectId: object.parent === null ? null : objectId(object.parent),
          kind: object.isText === true ? "text" : "mesh",
          name: object.name,
          geometryIds: geometriesOf(object).map(geometryId),
          worldScale: scale,
          worldScaleRatioToContentRoot: [safeRatio(scale[0], rootScale[0]), safeRatio(scale[1], rootScale[1])],
        }
      }),
      bounded: component.children.length > boundedChildren.length ||
        geometries.length > boundedGeometries.length || visuals.length > boundedVisuals.length,
    }
  }

  const snapshot = (): PlaygroundRetainedSnapshot => {
    editor.node.updateWorldMatrix(true)
    const roots = contentRoots()
    const root = roots.length === 1 ? roots[0]! : null
    const components = root === null ? [] : root.children.map((component) => componentSample(component, root))
    const representativeNodeId = editor.tree.nodes[0]?.node.id ?? null
    const representativeNode = representativeNodeId === null
      ? null
      : components.find(({name}) => name === `NodeCanvas.node:${representativeNodeId}`) ?? null
    return {
      transform: {...editor.canvasTransform},
      selection: editor.selection === null ? null : {...editor.selection},
      diagnostics: editor.diagnostics,
      contentRoot: {
        count: roots.length,
        objectId: root === null ? null : objectId(root),
        parentObjectId: root?.parent === null || root?.parent === undefined ? null : objectId(root.parent),
        childObjectIds: root?.children.map(objectId) ?? [],
        childNames: root?.children.map(({name}) => name) ?? [],
        worldScale: root === null ? null : worldScale2D(root),
      },
      components,
      representativeNode,
      links: root === null ? [] : editor.tree.links.map((entry) => linkEvidence(editor, root, entry.link.id, objectId, geometryId)),
    }
  }

  const publish = (): void => {
    const current = snapshot()
    document.documentElement.dataset.canvasX = String(current.transform.x)
    document.documentElement.dataset.canvasY = String(current.transform.y)
    document.documentElement.dataset.canvasScale = String(current.transform.scale)
    document.documentElement.dataset.selectedKind = current.selection?.kind ?? ""
    document.documentElement.dataset.selectedId = current.selection?.id ?? ""
    document.documentElement.dataset.retainedContentRootCount = String(current.contentRoot.count)
    document.documentElement.dataset.retainedDiagnostics = JSON.stringify(current.diagnostics)
  }

  const publishAfterFrame = (): void => {
    requestAnimationFrame(() => requestAnimationFrame(publish))
  }

  const observer: PlaygroundRetainedObserver = Object.freeze({
    snapshot,
    setTransform(transform) {
      const accepted = editor.setCanvasTransform(transform)
      publish()
      return {accepted, snapshot: snapshot()}
    },
    wheelZoom() {
      const before = {...editor.canvasTransform}
      const event = new WheelEvent("wheel", {deltaY: -80, ctrlKey: true, cancelable: true})
      editor.onWheel(event, 8, Math.max(TOOLBAR_SAFE_Y, editor.frameHeight - 8))
      publish()
      return {before, after: {...editor.canvasTransform}, snapshot: snapshot()}
    },
    pinchZoom() {
      const before = {...editor.canvasTransform}
      const y = Math.max(TOOLBAR_SAFE_Y, editor.frameHeight - 24)
      editor.onMultiTouchStart([{id: 1, x: 32, y}, {id: 2, x: 92, y}])
      editor.onMultiTouchMove([{id: 1, x: 12, y}, {id: 2, x: 112, y}])
      editor.onMultiTouchEnd()
      publish()
      return {before, after: {...editor.canvasTransform}, snapshot: snapshot()}
    },
    hitNode(nodeId) {
      const root = requiredContentRoot()
      const component = root.children.find(({name}) => name === `NodeCanvas.node:${nodeId}`)
      if (component === undefined || !component.visible) throw new Error(`Node ${nodeId} is not a visible retained component`)
      const entry = editor.tree.nodes.find(({node}) => node.id === nodeId)
      if (entry === undefined) throw new Error(`Unknown playground Node ${nodeId}`)
      const pixelScale = retainedLogicalPixelScale(root, editor.canvasTransform)
      const point = {x: entry.rect.x + Math.min(24, entry.rect.w / 2), y: entry.rect.y + Math.min(12, entry.rect.h / 2)}
      const retainedLayer = root.parent
      if (retainedLayer === null) throw new Error("NodeCanvas.contentRoot has no retained layer parent")
      editor.node.updateWorldMatrix(true)
      const local = new Vector3(point.x * pixelScale, -point.y * pixelScale, 0)
        .applyMatrix4(root.matrixWorld)
        .applyMatrix4(new Matrix4().copy(retainedLayer.matrixWorld).invert())
      const surfacePoint = {x: local.x / pixelScale, y: -local.y / pixelScale}
      const before = editor.selection === null ? null : {...editor.selection}
      const down = new MouseEvent("mousedown", {bubbles: true, cancelable: true})
      const up = new MouseEvent("mouseup", {bubbles: true, cancelable: true})
      editor.onPointerDown(down, surfacePoint.x, surfacePoint.y)
      editor.onPointerUp(up, surfacePoint.x, surfacePoint.y)
      const after = editor.selection === null ? null : {...editor.selection}
      publishAfterFrame()
      return {nodeId, before, after, surfacePoint, snapshot: snapshot()}
    },
    select(selection) {
      const accepted = editor.select(selection)
      publishAfterFrame()
      return {accepted, snapshot: snapshot()}
    },
    publish,
    publishAfterFrame,
  })
  return observer
}

const TOOLBAR_SAFE_Y = 46

function linkEvidence(
  editor: RetainedEditor,
  root: Object3D,
  linkId: string,
  objectId: (value: object) => string,
  geometryId: (value: object) => string,
): RetainedLinkEvidence {
  const entry = editor.tree.links.find(({link}) => link.id === linkId)
  if (entry === undefined) throw new Error(`Missing Link ${linkId}`)
  const parent = root.children.find(({name}) => name === `NodeCanvas.link:${linkId}`)
  if (parent === undefined) throw new Error(`Missing retained Link parent ${linkId}`)
  const mesh = firstGeometryObject(parent)
  if (mesh === null || mesh.geometry === undefined) throw new Error(`Missing actual Link geometry ${linkId}`)
  const endpoints = readRibbonEndpointCenters(mesh.geometry)
  if (endpoints === null) throw new Error(`Link geometry ${linkId} has no readable ribbon endpoints`)
  const first = entry.points[0]
  const last = entry.points.at(-1)
  if (first === undefined || last === undefined) throw new Error(`Link ${linkId} has no raw endpoints`)
  const source = socketCenter(editor, entry.link.from.nodeId, entry.link.from.socketId)
  const target = socketCenter(editor, entry.link.to.nodeId, entry.link.to.socketId)
  return {
    id: linkId,
    parentObjectId: objectId(parent),
    geometryObjectId: objectId(mesh),
    geometryId: geometryId(mesh.geometry),
    rawFirstPoint: {...first},
    rawLastPoint: {...last},
    sourceSocketCenter: {...source},
    targetSocketCenter: {...target},
    actualGeometryFirstPoint: endpoints.first,
    actualGeometryLastPoint: endpoints.last,
    framebufferClip: clipBounds(mesh),
  }
}

function socketCenter(editor: RetainedEditor, nodeId: string, socketId: string): Readonly<{x: number; y: number}> {
  const center = editor.tree.nodes.find(({node}) => node.id === nodeId)
    ?.sockets.find(({socket}) => socket.id === socketId)?.center
  if (center === undefined) throw new Error(`Missing Socket center ${nodeId}/${socketId}`)
  return center
}

function firstGeometryObject(parent: Object3D): InspectableObject | null {
  let found: InspectableObject | null = null
  parent.traverse((object) => {
    if (found === null && (object as InspectableObject).geometry !== undefined) found = object as InspectableObject
  })
  return found
}

function retainedLogicalPixelScale(root: Object3D, transform: NodeCanvasTransform): number {
  let geometryScale: number | null = null
  root.traverse((object) => {
    const inspected = object as InspectableObject
    if (geometryScale === null && inspected.geometry !== undefined &&
      Number.isFinite(object.scale.x) && object.scale.x > 0 && object.scale.x < 0.1) {
      geometryScale = object.scale.x
    }
  })
  if (geometryScale !== null) return geometryScale
  if (Math.abs(transform.x) > Number.EPSILON) {
    const actual = Math.abs(root.position.x / transform.x)
    if (Number.isFinite(actual) && actual > 0) return actual
  }
  if (Math.abs(transform.y) > Number.EPSILON) {
    const actual = Math.abs(root.position.y / transform.y)
    if (Number.isFinite(actual) && actual > 0) return actual
  }
  throw new Error("Cannot resolve retained logical pixel scale from actual geometry")
}

function geometriesOf(object: InspectableObject): object[] {
  const geometries = [object.geometry, object.stencilGeometry, object.coverGeometry]
  return geometries.filter((value): value is object => typeof value === "object" && value !== null)
}

function clipBounds(object: InspectableObject): readonly number[] | null {
  const bounds = object.isText === true ? object.clipBounds : object.material?.clipBounds
  return bounds === undefined || bounds === null ? null : [...bounds]
}

/** Reads the center of the first and last paired vertices of an actual Link ribbon. */
export function readRibbonEndpointCenters(geometry: object): Readonly<{
  first: Readonly<{x: number; y: number}>
  last: Readonly<{x: number; y: number}>
}> | null {
  const position = (geometry as GeometryLike).attributes?.position
  const array = position?.array
  if (array === undefined || position?.itemSize !== 3 || array.length < 12 || array.length % 6 !== 0) return null
  const lastLeft = array.length - 6
  const lastRight = array.length - 3
  return {
    first: {x: (Number(array[0]) + Number(array[3])) / 2, y: (Number(array[1]) + Number(array[4])) / 2},
    last: {
      x: (Number(array[lastLeft]) + Number(array[lastRight])) / 2,
      y: (Number(array[lastLeft + 1]) + Number(array[lastRight + 1])) / 2,
    },
  }
}

function worldScale2D(object: Object3D): readonly [number, number] {
  const elements = object.matrixWorld.elements
  return [
    Math.hypot(elements[0]!, elements[1]!, elements[2]!),
    Math.hypot(elements[4]!, elements[5]!, elements[6]!),
  ]
}

function safeRatio(value: number, basis: number): number {
  return basis <= Number.EPSILON ? Number.NaN : value / basis
}
