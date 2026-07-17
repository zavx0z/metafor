import {describe, expect, test} from "bun:test"
import {liY, ulContentHeight} from "./list.ts"

describe("ul/li layout helpers", () => {
  test("computes content height from item count, padding and gaps", () => {
    expect(ulContentHeight(3, {itemHeight: 40, itemGap: 4, paddingTop: 6, paddingBottom: 10})).toBe(144)
  })

  test("keeps empty ul height to padding", () => {
    expect(ulContentHeight(0, {paddingTop: 6, paddingBottom: 10})).toBe(16)
  })

  test("computes stable row y positions", () => {
    expect(liY(2, {startY: 8, itemHeight: 44, itemGap: 6})).toBe(108)
  })
})
