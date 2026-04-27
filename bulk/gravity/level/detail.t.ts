/**
 * Детализация wireframe-геометрии на одном уровне глубины.
 *
 * Производится из {@link LevelDetailSettings} и ослабевает по глубине
 * через `detailMultiplier = detailDensityFactor / pow(detailLevelMultiplier, depth)`.
 */
export interface LevelDetail {
  depth: number
  detailMultiplier: number
  torusRadialSegments: number
  torusTubularSegments: number
  sphereWidthSegments: number
  sphereHeightSegments: number
}
