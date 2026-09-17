import {describe, beforeEach, test} from "bun:test"
import {html} from "../../html.js"
import {when} from "../../directives/when.js"
import {makeExpectRender} from "@metafor/fixtures/expectExtend.js"

describe("when", () => {
  let container: HTMLDivElement

  const expectRender = makeExpectRender(() => container)

  beforeEach(() => {
    container = document.createElement("div")
  })

  test("условие истинно с ложным случаем", () => {
    const result = when( true, () => html`X`, () => html`Y` ) // prettier-ignore
    expectRender(result, "X")
  })
  test("условие истинно без ложного случая", () => {
    const result = when( true, () => html`X` ) // prettier-ignore
    expectRender(result, "X")
  })

  test("условие ложно с ложным случаем", () => {
    const result = when( false, () => html`X`, () => html`Y` ) // prettier-ignore
    expectRender(result, "Y")
  })

  test("условие ложно без ложного случая", () => {
    const result = when( false, () => html`X` ) // prettier-ignore
    expectRender(result, "")
  })
})
