import type {LayoutGraph, LayoutResult} from "@nodes/layout"
import {layoutFixed} from "@nodes/layout/fixed"
import type {PlaygroundPolicy} from "./types.ts"

const fixed: PlaygroundPolicy = {
  id: "fixed",
  label: "Fixed",
  description: "Public fixed-port policy: sources leave EAST and targets enter WEST.",
  run(graph: LayoutGraph): LayoutResult {
    return layoutFixed(graph)
  },
}

/**
 * Dev-only registry. A policy is visible in the playground only after its
 * independent public entrypoint exists; the playground never selects an
 * implementation through a production runtime switch.
 */
export const PLAYGROUND_POLICIES: readonly PlaygroundPolicy[] = [fixed]

export function getPlaygroundPolicy(id: string): PlaygroundPolicy {
  const policy = PLAYGROUND_POLICIES.find((candidate) => candidate.id === id)
  if (policy === undefined) throw new Error(`Unknown playground policy: ${id}`)
  return policy
}
