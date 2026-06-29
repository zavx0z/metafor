import { describe, expect, test } from "bun:test"
import { isDarkParticleLabelVisible, isDepthLabelVisible } from "./label-visibility"

describe("bulk label visibility", () => {
  test("depth window скрывает текущий baseDepth для обычного depth-правила", () => {
    expect(
      isDepthLabelVisible({
        baseDepth: 1,
        depth: 1,
        labelVisibleLevels: 2,
      }),
    ).toBe(false)
  })

  test("Dark particle label на active depth остается видимым для peer Dark particle", () => {
    expect(
      isDarkParticleLabelVisible({
        baseDepth: 1,
        depth: 1,
        isActiveDarkParticle: false,
        labelVisibleLevels: 2,
      }),
    ).toBe(true)
  })

  test("Dark particle label скрывается только у Dark particle, в который вошли", () => {
    expect(
      isDarkParticleLabelVisible({
        baseDepth: 1,
        depth: 1,
        isActiveDarkParticle: true,
        labelVisibleLevels: 2,
      }),
    ).toBe(false)
  })
})
