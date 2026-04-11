import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GlassMaterial,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  Vector3,
} from "@metafor/engine"

export interface GlassBillboardParameters {
  borderColor?: Color | number
  borderOpacity?: number
  height?: number
  matte?: number
  opacity?: number
  tintColor?: Color | number
  width?: number
}

const DEFAULT_TINT = new Color(229 / 255, 241 / 255, 252 / 255)
const DEFAULT_BORDER = new Color(184 / 255, 212 / 255, 235 / 255)
const DEFAULT_WORLD_UP = new Vector3(0, 0, 1)
const reusableForward = new Vector3()
const reusableRight = new Vector3()
const reusableUp = new Vector3()
const reusableMatrix = new Matrix4()

const clampUnit = (value: number, fallback: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback

const resolveColor = (value: Color | number | undefined, fallback: Color): Color => {
  if (value instanceof Color) return value.clone()
  if (typeof value === "number") return new Color(value)
  return fallback.clone()
}

const createUnitRectangleOutlineGeometry = (): BufferGeometry => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([
        -0.5, 0.5, 0, 0.5, 0.5, 0,
        0.5, 0.5, 0, 0.5, -0.5, 0,
        0.5, -0.5, 0, -0.5, -0.5, 0,
        -0.5, -0.5, 0, -0.5, 0.5, 0,
      ]),
      3,
    ),
  )
  return geometry
}

export class GlassBillboard extends Object3D {
  public readonly border: LineSegments
  public readonly borderMaterial: LineBasicMaterial
  public readonly material: GlassMaterial
  public readonly panel: Mesh
  public height: number
  public width: number

  constructor(parameters: GlassBillboardParameters = {}) {
    super()

    this.material = new GlassMaterial({
      tintColor: resolveColor(parameters.tintColor, DEFAULT_TINT),
      ...(parameters.opacity !== undefined ? { opacity: parameters.opacity } : {}),
      ...(parameters.matte !== undefined ? { matte: parameters.matte } : {}),
    })

    this.panel = new Mesh(
      new PlaneGeometry({
        width: 1,
        height: 1,
      }),
      this.material,
    )
    this.panel.frustumCulled = false
    this.add(this.panel)

    this.borderMaterial = new LineBasicMaterial({
      color: resolveColor(parameters.borderColor, DEFAULT_BORDER),
      opacity: clampUnit(parameters.borderOpacity ?? 0.28, 0.28),
    })
    this.border = new LineSegments(createUnitRectangleOutlineGeometry(), this.borderMaterial)
    this.border.position.z = 0.8
    this.border.frustumCulled = false
    this.add(this.border)

    this.width = 1
    this.height = 1
    this.setSize(parameters.width ?? 1, parameters.height ?? 1)
  }

  public faceCamera(cameraPosition: Vector3, worldUp: Vector3 = DEFAULT_WORLD_UP): void {
    reusableForward.copy(cameraPosition).sub(this.position)
    if (reusableForward.length() < 1e-6) reusableForward.set(0, -1, 0)
    else reusableForward.normalize()

    reusableRight.copy(worldUp).cross(reusableForward)
    if (reusableRight.length() < 1e-6) reusableRight.set(1, 0, 0).cross(reusableForward)
    reusableRight.normalize()

    reusableUp.crossVectors(reusableForward, reusableRight).normalize()
    const elements = reusableMatrix.elements
    elements[0] = reusableRight.x; elements[1] = reusableRight.y; elements[2] = reusableRight.z; elements[3] = 0
    elements[4] = reusableUp.x; elements[5] = reusableUp.y; elements[6] = reusableUp.z; elements[7] = 0
    elements[8] = reusableForward.x; elements[9] = reusableForward.y; elements[10] = reusableForward.z; elements[11] = 0
    elements[12] = 0; elements[13] = 0; elements[14] = 0; elements[15] = 1
    this.quaternion.setFromRotationMatrix(reusableMatrix)
    this.updateMatrix()
  }

  public setSize(width: number, height: number): void {
    this.width = Math.max(width, 1e-6)
    this.height = Math.max(height, 1e-6)
    this.panel.scale.set(this.width, this.height, 1)
    this.border.scale.set(this.width, this.height, 1)
    this.panel.updateMatrix()
    this.border.updateMatrix()
    this.updateMatrix()
  }

  public setVisual(parameters: GlassBillboardParameters): void {
    if (parameters.tintColor !== undefined) {
      this.material.tintColor.copy(resolveColor(parameters.tintColor, DEFAULT_TINT))
    }
    if (parameters.opacity !== undefined) this.material.opacity = clampUnit(parameters.opacity, this.material.opacity)
    if (parameters.matte !== undefined) this.material.matte = clampUnit(parameters.matte, this.material.matte)
    if (parameters.borderColor !== undefined) {
      this.borderMaterial.color.copy(resolveColor(parameters.borderColor, DEFAULT_BORDER))
    }
    if (parameters.borderOpacity !== undefined) {
      this.borderMaterial.opacity = clampUnit(parameters.borderOpacity, this.borderMaterial.opacity)
    }
  }
}
