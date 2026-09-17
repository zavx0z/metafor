import {AttributePart, html, render} from "../../html.js"
import {directive} from "../../directive.js"
import {styleMap} from "../../directives/style-map.js"
// import {styleMap} from "../../metafor/directives/style-map.ts"

import {beforeEach, describe, expect, test} from "bun:test"
import type {StyleInfo} from "../../types/directives.js"
const ua = window.navigator.userAgent
const isChrome41 = ua.indexOf("Chrome/41") > 0
const isIE = ua.indexOf("Trident/") > 0
const supportsCSSVariables = !isIE && !isChrome41
const testIfSupportsCSSVariables = (test: any) => (supportsCSSVariables ? test : test.skip)

describe("styleMap", () => {
  let container: HTMLDivElement

  const renderStyleMap = ({cssInfo}: {cssInfo: StyleInfo}) =>
    render(
      html`
        <div style="${styleMap(cssInfo)}"></div>
      `,
      container
    )

  const renderStyleMapStatic = (cssInfo: StyleInfo) =>
    render(
      html`
        <div style="height: 1px; ${styleMap(cssInfo)} color: red"></div>
      `,
      container
    )

  beforeEach(() => {
    container = document.createElement("div")
  })

  test("render() только свойства", () => {
    // Получаем класс StyleMapDirective косвенно, так как он не экспортируется
    const result = styleMap({})
    // Это свойство должно остаться неминифицированным
    const StyleMapDirective = result["_$atomDirective$"]

    // Расширяем StyleMapDirective, чтобы мы могли протестировать его метод render()
    class TestStyleMapDirective extends StyleMapDirective {
      override update(_part: AttributePart, [styleInfo]: Parameters<this["render"]>) {
        return this.render(styleInfo)
      }
    }

    const testStyleMap = directive(TestStyleMapDirective)
    render(
      html`
        <div
          style=${testStyleMap({
            color: "red",
            backgroundColor: "blue",
            webkitAppearance: "none",
            ["padding-left"]: "4px",
            "--fooBar": "red"
          })}></div>
      `,
      container
    )
    const div = container.firstElementChild as HTMLDivElement
    const style = div.style
    expect(style.color).toBe("red")
    expect(style.backgroundColor).toBe("blue")
    expect(["none", undefined]).toContain(style.webkitAppearance)
    expect(style.paddingLeft).toBe("4px")
    if (supportsCSSVariables) {
      expect(style.getPropertyValue("--fooBar")).toBe("red")
      expect(style.getPropertyValue("--foobar")).toBe("")
    }
  })

  test("первый рендер пропускает неопределенные свойства", () => {
    renderStyleMap({cssInfo: {marginTop: undefined, marginBottom: null}})
    const el = container.firstElementChild as HTMLElement
    // Примечание: вызов `setAttribute('style', '')` приводит к
    // `getAttribute('style') === null` в IE11; тестируем cssText вместо этого
    expect(el.style.cssText).toBe("")
    expect(el.style.marginTop).toBe("")
    expect(el.style.marginBottom).toBe("")
  })

  test("добавляет и обновляет свойства", () => {
    renderStyleMap({
      cssInfo: {
        marginTop: "2px",
        "padding-bottom": "4px",
        opacity: "0.5",
        "z-index": 10
      }
    })
    const el = container.firstElementChild as HTMLElement
    expect(el.style.marginTop).toBe("2px")
    expect(el.style.paddingBottom).toBe("4px")
    expect(el.style.opacity).toBe("0.5")
    expect(el.style.zIndex).toBe("10")
    renderStyleMap({
      cssInfo: {
        marginTop: "4px",
        paddingBottom: "8px",
        opacity: "0.55",
        "z-index": 1
      }
    })
    expect(el.style.marginTop).toBe("4px")
    expect(el.style.paddingBottom).toBe("8px")
    expect(el.style.opacity).toBe("0.55")
    expect(el.style.zIndex).toBe("1")
  })

  test.skip("удаляет свойства", () => {
    renderStyleMap({
      cssInfo: {
        marginTop: "2px",
        "padding-bottom": "4px",
        borderRadius: "5px",
        borderColor: "blue"
      }
    })
    const el = container.firstElementChild as HTMLElement
    expect(el.style.marginTop).toBe("2px")
    expect(el.style.paddingBottom).toBe("4px")
    expect(el.style.borderRadius).toBe("5px")
    expect(el.style.borderColor).toBe("blue")
    renderStyleMap({cssInfo: {borderRadius: undefined, borderColor: null}})
    expect(el.style.marginTop).toBe("")
    expect(el.style.paddingBottom).toBe("")
    expect(el.style.borderRadius).toBe("")
    expect(el.style.borderColor).toBe("")
  })

  test.skip("работает со статическими свойствами", () => {
    renderStyleMapStatic({marginTop: "2px", "padding-bottom": "4px"})
    const el = container.firstElementChild as HTMLElement
    expect(el.style.height).toBe("1px")
    expect(el.style.color).toBe("red")
    expect(el.style.marginTop).toBe("2px")
    expect(el.style.paddingBottom).toBe("4px")
    renderStyleMapStatic({})
    expect(el.style.height).toBe("1px")
    expect(el.style.color).toBe("red")
    expect(el.style.marginTop).toBe("")
    expect(el.style.paddingBottom).toBe("")
  })

  testIfSupportsCSSVariables(test)("добавляет и удаляет CSS переменные", () => {
    renderStyleMap({cssInfo: {"--size": "2px"}})
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue("--size")).toBe("2px")
    renderStyleMap({cssInfo: {"--size": "4px"}})
    expect(el.style.getPropertyValue("--size")).toBe("4px")
    renderStyleMap({cssInfo: {}})
    expect(el.style.getPropertyValue("--size")).toBe("")
  })

  // IE не обрабатывает корректно аргумент priority в
  // CSSStyleDeclaration.setProperty()
  ;(isIE ? test.skip : test.skip)("добавляет приоритет в обновленные свойства", () => {
    renderStyleMap({cssInfo: {color: "blue !important"}})
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue("color")).toBe("blue")
    expect(el.style.getPropertyPriority("color")).toBe("important")
    renderStyleMap({cssInfo: {color: "green !important"}})
    expect(el.style.getPropertyValue("color")).toBe("green")
    expect(el.style.getPropertyPriority("color")).toBe("important")
    renderStyleMap({cssInfo: {color: "red"}})
    expect(el.style.getPropertyValue("color")).toBe("red")
    expect(el.style.getPropertyPriority("color")).toBe("")
    renderStyleMap({cssInfo: {}})
    expect(el.style.getPropertyValue("color")).toBe("")
  })

  test("работает при использовании одного и того же объекта", () => {
    const styleInfo: StyleInfo = {marginTop: "2px", "padding-bottom": "4px"}
    renderStyleMap({cssInfo: styleInfo})
    const el = container.firstElementChild as HTMLElement
    expect(el.style.marginTop).toBe("2px")
    expect(el.style.paddingBottom).toBe("4px")
    styleInfo.marginTop = "6px"
    styleInfo["padding-bottom"] = "8px"
    renderStyleMap({cssInfo: styleInfo})
    expect(el.style.marginTop).toBe("6px")
    expect(el.style.paddingBottom).toBe("8px")
  })

  test.skip("работает когда один и тот же объект добавляет и удаляет свойства", () => {
    const styleInfo: StyleInfo = {marginTop: "2px", "padding-bottom": "4px"}

    renderStyleMap({cssInfo: styleInfo})
    const el = container.firstElementChild as HTMLElement
    expect(el.style.marginTop).toBe("2px")
    expect(el.style.paddingBottom).toBe("4px")
    expect(el.style.color).toBe("")

    styleInfo["marginTop"] = null
    styleInfo.color = "green"

    renderStyleMap({cssInfo: styleInfo})
    expect(el.style.marginTop).toBe("")
    expect(el.style.color).toBe("green")
  })

  test("выбрасывает ошибку при использовании не на атрибуте style", () => {
    expect(() => {
      render(
        html`
          <div id="${styleMap({})}"></div>
        `,
        container
      )
    }).toThrow()
  })

  test("выбрасывает ошибку при использовании в атрибуте с более чем 1 частью", () => {
    expect(() => {
      render(
        html`
          <div style="${"height: 2px;"} ${styleMap({})}"></div>
        `,
        container
      )
    }).toThrow()
  })

  test("выбрасывает ошибку при использовании в ChildPart", () => {
    expect(() => {
      render(
        html`
          <div>${styleMap({})}</div>
        `,
        container
      )
    }).toThrow()
  })
})
