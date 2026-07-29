export {buildStateGraphBranchLayout} from "../StateGraphLayout.ts"
import type {StateGraphEdgeCurveBuilder} from "../StateGraphViewport.ts"
import {resolveSelfSimilarTorusForm} from "../Torus.ts"
import {buildHermiteBeamModel} from "./EdgesLab.ts"

export const createStateGraphHermiteEdgeCurveBuilder =
(): StateGraphEdgeCurveBuilder =>
  (edge, fromNode, toNode) => {
    const dx = toNode.x - fromNode.x
    const dy = toNode.y - fromNode.y
    const span = Math.max(Number.EPSILON, Math.hypot(dx, dy))
    const axisX = dx / span
    const axisY = dy / span
    const torus = resolveSelfSimilarTorusForm(
      Math.max(fromNode.radius, toNode.radius),
    )
    const model = buildHermiteBeamModel({
      centerDistance: span,
      clearance: 0,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      rightSphereX: 0,
      rightSphereY: 0,
      sphereRadius: 0,
      torusRadius: torus.radius,
      torusTube: torus.tube,
    }, 64)

    return model.curve.map((point) => {
      const distanceFromStart = point.x + span / 2
      return {
        x: fromNode.x + axisX * distanceFromStart,
        y: fromNode.y + axisY * distanceFromStart,
        z: fromNode.z + point.z * (edge.returning ? -1 : 1),
      }
    })
  }
