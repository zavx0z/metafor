import {asyncAppend} from "../../directives/async-append.js"
import {render, html} from "../../html.js"
import {TestAsyncIterable} from "./test-async-iterable.js"
import {test, describe, expect, beforeAll} from "bun:test"

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

describe.skip("asyncAppend", () => {
  let container: HTMLDivElement
  let iterable: TestAsyncIterable<string>

  beforeAll(() => {
    container = document.createElement("div")
    iterable = new TestAsyncIterable<string>()
  })

  test("appends content as the async iterable yields new values", async () => {
    render(
      html`
        <div>${asyncAppend(iterable)}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foobar</div>")
  })

  test("appends nothing with a value is undefined", async () => {
    render(
      html`
        <div>${asyncAppend(iterable)}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    await iterable.push(undefined as unknown as string)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("uses a mapper function", async () => {
    render(
      html`
        <div>
          ${asyncAppend(
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
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>0: foo 1: bar </div>")
  })

  test("renders new iterable over a pending iterable", async () => {
    const t = (iterable: any) =>
      html`
        <div>${asyncAppend(iterable)}</div>
      `
    render(t(iterable), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    const iterable2 = new TestAsyncIterable<string>()
    render(t(iterable2), container)

    // The last value is preserved until we receive the first
    // value from the new iterable
    // expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    await iterable2.push("hello")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")
  })

  test("renders new value over a pending iterable", async () => {
    const t = (v: any) =>
      html`
        <div>${v}</div>
      `
    // This is a little bit of an odd usage of directives as values, but it
    // is possible, and we check here that asyncAppend plays nice in this case
    render(t(asyncAppend(iterable)), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await iterable.push("foo")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    render(t("hello"), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")

    await iterable.push("bar")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>hello</div>")
  })

  test.skip("does not render the first value if it is replaced first", async () => {
    const iterable2 = new TestAsyncIterable<string>()

    const component = (value: any) =>
      html`
        <p>${asyncAppend(value)}</p>
      `

    render(component(iterable), container)
    render(component(iterable2), container)

    await iterable2.push("fast")

    // This write should not render, since the whole iterator was replaced
    await iterable.push("slow")

    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>fast</p>")
  })

  describe.skip("disconnection", () => {
    test("does not render when iterable resolves while disconnected", async () => {
      const component = (value: any) =>
        html`
          <p>${asyncAppend(value)}</p>
        `
      const part = render(component(iterable), container)
      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      part.setConnected(false)
      await iterable.push("2")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      part.setConnected(true)
      await nextFrame()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>12</p>")
      await iterable.push("3")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>123</p>")
    })

    test("disconnection thrashing", async () => {
      const component = (value: any) =>
        html`
          <p>${asyncAppend(value)}</p>
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
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>12</p>")
      await iterable.push("3")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>123</p>")
    })

    test("does not render when newly rendered while disconnected", async () => {
      const component = (value: any) =>
        html`
          <p>${value}</p>
        `
      const part = render(component("static"), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>static</p>")
      part.setConnected(false)
      render(component(asyncAppend(iterable)), container)
      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>static</p>")
      part.setConnected(true)
      await nextFrame()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p>")
      await iterable.push("2")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>12</p>")
    })

    test("does not render when resolved and changed while disconnected", async () => {
      const component = (value: any) =>
        html`
          <p>${value}</p>
        `
      const part = render(component("staticA"), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>staticA</p>")
      part.setConnected(false)
      render(component(asyncAppend(iterable)), container)
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

    test("the same promise can be rendered into two asyncAppend instances", async () => {
      const component = (iterable: AsyncIterable<unknown>) =>
        html`
          <p>${asyncAppend(iterable)}</p>
          <p>${asyncAppend(iterable)}</p>
        `
      render(component(iterable), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p></p><p></p>")
      await iterable.push("1")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>1</p><p>1</p>")
      await iterable.push("2")
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<p>12</p><p>12</p>")
    })
  })
})
