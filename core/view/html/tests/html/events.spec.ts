import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { html, render } from "../../index.js"

describe("события", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  test("добавляет обработчики событий, вызывает с правильным значением this", () => {
    let thisValue
    let event: Event | undefined = undefined
    const listener = function (this: any, e: any) {
      event = e
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      thisValue = this
    }
    const host = {} as EventTarget
    render(html` <div @click=${listener}></div> `, container, { host })
    const div = container.querySelector("div")!
    div.click()
    if (event === undefined) {
      throw new Error(`Обработчик события никогда не был вызван!`)
    }
    // @ts-ignore
    expect(thisValue, "this должен быть host").toBe(host)

    // MouseEvent не является функцией в IE, поэтому событие не может быть экземпляром
    // из него
    if (typeof MouseEvent === "function") {
      expect(event, "event должен быть MouseEvent").toBeInstanceOf(MouseEvent)
    } else {
      expect((event as MouseEvent).initMouseEvent, "initMouseEvent должен быть определён").toBeDefined()
    }
  })

  test("добавляет обработчики событий объектов, вызывает с правильным значением this", () => {
    let thisValue
    const listener = {
      handleEvent(_e: Event) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        thisValue = this
      },
    }
    const host = {} as EventTarget
    render(html` <div @click=${listener}></div> `, container, {
      host,
    })
    const div = container.querySelector("div")!
    div.click()
    // @ts-ignore
    expect(thisValue, "this должен быть listener").toBe(listener)
  })

  test("добавляет обработчики событий только один раз", () => {
    let count = 0
    const listener = () => {
      count++
    }
    render(html` <div @click=${listener}></div> `, container)
    render(html` <div @click=${listener}></div> `, container)

    const div = container.querySelector("div")!
    div.click()
    expect(count, "обработчик должен быть вызван один раз").toBe(1)
  })

  test("добавляет обработчики событий на самозакрывающиеся теги", () => {
    let count = 0
    const listener = () => {
      count++
    }
    render(
      html`
        <div @click=${listener}/></div>`,
      container
    )

    const div = container.querySelector("div")!
    div.click()
    expect(count, "обработчик должен быть вызван один раз").toBe(1)
  })

  test("позволяет обновлять обработчик события", () => {
    let count1 = 0
    const listener1 = () => {
      count1++
    }
    let count2 = 0
    const listener2 = () => {
      count2++
    }
    const t = (listener: () => void) => html` <div @click=${listener}></div> `
    render(t(listener1), container)
    render(t(listener2), container)

    const div = container.querySelector("div")!
    div.click()
    expect(count1, "старый обработчик не должен быть вызван").toBe(0)
    expect(count2, "новый обработчик должен быть вызван").toBe(1)
  })

  test("позволяет обновлять обработчик события без лишних вызовов remove/addEventListener", () => {
    let listener: Function | null
    const t = () => html` <div @click=${listener}></div> `
    render(t(), container)
    const div = container.querySelector("div")!

    let addCount = 0
    let removeCount = 0
    div.addEventListener = () => addCount++
    div.removeEventListener = () => removeCount++

    listener = () => {}
    render(t(), container)
    expect(addCount, "addEventListener должен быть вызван 1 раз").toBe(1)
    expect(removeCount, "removeEventListener не должен быть вызван").toBe(0)

    listener = () => {}
    render(t(), container)
    expect(addCount, "addEventListener не должен вызываться повторно").toBe(1)
    expect(removeCount, "removeEventListener не должен быть вызван").toBe(0)

    listener = null
    render(t(), container)
    expect(addCount, "addEventListener не должен вызываться при удалении").toBe(1)
    expect(removeCount, "removeEventListener должен быть вызван 1 раз").toBe(1)

    listener = () => {}
    render(t(), container)
    expect(addCount, "addEventListener должен быть вызван второй раз").toBe(2)
    expect(removeCount, "removeEventListener должен быть вызван 1 раз").toBe(1)

    listener = () => {}
    render(t(), container)
    expect(addCount, "addEventListener не должен вызываться повторно").toBe(2)
    expect(removeCount, "removeEventListener должен быть вызван 1 раз").toBe(1)
  })

  test("удаляет обработчики событий", () => {
    let target
    let listener: any = (e: any) => (target = e.target)
    const t = () => html` <div @click=${listener}></div> `
    render(t(), container)
    const div = container.querySelector("div")!
    div.click()
    // @ts-ignore
    expect(target, "target должен быть div").toBe(div)

    listener = null
    target = undefined
    render(t(), container)
    div.click()
    expect(target, "target должен быть undefined после удаления обработчика").toBe(undefined)
  })

  test("позволяет отлавливать события", () => {
    let event!: Event
    let eventPhase!: number
    const listener = {
      handleEvent(e: Event) {
        event = e
        // читать здесь, потому что оно меняется
        eventPhase = event.eventPhase
      },
      capture: true,
    }
    render(
      html`
        <div id="outer" @test=${listener}>
          <div id="inner">
            <div></div>
          </div>
        </div>
      `,
      container
    )
    const inner = container.querySelector("#inner")!
    inner.dispatchEvent(new Event("test"))
    expect(event, "event должен быть определён").toBeDefined()
    // expect(eventPhase).toBe(Event.CAPTURING_PHASE)
    expect(eventPhase, "eventPhase должен быть 1 (CAPTURING_PHASE)").toBe(1)
  })

  test("обработчики событий могут видеть события, вызванные динамическими дочерними элементами", () => {
    // Этот тест проверяет, что директивы узлов вызываются в фазе коммита, а не
    // в фазе setValue
    class TestElement1 extends HTMLElement {
      connectedCallback() {
        this.dispatchEvent(
          new CustomEvent("test-event", {
            bubbles: true,
          })
        )
      }
    }

    customElements.define("test-element-1", TestElement1)

    let event: Event | undefined = undefined
    const listener = (e: Event) => {
      event = e
    }
    document.body.appendChild(container)
    render(html` <div @test-event=${listener}>${html` <test-element-1></test-element-1> `}</div> `, container)
    expect(event, "event должен быть определён").toBeDefined()
  })
})
