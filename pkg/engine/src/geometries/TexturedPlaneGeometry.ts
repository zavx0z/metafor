import { PlaneGeometry } from "./PlaneGeometry"

export interface TexturedPlaneGeometryParameters {
  width?: number
  height?: number
}

export class TexturedPlaneGeometry extends PlaneGeometry {
  constructor(parameters: TexturedPlaneGeometryParameters = {}) {
    const planeParameters: TexturedPlaneGeometryParameters = {}
    if (parameters.width !== undefined) planeParameters.width = parameters.width
    if (parameters.height !== undefined) planeParameters.height = parameters.height
    super(planeParameters)
  }
}
