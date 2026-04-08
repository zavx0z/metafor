export interface ViewPointParameters {
  element: HTMLElement
  fov?: number
  near?: number
  far?: number
  position?: { x: number; y: number; z: number }
  target?: { x: number; y: number; z: number }
}

export interface LineGlowMaterialParameters {
  color?: number | Color
  opacity?: number
  glowIntensity?: number
  glowColor?: number | Color
}

export interface SphereGeometryParameters {
  radius?: number
  widthSegments?: number
  heightSegments?: number
}

export interface TorusGeometryParameters {
  radius?: number
  tube?: number
  radialSegments?: number
  tubularSegments?: number
}

export class Vector3 {
  x: number
  y: number
  z: number
  constructor(x?: number, y?: number, z?: number)
  set(x: number, y: number, z: number): this
}

export class Color {
  r: number
  g: number
  b: number
  a: number
  constructor(r?: number | string | Color, g?: number, b?: number, a?: number)
  clone(): Color
}

export class BufferAttribute {
  array: ArrayLike<number>
  itemSize: number
  count: number
  constructor(array: ArrayLike<number>, itemSize: number, normalized?: boolean)
}

export class BufferGeometry {
  attributes: Record<string, BufferAttribute | undefined>
  index: BufferAttribute | null
  setAttribute(name: string, attribute: BufferAttribute): this
  setIndex(index: BufferAttribute): this
}

export class Object3D {
  position: Vector3
  scale: Vector3
  children: Object3D[]
  add(child: Object3D): void
  updateMatrix(): void
  updateWorldMatrix(force?: boolean): void
}

export class Scene extends Object3D {
  background: Color
}

export class ViewPoint {
  constructor(parameters: ViewPointParameters)
  setAspectRatio(aspect: number): void
  dispose(): void
}

export class Renderer {
  canvas: HTMLCanvasElement | null
  init(canvas?: HTMLCanvasElement): Promise<void>
  setPixelRatio(value: number): void
  setSize(width: number, height: number): void
  render(scene: Scene, viewPoint: ViewPoint): void
}

export class SphereGeometry extends BufferGeometry {
  constructor(parameters?: SphereGeometryParameters)
}

export class TorusGeometry extends BufferGeometry {
  constructor(parameters?: TorusGeometryParameters)
}

export class LineGlowMaterial {
  constructor(parameters?: LineGlowMaterialParameters)
}

export class LineSegments extends Object3D {
  geometry: BufferGeometry
  material: LineGlowMaterial
  constructor(geometry: BufferGeometry, material: LineGlowMaterial)
}

export class GridHelper extends LineSegments {
  constructor(size?: number, divisions?: number, colorCenterLine?: number, colorGrid?: number)
}
