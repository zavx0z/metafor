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
  add(v: Vector3): this
  clone(): Vector3
  crossVectors(a: Vector3, b: Vector3): this
  dot(v: Vector3): number
  length(): number
  multiplyScalar(s: number): this
  normalize(): this
  set(x: number, y: number, z: number): this
  subVectors(a: Vector3, b: Vector3): this
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
  name: string
  position: Vector3
  rotation: Vector3
  scale: Vector3
  children: Object3D[]
  visible: boolean
  frustumCulled: boolean
  add(child: Object3D): void
  lookAt(target: Vector3): void
  updateMatrix(): void
  updateWorldMatrix(force?: boolean): void
}

export class Scene extends Object3D {
  background: Color
}

export class ViewPoint {
  position: Vector3
  constructor(parameters: ViewPointParameters)
  getTarget(): Vector3
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

export class TextMaterial {
  color: Color
  constructor(parameters?: { color?: number | Color })
}

export class LineSegments extends Object3D {
  geometry: BufferGeometry
  material: LineGlowMaterial
  constructor(geometry: BufferGeometry, material: LineGlowMaterial)
}

export class GridHelper extends LineSegments {
  constructor(size?: number, divisions?: number, colorCenterLine?: number, colorGrid?: number)
}

export class AxesHelper extends LineSegments {
  constructor(size?: number)
}

export class TrueTypeFont {
  unitsPerEm: number
  static fromUrl(url: string): Promise<TrueTypeFont>
  mapCharToGlyph(codepoint: number): number
  getHMetric(gid: number): { advanceWidth: number; lsb: number }
}

export class Text extends Object3D {
  text: string
  font: TrueTypeFont
  material: TextMaterial
  fontSize: number
  letterSpacing: number
  stencilGeometry: BufferGeometry
  coverGeometry: BufferGeometry
  constructor(text: string, font: TrueTypeFont, fontSize: number, material: TextMaterial)
  updateGeometry(): void
}
