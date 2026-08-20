import {describe, expect, test} from "bun:test"
import {
  input,
  type StyleProps,
  type UiSurface,
  UiSurface as BaseUiSurface,
  uiShapeMetrics,
  Z,
} from "@ui/elements"
import {
  ControlGroup,
  type ControlGroupContext,
} from "./ControlGroup.ts"
import {ControlGroup as PublicControlGroup} from "./index.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override pushClip(): void {}

  override popClip(): void {}

  protected render(): void {}
}

describe("public ControlGroup", () => {
  test("publishes one Components-owned borderless cell contract", () => {
    const contexts: ControlGroupContext[] = []
    const surface = new RecordingSurface()
    ControlGroup(surface, 0, 0, 100, 22, {children: (context) => contexts.push(context)})

    expect(PublicControlGroup).toBe(ControlGroup)
    expect(contexts[0]?.cellStyle).toEqual({
      borderRadius: 0,
      borderWidth: 0,
      fontSize: uiShapeMetrics.compactFontPx,
    } satisfies StyleProps)
    expect(Object.isFrozen(contexts[0]?.cellStyle)).toBeTrue()
    expect(contexts[0]?.cell(0, 0).inputAppearance).toEqual({
      kind: "grouped-cell",
      corners: {topLeft: true, topRight: true, bottomLeft: true, bottomRight: true},
    })
  })

  test("owns one low-radius outer chrome and exact row and column separators", () => {
    const surface = new RecordingSurface()
    ControlGroup(surface, 10, 20, 120, 66, {rows: 3, columns: 2})

    const outer = surface.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)
    expect(outer.map((call) => ({
      x: call[0],
      y: call[1],
      width: call[2],
      height: call[3],
      radius: call[4].radius,
      borderWidth: call[4].borderWidth,
      z: call[4].z,
    }))).toEqual([
      {x: 10, y: 20, width: 120, height: 66, radius: 4, borderWidth: 0, z: Z.CONTAINER},
      {x: 10, y: 20, width: 120, height: 66, radius: 4, borderWidth: 1, z: Z.ELEMENT_RULE},
    ])
    const rules = surface.roundedRects.filter((call) => call[4].radius === 0)
    expect(rules.map((call) => ({x: call[0], y: call[1], width: call[2], height: call[3], z: call[4].z}))).toEqual([
      {x: 10, y: 41.5, width: 120, height: 1, z: Z.ELEMENT_RULE},
      {x: 10, y: 63.5, width: 120, height: 1, z: Z.ELEMENT_RULE},
      {x: 69.5, y: 20, width: 1, height: 66, z: Z.ELEMENT_RULE},
    ])
  })

  test("owns unequal grow/action tracks without a caller gap", () => {
    const surface = new RecordingSurface()
    ControlGroup(surface, 4, 6, 120, 22, {columns: ["grow", 22]})

    const rules = surface.roundedRects.filter((call) => call[4].radius === 0)
    expect(rules.map((call) => call.slice(0, 4))).toEqual([
      [101.5, 6, 1, 22],
    ])
  })

  test("keeps ordinary group composition on Elements and Flex instead of direct Surface rules", async () => {
    const source = await Bun.file(new URL("./ControlGroup.ts", import.meta.url)).text()
    expect(source).toContain("flexColumn({")
    expect(source).toContain("flexRow({")
    expect(source).toContain("div(surface")
    expect(source).not.toContain("surface.drawRect")
  })

  test("fills a middle active cell exactly to shared separators", () => {
    const surface = new RecordingSurface()
    ControlGroup(surface, 0, 0, 100, 66, {
      rows: 3,
      children(group) {
        input(surface, 0, 22, 100, 22, {
          key: "middle",
          value: "1",
          appearance: group.cell(1, 0).inputAppearance,
          style: group.cellStyle,
          active: true,
          cursorVisible: false,
        })
      },
    })

    expect(surface.roundedRects[1]?.slice(0, 4)).toEqual([0, 22, 100, 22])
    expect(surface.roundedRects[1]?.[4]).toMatchObject({radius: 0, borderWidth: 0})
  })

  test("rounds only true outer corners without shrinking active corner cells", () => {
    const surface = new RecordingSurface()
    ControlGroup(surface, 0, 0, 120, 44, {
      rows: 2,
      columns: 2,
      children(group) {
        input(surface, 0, 0, 60, 22, {
          key: "top-left",
          value: "1",
          appearance: group.cell(0, 0).inputAppearance,
          style: group.cellStyle,
          active: true,
          cursorVisible: false,
        })
        input(surface, 60, 22, 60, 22, {
          key: "bottom-right",
          value: "1",
          appearance: group.cell(1, 1).inputAppearance,
          style: group.cellStyle,
          active: true,
          cursorVisible: false,
        })
      },
    })

    expect(surface.roundedRects.some((call) => call.slice(0, 4).toString() === [2, 2, 56, 18].toString())).toBeFalse()
    const cornerPatches = surface.roundedRects.filter((call) => call[2] === 8 && call[3] === 8 && call[4].radius === 4)
    expect(cornerPatches.map((call) => call.slice(0, 4))).toEqual([
      [0, 0, 8, 8],
      [112, 36, 8, 8],
    ])

    const topLeftActive = surface.roundedRects.slice(1, 7)
    expect(Math.min(...topLeftActive.map((call) => call[0]))).toBe(0)
    expect(Math.min(...topLeftActive.map((call) => call[1]))).toBe(0)
    expect(Math.max(...topLeftActive.map((call) => call[0] + call[2]))).toBe(60)
    expect(Math.max(...topLeftActive.map((call) => call[1] + call[3]))).toBe(22)
  })
})
