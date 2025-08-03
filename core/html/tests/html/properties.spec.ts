import { beforeEach, describe, expect, test } from "bun:test"
import { html, noChange, nothing, render } from "../.."

describe("свойства", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })

  test("устанавливает свойства", () => {
    render(html` <div .foo=${123} .Bar=${456}></div> `, container)
    const div = container.querySelector("div")!
    expect((div as any).foo, "foo должен быть 123").toBe(123)
    expect((div as any).Bar, "Bar должен быть 456").toBe(456)
  })

  test("nothing становится undefined", () => {
    const go = (v: any) => render(html` <div .foo=${v}></div> `, container)

    go(1)
    const div = container.querySelector("div")!
    expect((div as any).foo, "foo должен быть 1").toBe(1)

    go(nothing)
    expect((div as any).foo, "foo должен быть undefined").toBe(undefined)
  })

  test("noChange не устанавливает свойство", () => {
    const go = (v: any) => render(html` <div id="a" .tabIndex=${v}></div> `, container)

    go(noChange)
    const div = container.querySelector("div")!

    // Если noChange был интерпретирован как undefined, tabIndex будет 0
    expect(div.tabIndex, "tabIndex должен быть -1").toBe(-1)
  })

  test("null устанавливает null", () => {
    const go = (v: any) => render(html` <div .foo=${v}></div> `, container)

    go(null)
    const div = container.querySelector("div")!
    expect((div as any).foo, "foo должен быть null").toBe(null)
  })

  test("null в нескольких частях устанавливает пустую строку", () => {
    const go = (v1: any, v2: any) => render(html` <div .foo="${v1}${v2}"></div> `, container)

    go("hi", null)
    const div = container.querySelector("div")!
    expect((div as any).foo, "foo должен быть 'hi'").toBe("hi")
  })

  test("undefined устанавливает undefined", () => {
    const go = (v: any) => render(html` <div .foo=${v}></div> `, container)

    go(undefined)
    const div = container.querySelector("div")!
    expect((div as any).foo, "foo должен быть undefined").toBe(undefined)
  })

  test("undefined в нескольких частях устанавливает пустую строку", () => {
    const go = (v1: any, v2: any) => render(html` <div .foo="${v1}${v2}"></div> `, container)

    go("hi", undefined)
    const div = container.querySelector("div")!
    expect((div as any).foo, "foo должен быть 'hi'").toBe("hi")
  })

  test("noChange работает", () => {
    const go = (v: any) => render(html` <div .foo=${v}></div> `, container)
    go(1)
    const div = container.querySelector("div")!
    expect((div as any).foo, "foo должен быть 1").toBe(1)

    go(noChange)
    expect((div as any).foo, "foo должен быть 1").toBe(1)
  })
})
