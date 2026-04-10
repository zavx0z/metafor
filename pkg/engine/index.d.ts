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
  copy(v: Vector3): this
  clone(): Vector3
  add(v: Vector3): this
  sub(v: Vector3): this
  subVectors(a: Vector3, b: Vector3): this
  multiplyScalar(s: number): this
  dot(v: Vector3): number
  cross(v: Vector3): this
  crossVectors(a: Vector3, b: Vector3): this
  length(): number
  normalize(): this
  fromArray(array: ArrayLike<number>, offset?: number): this
  toArray(array?: number[], offset?: number): number[]
  applyQuaternion(q: import("./src/math/Quaternion").Quaternion): this
  negate(): this
  applyMatrix4(m: import("./src/math/Matrix4").Matrix4): this
  distanceTo(v: Vector3): number
  distanceToSquared(v: Vector3): number
}

export class Color {
  r: number
  g: number
  b: number
  a: number
  constructor(r?: number | string | Color, g?: number, b?: number, a?: number)
  clone(): Color
  copy(c: Color): this
  set(value: number | string): this
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
  toWireframe(): this
  updateMatrix(): void
}

export class Quaternion {
  x: number
  y: number
  z: number
  w: number
  constructor(x?: number, y?: number, z?: number, w?: number)
  setFromAxisAngle(axis: Vector3, angle: number): this
  setFromEuler(x: number, y: number, z: number): this
  multiplyQuaternions(a: Quaternion, b: Quaternion): this
}

export class Matrix4 {
  elements: Float32Array
  constructor()
  identity(): this
  copy(m: Matrix4): this
  multiply(m: Matrix4): this
  multiplyMatrices(a: Matrix4, b: Matrix4): this
  invert(): this
  decompose(position: Vector3, quaternion: Quaternion, scale: Vector3): void
  makePerspective(fov: number, aspect: number, near: number, far: number): this
  makeLookAt(eye: Vector3, target: Vector3, up: Vector3): this
}

export class Object3D {
  name: string
  parent: Object3D | null
  position: Vector3
  rotation: Vector3
  quaternion: Quaternion
  scale: Vector3
  children: Object3D[]
  visible: boolean
  frustumCulled: boolean
  matrixWorld: Matrix4
  add(child: Object3D): void
  remove(child: Object3D): void
  lookAt(target: Vector3): void
  updateMatrix(): void
  updateWorldMatrix(force?: boolean): void
}

export class Scene extends Object3D {
  background: Color
}

export class ViewPoint {
  element: HTMLElement
  fov: number
  near: number
  far: number
  aspect: number
  position: Vector3
  viewMatrix: Matrix4
  projectionMatrix: Matrix4
  constructor(parameters: ViewPointParameters)
  getTarget(): Vector3
  getUp(): Vector3
  alignUpToWorldZ(): void
  updateProjectionMatrix(): void
  update(): void
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

export interface MaterialParameters {
  color?: number | Color
  opacity?: number
  visible?: boolean
  transparent?: boolean
}

export class Material {
  color: Color
  opacity: number
  visible: boolean
  transparent: boolean
  constructor(parameters?: MaterialParameters)
}

export interface LineBasicMaterialParameters extends MaterialParameters {}
export class LineBasicMaterial extends Material {
  constructor(parameters?: LineBasicMaterialParameters)
}

export class LineGlowMaterial extends LineBasicMaterial {
  glowIntensity: number
  glowColor: Color | null
  constructor(parameters?: LineGlowMaterialParameters)
}

export interface TextMaterialParameters extends MaterialParameters {
  color?: number | Color
  opacity?: number
}

export class TextMaterial extends Material {
  readonly isTextMaterial: true
  constructor(parameters?: TextMaterialParameters)
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

export class Ray {
  origin: Vector3
  direction: Vector3
  constructor(origin?: Vector3, direction?: Vector3)
}

export class Raycaster {
  ray: Ray
  constructor(origin?: Vector3, direction?: Vector3)
  set(origin: Vector3, direction: Vector3): void
  intersectObject(object: Object3D, recursive?: boolean): Array<Intersection>
  intersectObjects(objects: Object3D[], recursive?: boolean): Array<Intersection>
}

export interface Intersection {
  distance: number
  point: Vector3
  object: Object3D
  face?: { a: number; b: number; c: number; normal: Vector3 }
}

export class Mesh extends Object3D {
  geometry: BufferGeometry
  material: Material
  constructor(geometry: BufferGeometry, material: Material)
}

export class InstancedMesh extends Object3D {
  geometry: BufferGeometry
  material: Material
  count: number
  constructor(geometry: BufferGeometry, material: Material, count: number)
}

export class WireframeInstancedMesh extends Object3D {
  geometry: BufferGeometry
  material: Material
  count: number
  constructor(geometry: BufferGeometry, material: Material, count: number)
}

export class SkinnedMesh extends Object3D {
  geometry: BufferGeometry
  material: Material
  constructor(geometry: BufferGeometry, material: Material)
}

export class PlaneGeometry extends BufferGeometry {
  constructor(width?: number, height?: number)
}

export class BoxGeometry extends BufferGeometry {
  constructor(width?: number, height?: number, depth?: number)
}

export * from "./src/animation/index.ts"
export * from "./src/materials/index.ts"
export * from "./src/layout/LayoutTypes.ts"
