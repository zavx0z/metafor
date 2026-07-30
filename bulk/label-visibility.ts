type DepthLabelVisibilityOptions = {
  baseDepth: number
  depth: number
  labelVisibleLevels: number
}

type DarkParticleLabelVisibilityOptions = DepthLabelVisibilityOptions & {
  isActiveDarkParticle: boolean
}

export const isDepthLabelVisible = ({
  baseDepth,
  depth,
  labelVisibleLevels,
}: DepthLabelVisibilityOptions): boolean => {
  return depth > baseDepth && depth <= baseDepth + labelVisibleLevels
}

export const isDarkParticleLabelVisible = ({
  baseDepth,
  depth,
  isActiveDarkParticle,
  labelVisibleLevels,
}: DarkParticleLabelVisibilityOptions): boolean => {
  if (isActiveDarkParticle) return false
  if (baseDepth >= 0 && depth === baseDepth) return true
  return isDepthLabelVisible({ baseDepth, depth, labelVisibleLevels })
}
