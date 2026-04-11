export interface DepthLabelVisibilityOptions {
  baseDepth: number
  depth: number
  labelVisibleLevels: number
}

export interface ShellLabelVisibilityOptions extends DepthLabelVisibilityOptions {
  isActiveShell: boolean
}

export const isDepthLabelVisible = ({
  baseDepth,
  depth,
  labelVisibleLevels,
}: DepthLabelVisibilityOptions): boolean => {
  return depth > baseDepth && depth <= baseDepth + labelVisibleLevels
}

export const isShellLabelVisible = ({
  baseDepth,
  depth,
  isActiveShell,
  labelVisibleLevels,
}: ShellLabelVisibilityOptions): boolean => {
  if (isActiveShell) return false
  if (baseDepth >= 0 && depth === baseDepth) return true
  return isDepthLabelVisible({ baseDepth, depth, labelVisibleLevels })
}
