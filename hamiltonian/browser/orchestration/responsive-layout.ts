import type {NodeSystemLayoutDirection} from "@ui/node"

/** Product law: the graph follows the actual display orientation. */
export function hamiltonianLayoutDirection(
  viewport: Readonly<{width: number; height: number}>,
): NodeSystemLayoutDirection {
  const width = finitePositive(viewport.width)
  const height = finitePositive(viewport.height)
  return width >= height ? "RIGHT" : "DOWN"
}

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}
