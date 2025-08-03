import { beforeEach, describe, expect, test } from "bun:test"
import { html, noChange, nothing, render } from "../.."

describe("булевые атрибуты", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })

  const assertContent = (expected: string) =>
    expect(container.innerHTML, "innerHTML должен совпадать с ожидаемым").toMatchStringHTMLStripComments(expected)

  test("добавляет атрибуты для значения true", () => {
    render(html` <div ?foo=${true}></div> `, container)
    assertContent('<div foo=""></div>')
  })

  test("удаляет атрибуты для значения false", () => {
    render(html` <div ?foo=${false}></div> `, container)
    assertContent("<div></div>")
  })

  test("удаляет атрибуты для значения nothing", () => {
    const go = (v: any) => render(html` <div ?foo=${v}></div> `, container)

    go(nothing)
    assertContent("<div></div>")

    go(true)
    assertContent('<div foo=""></div>')

    go(nothing)
    assertContent("<div></div>")
  })

  test("noChange работает", () => {
    const go = (v: any) => render(html` <div ?foo=${v}></div> `, container)
    go(true)
    assertContent('<div foo=""></div>')
    const observer = new MutationObserver(() => {})
    observer.observe(container, { attributes: true, subtree: true })
    go(noChange)
    assertContent('<div foo=""></div>')
    expect(observer.takeRecords(), "observer.takeRecords должен быть пустым массивом").toEqual([])
  })

  test("привязка undefined удаляет атрибут", () => {
    const go = (v: unknown) => render(html` <div ?foo=${v}></div> `, container)
    go(undefined)
    assertContent("<div></div>")
    // не должен изменять атрибут
    go(undefined)
    assertContent("<div></div>")
    // должен удалять атрибут
    go(true)
    assertContent('<div foo=""></div>')
    go(undefined)
    assertContent("<div></div>")
  })
})
