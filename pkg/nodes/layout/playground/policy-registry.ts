import {layoutAdaptiveWithDiagnostics} from "@nodes/layout/adaptive"
import {layoutFixed} from "@nodes/layout/fixed"
import type {PlaygroundPolicy, PlaygroundPolicyId} from "./types.ts"

const fixed: PlaygroundPolicy = {
  id: "fixed",
  label: "Фиксированная",
  description: "Публичная политика фиксированных портов: источники выходят справа (EAST), цели принимают слева (WEST).",
  run(graph) {
    return {
      result: layoutFixed(graph),
      diagnostics: {kind: "fixed", candidateCount: 1},
    }
  },
}

const adaptive: PlaygroundPolicy = {
  id: "adaptive",
  label: "Адаптивная",
  description: "Публичная ограниченная политика: для каждого точного сокета выбирается одна сторона — левая (WEST) или правая (EAST).",
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

export function getPlaygroundPolicy(id: PlaygroundPolicyId): PlaygroundPolicy {
  const policy = PLAYGROUND_POLICIES.find((candidate) => candidate.id === id)
  if (policy === undefined) throw new Error(`Неизвестная политика стенда: ${id}`)
  return policy
}
