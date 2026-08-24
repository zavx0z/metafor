import {describe, expect, test} from "bun:test"
import {planPlaygroundOverview} from "./overview.ts"

describe("playground route overview", () => {
  test("plans one column for a narrow package page", () => {
    const plan = planPlaygroundOverview(480, "Сокеты", "Выберите тип", [
      {id: "boolean"},
      {id: "float"},
      {id: "integer"},
    ])
    expect(new Set(plan.items.map(({frame}) => frame.x)).size).toBe(1)
    expect(plan.items[1]!.frame.y).toBeGreaterThan(plan.items[0]!.frame.y)
    expect(plan.contentHeight).toBeGreaterThan(plan.items.at(-1)!.frame.y)
  })

  test("plans two equal columns for a wide component overview", () => {
    const plan = planPlaygroundOverview(900, "Компоненты", undefined, [
      {id: "button"},
      {id: "pane"},
      {id: "field"},
    ])
    expect(plan.items[0]!.frame.y).toBe(plan.items[1]!.frame.y)
    expect(plan.items[0]!.frame.w).toBe(plan.items[1]!.frame.w)
    expect(plan.items[2]!.frame.y).toBeGreaterThan(plan.items[0]!.frame.y)
  })

  test("rejects duplicate child ids", () => {
    expect(() => planPlaygroundOverview(900, "Компоненты", undefined, [
      {id: "button"},
      {id: "button"},
    ])).toThrow("Duplicate playground overview item")
  })
})
