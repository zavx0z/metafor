import {beforeEach, describe, expect, test} from "bun:test"
import {html, noChange, nothing, render} from "../../html.js"

describe("properties", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })

  test("sets properties", () => {
    render(
      html`
        <div .foo=${123} .Bar=${456}></div>
      `,
      container
    )
    const div = container.querySelector("div")!
    expect((div as any).foo).toBe(123)
    expect((div as any).Bar).toBe(456)
  })

  test("nothing becomes undefined", () => {
    const go = (v: any) =>
      render(
        html`
          <div .foo=${v}></div>
        `,
        container
      )

    go(1)
    const div = container.querySelector("div")!
    expect((div as any).foo).toBe(1)

    go(nothing)
    expect((div as any).foo).toBe(undefined)
  })

  test("noChange does not set property", () => {
    const go = (v: any) =>
      render(
        html`
          <div id="a" .tabIndex=${v}></div>
        `,
        container
      )

    go(noChange)
    const div = container.querySelector("div")!

    // If noChange has been interpreted as undefined, tabIndex would be 0
    expect(div.tabIndex).toBe(-1)
  })

  test("null sets null", () => {
    const go = (v: any) =>
      render(
        html`
          <div .foo=${v}></div>
        `,
        container
      )

    go(null)
    const div = container.querySelector("div")!
    expect((div as any).foo).toBe(null)
  })

  test("null in multiple part sets empty string", () => {
    const go = (v1: any, v2: any) =>
      render(
        html`
          <div .foo="${v1}${v2}"></div>
        `,
        container
      )

    go("hi", null)
    const div = container.querySelector("div")!
    expect((div as any).foo).toBe("hi")
  })

  test("undefined sets undefined", () => {
    const go = (v: any) =>
      render(
        html`
          <div .foo=${v}></div>
        `,
        container
      )

    go(undefined)
    const div = container.querySelector("div")!
    expect((div as any).foo).toBe(undefined)
  })

  test("undefined in multiple part sets empty string", () => {
    const go = (v1: any, v2: any) =>
      render(
        html`
          <div .foo="${v1}${v2}"></div>
        `,
        container
      )

    go("hi", undefined)
    const div = container.querySelector("div")!
    expect((div as any).foo).toBe("hi")
  })

  test("noChange works", () => {
    const go = (v: any) =>
      render(
        html`
          <div .foo=${v}></div>
        `,
        container
      )
    go(1)
    const div = container.querySelector("div")!
    expect((div as any).foo).toBe(1)

    go(noChange)
    expect((div as any).foo).toBe(1)
  })
})
