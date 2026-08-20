import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {li, liY, ulContentHeight} from "./list.ts"

type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly hits: HitCall[] = []
  override hit(...args: HitCall): void { this.hits.push(args) }
  protected render(): void {}
}

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

  test("uses pointer only for a real click or pointer action", () => {
    const tooltip = new RecordingSurface()
    li(tooltip, 0, 0, 100, 24, {tooltip: "Description"})
    expect(tooltip.hits[0]?.[5]).toMatchObject({cursor: "default", tooltip: {label: "Description"}})

    const hoverOnly = new RecordingSurface()
    li(hoverOnly, 0, 0, 100, 24, {onPointerEnter() {}})
    expect(hoverOnly.hits[0]?.[5]).toMatchObject({cursor: "default"})

    const clickable = new RecordingSurface()
    li(clickable, 0, 0, 100, 24, {onClick() {}})
    expect(clickable.hits[0]?.[5]).toMatchObject({cursor: "pointer"})
  })
})
