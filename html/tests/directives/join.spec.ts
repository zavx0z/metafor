import {describe, test, beforeAll} from "bun:test"
import {html} from "../../html.js"

import {join} from "../../directives/join.js"
import {makeExpectRender} from "@pkg/fixtures/expectExtend.js"

describe("join", () => {
  let container: HTMLDivElement

  const assertRender = makeExpectRender(() => container)

  beforeAll(() => {
    container = document.createElement("div")
  })

  test("with array", () => {
    assertRender(join(["a", "b", "c"], ","), "a,b,c")
  })

  test("with empty array", () => {
    assertRender(join([], ","), "")
  })

  test("with undefined", () => {
    assertRender(join(undefined, ","), "")
  })

  test("with iterable", () => {
    function* iterate<T>(items: Array<T>) {
      for (const i of items) {
        yield i
      }
    }
    assertRender(join(iterate(["a", "b", "c"]), ","), "a,b,c")
  })

  test("passes index", () => {
    assertRender(
      join(
        ["a", "b", "c"],
        i =>
          html`
            <p>${i}</p>
          `
      ),
      "a<p>0</p>b<p>1</p>c"
    )
  })
})
