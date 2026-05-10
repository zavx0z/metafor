import { PlaneGeometry } from "./PlaneGeometry"

interface TexturedPlaneGeometryParameters {
  width?: number
  height?: number
}

export class TexturedPlaneGeometry extends PlaneGeometry {
  constructor(parameters: TexturedPlaneGeometryParameters = {}) {
    super({ width: parameters.width, height: parameters.height })
  }
}
