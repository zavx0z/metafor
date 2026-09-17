import {html, render, svg} from '../../html.js'
import { classMap} from '../../directives/class-map.js'
import {beforeAll, describe, expect, test} from 'bun:test'
import type {ClassInfo} from "../../types/directives.js"

describe('classMap directive', () => {
  let container: HTMLDivElement

  function renderClassMap(cssInfo: ClassInfo) {
    render(html`
      <div class="${classMap(cssInfo)}"></div>`, container)
  }

  function renderClassMapStatic(cssInfo: ClassInfo) {
    render(html`
      <div class="aa ${classMap(cssInfo)} bb"></div>`, container)
  }

  beforeAll(() => {
    container = document.createElement('div')
  })

  test('adds classes', () => {
    renderClassMap({foo: 0, bar: true, zonk: true})
    const el = container.firstElementChild!
    expect(el.classList.contains('foo')).toBe(false)
    expect(el.classList.contains('bar')).toBe(true)
    expect(el.classList.contains('zonk')).toBe(true)
  })

  test('removes classes', () => {
    renderClassMap({foo: true, bar: true, baz: true})
    const el = container.firstElementChild!
    expect(el.classList.contains('foo')).toBe(true)
    expect(el.classList.contains('bar')).toBe(true)
    expect(el.classList.contains('baz')).toBe(true)
    renderClassMap({foo: false, bar: true, baz: false})
    expect(el.classList.contains('foo')).toBe(false)
    expect(el.classList.contains('bar')).toBe(true)
    expect(el.classList.contains('baz')).toBe(false)
  })

  test('removes omitted classes', () => {
    renderClassMap({foo: true, bar: true, baz: true})
    const el = container.firstElementChild!
    expect(el.classList.contains('foo')).toBe(true)
    expect(el.classList.contains('bar')).toBe(true)
    expect(el.classList.contains('baz')).toBe(true)
    renderClassMap({})
    expect(el.classList.contains('foo')).toBe(false)
    expect(el.classList.contains('bar')).toBe(false)
    expect(el.classList.contains('baz')).toBe(false)
    expect(el.classList.length).toBe(0)
  })

  test('works with static classes', () => {
    renderClassMapStatic({foo: true})
    const el = container.firstElementChild!
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)
    expect(el.classList.contains('foo')).toBe(true)
    renderClassMapStatic({})
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)
    expect(el.classList.contains('foo')).toBe(false)
  })

  test('works with imperatively added classes', () => {
    renderClassMap({foo: true})
    const el = container.firstElementChild!
    expect(el.classList.contains('foo')).toBe(true)

    el.classList.add('bar')
    expect(el.classList.contains('bar')).toBe(true)

    renderClassMap({foo: false})
    expect(el.classList.contains('foo')).toBe(false)
    expect(el.classList.contains('bar')).toBe(true)
  })

  test('can not override static classes', () => {
    renderClassMapStatic({aa: false, bb: true})
    const el = container.firstElementChild!
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)

    // bb is explicitly set to false
    renderClassMapStatic({aa: true, bb: false})
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)

    // both are now omitted
    renderClassMapStatic({})
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)
  })

  test('changes classes when used with the same object', () => {
    const classInfo = {foo: true}
    renderClassMapStatic(classInfo)
    const el = container.firstElementChild!
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)
    expect(el.classList.contains('foo')).toBe(true)
    classInfo.foo = false
    renderClassMapStatic(classInfo)
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)
    expect(el.classList.contains('foo')).toBe(false)
  })

  test('adds classes on SVG elements', () => {
    const cssInfo = {foo: 0, bar: true, zonk: true}
    render(svg`<circle class="${classMap(cssInfo)}"></circle>`, container)
    const el = container.firstElementChild!
    const classes = el.getAttribute('class')!.split(' ')
    // Sigh, IE.
    expect(classes.indexOf('foo')).toBe(-1)
    expect(classes.indexOf('bar')).toBeGreaterThan(-1)
    expect(classes.indexOf('zonk')).toBeGreaterThan(-1)
  })

  test('works if there are no spaces next to directive', () => {
    render(html`
      <div class="aa${classMap({bb: true})}cc"></div>`, container)
    const el = container.firstElementChild!
    expect(el.classList.contains('aa')).toBe(true)
    expect(el.classList.contains('bb')).toBe(true)
    expect(el.classList.contains('cc')).toBe(true)
  })

  test('throws when used on non-class attribute', () => {
    expect(() => {
      render(html`
        <div id="${classMap({})}"></div>`, container)
    }).toThrow()
  })

  test('throws when used in attribute with more than 1 part', () => {
    expect(() => {
      render(html`
        <div class="${'hi'} ${classMap({})}"></div>`, container)
    }).toThrow()
  })

  test('throws when used in ChildPart', () => {
    expect(() => {
      render(html`
        <div>${classMap({})}</div>`, container)
    }).toThrow()
  })
})
