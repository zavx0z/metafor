import {describe, expect, test} from "bun:test"
import {
  buttonSizeMetrics,
  planButtonSize,
  type ButtonElementSize,
} from "./button.ts"

const expectedTiers = Object.freeze({
  small: Object.freeze({height: 18, paddingX: 5, iconPx: 12, fontPx: 10, radius: 3, gap: 2, borderWidth: 1}),
  medium: Object.freeze({height: 22, paddingX: 6, iconPx: 14, fontPx: 11, radius: 4, gap: 3, borderWidth: 1}),
  large: Object.freeze({height: 28, paddingX: 8, iconPx: 18, fontPx: 14, radius: 5, gap: 4, borderWidth: 1}),
})

describe("button size planner", () => {
  test("owns the approved project tiers on top of Blender's single base unit", () => {
    expect(buttonSizeMetrics).toEqual(expectedTiers)
    expect(Object.isFrozen(buttonSizeMetrics)).toBeTrue()
    for (const metrics of Object.values(buttonSizeMetrics)) expect(Object.isFrozen(metrics)).toBeTrue()
  })

  test("plans visible chrome, matching hit and content geometry for every tier", () => {
    const expectations = {
      small: {y: 31, height: 18, paddingX: 5, fontPx: 10, iconPx: 12, radius: 3, gap: 2},
      medium: {y: 29, height: 22, paddingX: 6, fontPx: 11, iconPx: 14, radius: 4, gap: 3},
      large: {y: 26, height: 28, paddingX: 8, fontPx: 14, iconPx: 18, radius: 5, gap: 4},
    } satisfies Readonly<Record<ButtonElementSize, Readonly<{
      y: number
      height: number
      paddingX: number
      fontPx: number
      iconPx: number
      radius: number
      gap: number
    }>>>

    for (const size of Object.keys(expectations) as ButtonElementSize[]) {
      const expected = expectations[size]
      const plan = planButtonSize(10, 20, 100, 40, size, {})
      expect(plan).toEqual({
        chrome: {x: 10, y: expected.y, width: 100, height: expected.height},
        hit: {x: 10, y: expected.y, width: 100, height: expected.height},
        content: {
          x: 10 + expected.paddingX,
          y: expected.y,
          width: 100 - expected.paddingX * 2,
          height: expected.height,
        },
        fontPx: expected.fontPx,
        iconPx: expected.iconPx,
        gap: expected.gap,
        radius: expected.radius,
        borderWidth: 1,
      })
    }
  })

  test("defaults to medium and keeps explicit per-field style overrides stronger", () => {
    expect(planButtonSize(10, 20, 100, 40, undefined, {})).toEqual(
      planButtonSize(10, 20, 100, 40, "medium", {}),
    )

    expect(planButtonSize(10, 20, 100, 40, "small", {
      height: 30,
      paddingLeft: 12,
      paddingRight: 7,
      paddingTop: 2,
      paddingBottom: 3,
      fontSize: 13,
      borderRadius: 8,
      borderWidth: 2,
      gap: 9,
    })).toEqual({
      chrome: {x: 10, y: 25, width: 100, height: 30},
      hit: {x: 10, y: 25, width: 100, height: 30},
      content: {x: 22, y: 27, width: 81, height: 25},
      fontPx: 13,
      iconPx: 12,
      gap: 9,
      radius: 8,
      borderWidth: 2,
    })
  })

  test("constrains the tier to available geometry and clamps content/icon safely", () => {
    expect(planButtonSize(0, 0, 8, 10, "large", {})).toEqual({
      chrome: {x: 0, y: 0, width: 8, height: 10},
      hit: {x: 0, y: 0, width: 8, height: 10},
      content: {x: 8, y: 0, width: 0, height: 10},
      fontPx: 14,
      iconPx: 0,
      gap: 4,
      radius: 5,
      borderWidth: 1,
    })
  })
})
