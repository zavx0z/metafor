import type {NodeSystemLayoutDirection} from "nodes/types"

/** Product law: the graph follows the actual display orientation. */
export function hamiltonianLayoutDirection(
  viewport: Readonly<{width: number; height: number}>,
): NodeSystemLayoutDirection {
  const width = finitePositive(viewport.width)
  const height = finitePositive(viewport.height)
  return width >= height ? "RIGHT" : "DOWN"
}

/** Exact responsive input: same orientation with another size still needs compaction. */
export function hamiltonianLayoutViewportKey(
  viewport: Readonly<{width: number; height: number}>,
): string {
  const width = finitePositive(viewport.width)
  const height = finitePositive(viewport.height)
  return `${hamiltonianLayoutDirection({width, height})}:${width}x${height}`
}

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}
