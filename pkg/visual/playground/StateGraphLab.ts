export {buildStateGraphBranchLayout} from "../StateGraphLayout.ts"
import {buildStateGraphHermiteEdgePath} from "../StateGraphLayout.ts"
import type {StateGraphEdgeCurveBuilder} from "../StateGraphViewport.ts"

export const createStateGraphHermiteEdgeCurveBuilder =
(): StateGraphEdgeCurveBuilder =>
  (edge, fromNode, toNode) =>
    buildStateGraphHermiteEdgePath(edge, fromNode, toNode)
