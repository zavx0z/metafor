import {describe, expect, test} from "bun:test"
import {flexColumn, flexRow} from "./flex.ts"

describe("flexRow", () => {
  test("distributes grow width after fixed items and gaps", () => {
    const calls: Array<[number, number, number, number]> = []

    flexRow({
      x: 10,
      y: 20,
      w: 100,
      h: 40,
      gap: 10,
      items: [
        {width: 20, height: 10, draw: (...args) => calls.push(args)},
        {width: "grow", height: 12, draw: (...args) => calls.push(args)},
        {width: "grow", height: 14, draw: (...args) => calls.push(args)},
      ],
    })

    expect(calls).toEqual([
      [10, 20, 20, 10],
      [40, 20, 30, 12],
      [80, 20, 30, 14],
    ])
  })

  test("centers fixed-width items when there is no grow item", () => {
    const calls: Array<[number, number, number, number]> = []

    flexRow({
      x: 0,
      y: 0,
      w: 100,
      h: 20,
      gap: 10,
      justifyContent: "center",
      items: [
        {width: 20, height: 10, draw: (...args) => calls.push(args)},
        {width: 20, height: 10, draw: (...args) => calls.push(args)},
      ],
    })

    expect(calls).toEqual([
      [25, 0, 20, 10],
      [55, 0, 20, 10],
    ])
  })

  test("stretches item height on the cross axis", () => {
    const calls: Array<[number, number, number, number]> = []

    flexRow({
      x: 0,
      y: 5,
      w: 30,
      h: 40,
      alignItems: "stretch",
      items: [
        {width: 10, height: 8, draw: (...args) => calls.push(args)},
      ],
    })

    expect(calls).toEqual([[0, 5, 10, 40]])
  })
})

describe("flexColumn", () => {
  test("stretches items to inner width by default", () => {
    const calls: Array<[number, number, number, number]> = []

    flexColumn({
      x: 5,
      y: 7,
      w: 50,
      h: 80,
      paddingX: 5,
      gap: 4,
      items: [
        {height: 10, draw: (...args) => calls.push(args)},
        {height: "grow", draw: (...args) => calls.push(args)},
      ],
    })

    expect(calls).toEqual([
      [10, 7, 40, 10],
      [10, 21, 40, 66],
    ])
  })
})
