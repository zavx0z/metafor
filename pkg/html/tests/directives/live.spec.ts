import {beforeAll, describe, expect, test} from "bun:test"
import {live} from "../../directives/live.js"
import {html, noChange, nothing, render} from "../../html.js"

class LiveTester extends HTMLElement {
  _x?: string
  _setCount = 0

  get x(): string | undefined {
    return this._x
  }

  set x(v: string | undefined) {
    this._x = v
    this._setCount++
  }
}
customElements.define("live-tester", LiveTester)

describe("live директива", () => {
  let container: HTMLDivElement

  beforeAll(() => {
    container = document.createElement("div")
  })

  describe("свойства", () => {
    test("live() полезен: привязки свойств игнорируют внешние изменения", () => {
      // prettier-ignore
      const go = (x: string) => render(html`<input .value="${x}" />`, container)
      go("a")
      const el = container.firstElementChild as HTMLInputElement
      el.value = "b"
      go("a")
      expect(el.value).toBe("b")
    })

    test("обновляет свойство установленное извне", () => {
      // prettier-ignore
      const go = (x: string) => render(html`<input .value="${live(x)}" />}`, container)
      go("a")
      const el = container.firstElementChild as HTMLInputElement
      el.value = "b"
      go("a")
      expect(el.value).toBe("a")
    })

    test("не устанавливает неизмененное свойство", () => {
      // prettier-ignore
      const go = (x: string) => render(html`<live-tester .x="${live(x)}"></live-tester>}`, container)
      go("a")
      const el = container.firstElementChild as LiveTester
      expect(el.x).toBe("a")
      expect(el._setCount).toBe(1)
      go("a")
      expect(el.x).toBe("a")
      expect(el._setCount).toBe(1)
    })

    test("noChange работает", () => {
      // prettier-ignore
      const go = (x: unknown) => render(html`<input .value="${live(x)}" />}`, container)
      go("a")
      const el = container.firstElementChild as HTMLInputElement
      el.value = "b"
      go(noChange)
      expect(el.value).toBe("b")
    })
  })

  describe("атрибуты", () => {
    test("обновляет атрибут установленный извне", () => {
      // prettier-ignore
      const go = (x: string) => render(html`<div class="${live(x)}">}</div>`, container)
      go("a")
      const el = container.firstElementChild as HTMLDivElement
      el.className = "b"
      go("a")
      expect(el.getAttribute("class")).toBe("a")
    })

    test("не устанавливает неизмененный атрибут", async () => {
      let mutationCount = 0
      const observer = new MutationObserver(records => {
        mutationCount += records.length
      })
      // prettier-ignore
      const go = (x: string) => render(html`<div x="${live(x)}"></div>`, container)
      go("a")
      const el = container.firstElementChild as LiveTester
      expect(el.getAttribute("x")).toBe("a")

      observer.observe(el, {attributes: true})

      go("b")
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(el.getAttribute("x")).toBe("b")
      expect(mutationCount).toBe(1)

      go("b")
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(el.getAttribute("x")).toBe("b")
      expect(mutationCount).toBe(1)
    })

    test("удаляет атрибут при значении nothing", () => {
      // prettier-ignore
      const go = (x: any) => render(html`<div class="${live(x)}">}</div>`, container)
      go("a")
      const el = container.firstElementChild as HTMLDivElement
      el.className = "b"
      go(nothing)
      expect(el.hasAttribute("class")).toBe(false)
    })

    test("noChange работает", () => {
      // prettier-ignore
      const go = (x: any) => render(html`<div class="${live(x)}">}</div>`, container)
      go("a")
      const el = container.firstElementChild as HTMLDivElement
      el.className = "b"
      go(noChange)
      expect(el.getAttribute("class")).toBe("b")
    })

    test("не устанавливает неизмененный атрибут со значением не строкового типа", async () => {
      let mutationCount = 0
      const observer = new MutationObserver(records => {
        mutationCount += records.length
      })
      // prettier-ignore
      const go = (x: number) => render(html`<div x="${live(x)}"></div>`, container)
      go(1)
      const el = container.firstElementChild as LiveTester
      expect(el.getAttribute("x")).toBe("1")

      observer.observe(el, {attributes: true})

      go(2)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(el.getAttribute("x")).toBe("2")
      expect(mutationCount).toBe(1)

      go(2)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(el.getAttribute("x")).toBe("2")
      expect(mutationCount).toBe(1)
    })
  })

  describe("логические атрибуты", () => {
    test("обновляет логический атрибут установленный извне", () => {
      // prettier-ignore
      const go = (x: boolean) => render(html`<div ?hidden="${live(x)}"></div> }`, container)

      go(true)
      const el = container.firstElementChild as HTMLDivElement
      expect(el.getAttribute("hidden")).toBe("")

      go(true)
      expect(el.getAttribute("hidden")).toBe("")

      el.removeAttribute("hidden")
      expect(el.getAttribute("hidden")).toBe(null)

      go(true)
      expect(el.getAttribute("hidden")).toBe("")
    })

    test("не устанавливает неизмененный логический атрибут", async () => {
      let mutationCount = 0
      const observer = new MutationObserver(records => {
        mutationCount += records.length
      })
      // prettier-ignore
      const go = (x: boolean) => render(html`<div ?hidden="${live(x)}"></div>`, container)

      go(true)
      const el = container.firstElementChild as LiveTester
      expect(el.getAttribute("hidden")).toBe("")

      observer.observe(el, {attributes: true})

      go(false)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(el.getAttribute("hidden")).toBe(null)
      expect(mutationCount).toBe(1)

      go(false)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(el.getAttribute("hidden")).toBe(null)
      expect(mutationCount).toBe(1)
    })
  })
})
