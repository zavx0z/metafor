import {layoutAdaptiveWithDiagnostics} from "@nodes/layout/adaptive"
import {layoutFixed} from "@nodes/layout/fixed"
import type {PlaygroundPolicy} from "./types.ts"

const fixed: PlaygroundPolicy = {
  id: "fixed",
  label: "Fixed",
  description: "Public fixed-port policy: sources leave EAST and targets enter WEST.",
  run(graph) {
    return {
      result: layoutFixed(graph),
      diagnostics: {kind: "fixed", candidateCount: 1},
    }
  },
}

const adaptive: PlaygroundPolicy = {
  id: "adaptive",
  label: "Adaptive",
  description: "Public bounded policy: one WEST/EAST side is selected per exact socket.",
  run(graph) {
    const outcome = layoutAdaptiveWithDiagnostics(graph)
    return {result: outcome.result, diagnostics: outcome.diagnostics}
  },
}

/**
 * Dev-only registry. A policy is visible in the playground only after its
 * independent public entrypoint exists; the playground never selects an
 * implementation through a production runtime switch.
 */
export const PLAYGROUND_POLICIES: readonly PlaygroundPolicy[] = [fixed, adaptive]

export function getPlaygroundPolicy(id: string): PlaygroundPolicy {
  const policy = PLAYGROUND_POLICIES.find((candidate) => candidate.id === id)
  if (policy === undefined) throw new Error(`Unknown playground policy: ${id}`)
  return policy
}
