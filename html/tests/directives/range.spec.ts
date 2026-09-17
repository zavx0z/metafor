import {describe, expect, test} from "bun:test"
import {range} from "../../directives/range"

describe("range", () => {
  test("positive end", () => {
    expect([...range(0)]).toEqual([])
    expect([...range(3)]).toEqual([0, 1, 2])
  })

  test("start and end", () => {
    expect([...range(0, 3)]).toEqual([0, 1, 2])
    expect([...range(-1, 1)]).toEqual([-1, 0])
    expect([...range(-2, -1)]).toEqual([-2])
  })

  test("end < start", () => {
    // Этот случай проверяет, что мы не вызываем бесконечный цикл
    expect([...range(2, 1)]).toEqual([])
  })

  test("custom step", () => {
    expect([...range(0, 10, 3)]).toEqual([0, 3, 6, 9])
  })

  test("negative step", () => {
    expect([...range(0, -3, -1)]).toEqual([0, -1, -2])
    // Этот случай проверяет, что мы не вызываем бесконечный цикл
    expect([...range(0, 10, -1)]).toEqual([])
  })
})
