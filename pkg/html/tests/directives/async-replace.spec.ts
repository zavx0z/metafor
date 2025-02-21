import {asyncReplace} from "../../directives/async-replace.js"
import {render, html} from "../../html.js"
import {TestAsyncIterable} from "./test-async-iterable.js"
import {test, describe, expect, beforeEach} from "bun:test"

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

describe.skip("asyncReplace", () => {
  let container: HTMLDivElement
  let iterable: TestAsyncIterable<unknown>

  beforeEach(() => {
    container = document.createElement("div")
    iterable = new TestAsyncIterable<unknown>()
  })

  test.skip("replaces content as the async iterable yields new values (ChildPart)", async () => {
    render(
      html`
        <div>${asyncReplace(iterable)}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")
  })

  test.skip("replaces content as the async iterable yields new values (AttributePart)", async () => {
    render(
      html`
        <div class="${asyncReplace(iterable)}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div class="foo"></div>')

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div class="bar"></div>')
  })

  test.skip("replaces content as the async iterable yields new values (PropertyPart)", async () => {
    render(
      html`
        <div .className=${asyncReplace(iterable)}></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div class="foo"></div>')

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div class="bar"></div>')
  })

  test.skip("replaces content as the async iterable yields new values (BooleanAttributePart)", async () => {
    render(
      html`
        <div ?hidden=${asyncReplace(iterable)}></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push(true)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div hidden=""></div>')

    await iterable.push(false)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
  })

  test.skip("replaces content as the async iterable yields new values (EventPart)", async () => {
    render(
      html`
        <div @click=${asyncReplace(iterable)}></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    let value
    await iterable.push(() => (value = 1))
    ;(container.firstElementChild as HTMLDivElement)!.click()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect(value).toBe(1)

    await iterable.push(() => (value = 2))
    ;(container.firstElementChild as HTMLDivElement)!.click()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect(value).toBe(2)
  })

  test.skip("clears the Part when a value is undefined", async () => {
    render(
      html`
        <div>${asyncReplace(iterable)}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    await iterable.push(undefined as unknown as string)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
  })

  test.skip("uses the mapper function", async () => {
    render(
      html`
        <div>
          ${asyncReplace(
            iterable,
            (v, i) =>
              html`
                ${i}: ${v}
              `
          )}
        </div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>0: foo </div>")

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>1: bar </div>")
  })

  test.skip("renders new iterable over a pending iterable", async () => {
    const t = (iterable: any) =>
      html`
        <div>${asyncReplace(iterable)}</div>
      `
    render(t(iterable), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    // expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    const iterable2 = new TestAsyncIterable<string>()
    // render(t(iterable2), container)

    // Последнее значение сохраняется до тех пор, пока мы не получим первое значение из новой итерации
    // expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    await iterable2.push("hello")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")
  })

  test.skip("renders the same iterable even when the iterable new value is emitted at the same time as a re-render", async () => {
    const t = (iterable: any) =>
      html`
        <div>${asyncReplace(iterable)}</div>
      `
    let wait: Promise<void>
    render(t(iterable), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    wait = iterable.push("hello")
    render(t(iterable), container)
    await wait
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")

    wait = iterable.push("bar")
    render(t(iterable), container)
    await wait
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")
  })

  test.skip("renders the same iterable value when re-rendered with no new value emitted", async () => {
    const t = (iterable: any) =>
      html`
        <div>${asyncReplace(iterable)}</div>
      `
    render(t(iterable), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("hello")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")

    render(t(iterable), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")

    render(t(iterable), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")
  })

  test.skip("renders new value over a pending iterable", async () => {
    const t = (v: any) =>
      html`
        <div>${v}</div>
      `
    // This is a little bit of an odd usage of directives as values, but it
    // is possible, and we check here that asyncReplace plays nice in this case
    render(t(asyncReplace(iterable)), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    render(t("hello"), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")
  })

  test.skip("does not render the first value if it is replaced first", async () => {
    async function* generator(delay: Promise<any>, value: any) {
      await delay
      yield value
    }

    const component = (value: any) =>
      html`
        <p>${asyncReplace(value)}</p>
      `
    const delay = (delay: number) => new Promise(res => setTimeout(res, delay))

    const slowDelay = delay(20)
    const fastDelay = delay(10)

    render(component(generator(slowDelay, "slow")), container)
    render(component(generator(fastDelay, "fast")), container)

    await slowDelay
    await delay(10)

    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>fast</p>")
  })

  describe("disconnection", () => {
    test.skip("does not render when iterable resolves while disconnected", async () => {
      const component = (value: any) =>
        html`
          <p>${asyncReplace(value)}</p>
        `
      const part = render(component(iterable), container)
      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      part.setConnected(false)
      await iterable.push("2")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      part.setConnected(true)
      await nextFrame()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>2</p>")
      await iterable.push("3")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>3</p>")
    })

    test.skip("disconnection thrashing", async () => {
      const component = (value: any) =>
        html`
          <p>${asyncReplace(value)}</p>
        `
      const part = render(component(iterable), container)
      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      part.setConnected(false)
      await iterable.push("2")
      part.setConnected(true)
      part.setConnected(false)
      await nextFrame()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      part.setConnected(true)
      await nextFrame()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>2</p>")
      await iterable.push("3")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>3</p>")
    })

    test.skip("does not render when newly rendered while disconnected", async () => {
      const component = (value: any) =>
        html`
          <p>${value}</p>
        `
      const part = render(component("static"), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>static</p>")
      part.setConnected(false)
      render(component(asyncReplace(iterable)), container)
      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>static</p>")
      part.setConnected(true)
      await nextFrame()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      await iterable.push("2")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>2</p>")
    })

    test.skip("does not render when resolved and changed while disconnected", async () => {
      const component = (value: any) =>
        html`
          <p>${value}</p>
        `
      const part = render(component("staticA"), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>staticA</p>")
      part.setConnected(false)
      render(component(asyncReplace(iterable)), container)
      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>staticA</p>")
      render(component("staticB"), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>staticB</p>")
      part.setConnected(true)
      await nextFrame()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>staticB</p>")
      await iterable.push("2")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>staticB</p>")
    })

    test.skip("the same promise can be rendered into two asyncReplace instances", async () => {
      const component = (iterable: AsyncIterable<unknown>) =>
        html`
          <p>${asyncReplace(iterable)}</p>
          <p>${asyncReplace(iterable)}</p>
        `
      render(component(iterable), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p></p><p></p>")

      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p><p>1</p>")
      await iterable.push("2")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>2</p><p>2</p>")
    })
  })
})
