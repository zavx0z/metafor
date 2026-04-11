import { describe, expect, test } from "bun:test"
import { isDepthLabelVisible, isShellLabelVisible } from "./label-visibility"

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

  test("shell label на active depth остается видимым для peer shell", () => {
    expect(
      isShellLabelVisible({
        baseDepth: 1,
        depth: 1,
        isActiveShell: false,
        labelVisibleLevels: 2,
      }),
    ).toBe(true)
  })

  test("shell label скрывается только у shell, в который вошли", () => {
    expect(
      isShellLabelVisible({
        baseDepth: 1,
        depth: 1,
        isActiveShell: true,
        labelVisibleLevels: 2,
      }),
    ).toBe(false)
  })
})
