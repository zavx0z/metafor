import type {PositionedNodeSystem} from "./model.ts"
import {validatePositionedNodeSystem} from "./validation.ts"

export const NODE_SYSTEM_ROUTE_REQUEST_KIND = "ui.node.libavoid.request.v1"
export const NODE_SYSTEM_ROUTE_RESPONSE_KIND = "ui.node.libavoid.response.v1"

export type NodeSystemRouteRequest = Readonly<{
  kind: typeof NODE_SYSTEM_ROUTE_REQUEST_KIND
  layout: PositionedNodeSystem
}>

export type NodeSystemRouteResponse = Readonly<{
  kind: typeof NODE_SYSTEM_ROUTE_RESPONSE_KIND
  layout: PositionedNodeSystem
}>

export function createNodeSystemRouteRequest(layout: PositionedNodeSystem): NodeSystemRouteRequest {
  validatePositionedNodeSystem(layout)
  return {kind: NODE_SYSTEM_ROUTE_REQUEST_KIND, layout}
}

export function createNodeSystemRouteResponse(layout: PositionedNodeSystem): NodeSystemRouteResponse {
  validatePositionedNodeSystem(layout)
  return {kind: NODE_SYSTEM_ROUTE_RESPONSE_KIND, layout}
}

export function parseNodeSystemRouteRequest(value: unknown): NodeSystemRouteRequest {
  const envelope = requireRecord(value, "Libavoid request")
  if (envelope.kind !== NODE_SYSTEM_ROUTE_REQUEST_KIND) throw new Error("Unsupported Libavoid request kind")
  const layout = envelope.layout as PositionedNodeSystem
  validatePositionedNodeSystem(layout)
  return {kind: NODE_SYSTEM_ROUTE_REQUEST_KIND, layout}
}

export function parseNodeSystemRouteResponse(value: unknown): NodeSystemRouteResponse {
  const envelope = requireRecord(value, "Libavoid response")
  if (envelope.kind !== NODE_SYSTEM_ROUTE_RESPONSE_KIND) throw new Error("Unsupported Libavoid response kind")
  const layout = envelope.layout as PositionedNodeSystem
  validatePositionedNodeSystem(layout)
  return {kind: NODE_SYSTEM_ROUTE_RESPONSE_KIND, layout}
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}
