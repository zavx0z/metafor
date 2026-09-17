import {makeExpectRender} from "@pkg/fixtures/expectExtend.ts"
import {html} from "../../html.js"
import {beforeAll, describe, test} from "bun:test"
import {map} from "../../directives/map.js"

describe('map', () => {
  let container: HTMLDivElement

  const assertRender = makeExpectRender(() => container)

  beforeAll(() => {
    container = document.createElement('div')
  })
  test('with array', () => {
    assertRender(
      map(['a', 'b', 'c'], (v) => html`<p>${v}</p>`),
      '<p>a</p><p>b</p><p>c</p>'
    )
  })

  test('with empty array', () => {
    assertRender(
      map([], (v) => html`<p>${v}</p>`),
      ''
    )
  })

  test('with undefined', () => {
    assertRender(
      map(undefined, (v) => html`<p>${v}</p>`),
      ''
    )
  })

  test('with iterable', () => {
    function* iterate<T>(items: Array<T>) {
      for (const i of items) {
        yield i
      }
    }

    assertRender(
      map(iterate(['a', 'b', 'c']), (v) => html`<p>${v}</p>`),
      '<p>a</p><p>b</p><p>c</p>'
    )
  })

  test('passes index', () => {
    assertRender(
      map(['a', 'b', 'c'], (v, i) => html`<p>${v}:${i}</p>`),
      '<p>a:0</p><p>b:1</p><p>c:2</p>'
    )
  })
})
