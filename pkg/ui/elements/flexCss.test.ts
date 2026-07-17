import {describe, expect, test} from "bun:test"
import {flexColumnCss, flexRowCss, parseUiSize} from "./flexCss.ts"

const collect = () => {
  const calls: Array<[number, number, number, number]> = []
  return {calls, draw: (...a: [number, number, number, number]) => calls.push(a)}
}

describe("parseUiSize", () => {
  test("plain number -> px", () => {
    expect(parseUiSize(120)).toEqual({kind: "px", value: 120})
  })

  test("string percent", () => {
    expect(parseUiSize("42%")).toEqual({kind: "percent", value: 42})
    expect(parseUiSize("18.5%")).toEqual({kind: "percent", value: 18.5})
  })

  test("string fr / grow / auto", () => {
    expect(parseUiSize("1fr")).toEqual({kind: "fr", value: 1})
    expect(parseUiSize("2fr")).toEqual({kind: "fr", value: 2})
    expect(parseUiSize("grow")).toEqual({kind: "fr", value: 1})
    expect(parseUiSize("auto")).toEqual({kind: "fr", value: 1})
  })

  test("object forms", () => {
    expect(parseUiSize({px: 64})).toEqual({kind: "px", value: 64})
    expect(parseUiSize({percent: 42})).toEqual({kind: "percent", value: 42})
    expect(parseUiSize({ratio: 0.42})).toEqual({kind: "percent", value: 42})
    expect(parseUiSize({fr: 3})).toEqual({kind: "fr", value: 3})
  })
})

describe("flexRowCss", () => {
  test("percent splits inner width exactly", () => {
    const {calls, draw} = collect()
    flexRowCss({
      x: 0,
      y: 0,
      w: 1000,
      h: 200,
      items: [
        {width: "42%", draw},
        {width: "58%", draw},
      ],
    })
    expect(calls).toEqual([
      [0, 0, 420, 200],
      [420, 0, 580, 200],
    ])
  })

  test("fixed + 1fr/2fr distributes remaining", () => {
    const {calls, draw} = collect()
    flexRowCss({
      x: 0,
      y: 0,
      w: 1000,
      h: 100,
      items: [
        {width: 240, draw},
        {width: "1fr", draw},
        {width: "2fr", draw},
      ],
    })
    // remaining = 760, 1fr = 253.33..., 2fr = 506.66...
    expect(calls[0]).toEqual([0, 0, 240, 100])
    expect(calls[1]![0]).toBeCloseTo(240)
    expect(calls[1]![2]).toBeCloseTo(760 / 3)
    expect(calls[2]![0]).toBeCloseTo(240 + 760 / 3)
    expect(calls[2]![2]).toBeCloseTo((2 * 760) / 3)
  })

  test("gap is subtracted from main-axis remaining for fr items", () => {
    const {calls, draw} = collect()
    flexRowCss({
      x: 0,
      y: 0,
      w: 1000,
      h: 100,
      gap: 20,
      items: [
        {width: 180, draw},
        {width: "1fr", draw},
        {width: 120, draw},
      ],
    })
    // remaining = 1000 - 180 - 120 - 2*20 = 660
    expect(calls[0]).toEqual([0, 0, 180, 100])
    expect(calls[1]).toEqual([200, 0, 660, 100])
    expect(calls[2]).toEqual([880, 0, 120, 100])
  })

  test("padding shrinks inner box and shifts origin", () => {
    const {calls, draw} = collect()
    flexRowCss({
      x: 10,
      y: 20,
      w: 220,
      h: 80,
      paddingX: 10,
      paddingY: 5,
      items: [
        {width: "50%", draw},
        {width: "50%", draw},
      ],
    })
    expect(calls).toEqual([
      [20, 25, 100, 70],
      [120, 25, 100, 70],
    ])
  })

  test("cross-axis percent uses innerH; alignItems=center centers it", () => {
    const {calls, draw} = collect()
    flexRowCss({
      x: 0,
      y: 0,
      w: 100,
      h: 200,
      alignItems: "center",
      items: [{width: 50, height: "50%", draw}],
    })
    expect(calls).toEqual([[0, 50, 50, 100]])
  })

  test("number remains px (not 0..1 ratio)", () => {
    const {calls, draw} = collect()
    flexRowCss({x: 0, y: 0, w: 1000, h: 100, items: [{width: 0.42, draw}]})
    expect(calls[0]![2]).toBeCloseTo(0.42)
  })

  test("justifyContent applies only when no fr items", () => {
    const {calls, draw} = collect()
    flexRowCss({
      x: 0,
      y: 0,
      w: 100,
      h: 20,
      justifyContent: "center",
      items: [
        {width: 20, draw},
        {width: 20, draw},
      ],
    })
    expect(calls.map((c) => c[0])).toEqual([30, 50])
  })
})

describe("flexColumnCss", () => {
  test("18.5% of 1000 height = 185", () => {
    const {calls, draw} = collect()
    flexColumnCss({
      x: 0,
      y: 0,
      w: 100,
      h: 1000,
      items: [
        {height: "18.5%", draw},
        {height: "grow", draw},
      ],
    })
    expect(calls[0]).toEqual([0, 0, 100, 185])
    expect(calls[1]).toEqual([0, 185, 100, 815])
  })

  test("magazine page split header / body / footer", () => {
    const {calls, draw} = collect()
    flexColumnCss({
      x: 0,
      y: 0,
      w: 600,
      h: 1000,
      items: [
        {height: "12.3%", draw},
        {height: "80.1%", draw},
        {height: "7.6%", draw},
      ],
    })
    expect(calls[0]![3]).toBeCloseTo(123)
    expect(calls[1]![3]).toBeCloseTo(801)
    expect(calls[2]![3]).toBeCloseTo(76)
    expect(calls[0]![1]).toBeCloseTo(0)
    expect(calls[1]![1]).toBeCloseTo(123)
    expect(calls[2]![1]).toBeCloseTo(924)
  })

  test("cross-axis defaults to stretch (innerW)", () => {
    const {calls, draw} = collect()
    flexColumnCss({x: 0, y: 0, w: 200, h: 100, items: [{height: 50, draw}]})
    expect(calls).toEqual([[0, 0, 200, 50]])
  })

  test("alignSelf=center with explicit cross size", () => {
    const {calls, draw} = collect()
    flexColumnCss({
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      items: [{height: 50, width: 80, alignSelf: "center", draw}],
    })
    expect(calls).toEqual([[60, 0, 80, 50]])
  })
})
