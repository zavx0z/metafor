import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {html, render} from "../../html.js"

describe("events", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  test("adds event listener functions, calls with right this value", () => {
    let thisValue
    let event: Event | undefined = undefined
    const listener = function (this: any, e: any) {
      event = e
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      thisValue = this
    }
    const host = {} as EventTarget
    render(
      html`
        <div @click=${listener}></div>
      `,
      container,
      {host}
    )
    const div = container.querySelector("div")!
    div.click()
    if (event === undefined) {
      throw new Error(`Event listener never fired!`)
    }
    expect(thisValue).toBe(host)

    // MouseEvent is not a function in IE, so the event cannot be an instance
    // of it
    if (typeof MouseEvent === "function") {
      expect(event).toBeInstanceOf(MouseEvent)
    } else {
      expect((event as MouseEvent).initMouseEvent).toBeDefined()
    }
  })

  test("adds event listener objects, calls with right this value", () => {
    let thisValue
    const listener = {
      handleEvent(_e: Event) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        thisValue = this
      }
    }
    const host = {} as EventTarget
    render(
      html`
        <div @click=${listener}></div>
      `,
      container,
      {
        host
      }
    )
    const div = container.querySelector("div")!
    div.click()
    expect(thisValue).toBe(listener)
  })

  test("only adds event listener once", () => {
    let count = 0
    const listener = () => {
      count++
    }
    render(
      html`
        <div @click=${listener}></div>
      `,
      container
    )
    render(
      html`
        <div @click=${listener}></div>
      `,
      container
    )

    const div = container.querySelector("div")!
    div.click()
    expect(count).toBe(1)
  })

  test("adds event listeners on self-closing tags", () => {
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
    expect(count).toBe(1)
  })

  test("allows updating event listener", () => {
    let count1 = 0
    const listener1 = () => {
      count1++
    }
    let count2 = 0
    const listener2 = () => {
      count2++
    }
    const t = (listener: () => void) => html`
      <div @click=${listener}></div>
    `
    render(t(listener1), container)
    render(t(listener2), container)

    const div = container.querySelector("div")!
    div.click()
    expect(count1).toBe(0)
    expect(count2).toBe(1)
  })

  test("allows updating event listener without extra calls to remove/addEventListener", () => {
    let listener: Function | null
    const t = () => html`
      <div @click=${listener}></div>
    `
    render(t(), container)
    const div = container.querySelector("div")!

    let addCount = 0
    let removeCount = 0
    div.addEventListener = () => addCount++
    div.removeEventListener = () => removeCount++

    listener = () => {}
    render(t(), container)
    expect(addCount).toBe(1)
    expect(removeCount).toBe(0)

    listener = () => {}
    render(t(), container)
    expect(addCount).toBe(1)
    expect(removeCount).toBe(0)

    listener = null
    render(t(), container)
    expect(addCount).toBe(1)
    expect(removeCount).toBe(1)

    listener = () => {}
    render(t(), container)
    expect(addCount).toBe(2)
    expect(removeCount).toBe(1)

    listener = () => {}
    render(t(), container)
    expect(addCount).toBe(2)
    expect(removeCount).toBe(1)
  })

  test("removes event listeners", () => {
    let target
    let listener: any = (e: any) => (target = e.target)
    const t = () => html`
      <div @click=${listener}></div>
    `
    render(t(), container)
    const div = container.querySelector("div")!
    div.click()
    expect(target).toBe(div)

    listener = null
    target = undefined
    render(t(), container)
    div.click()
    expect(target).toBe(undefined)
  })

  test("allows capturing events", () => {
    let event!: Event
    let eventPhase!: number
    const listener = {
      handleEvent(e: Event) {
        event = e
        // read here because it changes
        eventPhase = event.eventPhase
      },
      capture: true
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
    expect(event).toBeDefined()
    // expect(eventPhase).toBe(Event.CAPTURING_PHASE)
    expect(eventPhase).toBe(1)
  })

  test("event listeners can see events fired by dynamic children", () => {
    // This tests that node directives are called in the commit phase, not
    // the setValue phase
    class TestElement1 extends HTMLElement {
      connectedCallback() {
        this.dispatchEvent(
          new CustomEvent("test-event", {
            bubbles: true
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
    render(
      html`
        <div @test-event=${listener}>
          ${html`
            <test-element-1></test-element-1>
          `}
        </div>
      `,
      container
    )
    expect(event).toBeDefined()
  })
})
