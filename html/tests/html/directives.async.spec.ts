import {beforeEach, describe, expect, test} from "bun:test"
import {html, noChange, nothing, render} from "../../html.js"
import type {CompiledTemplateResult, RenderOptions, TemplateResult} from "../../types/html.js"
import type {Part} from "../../types/part.js"
import {AsyncDirective, Directive, directive} from "../../async-directive.js"
import type {PartInfo} from "../../types/directives.js"
import {repeat} from "../../directives/repeat.js"

describe("async directives", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })

  class ADirective extends AsyncDirective {
    value: unknown
    promise!: Promise<unknown>

    render(_promise: Promise<unknown>) {
      return "initial"
    }

    update(_part: Part, [promise]: Parameters<this["render"]>) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      aDirectiveInst = this
      if (promise !== this.promise) {
        this.promise = promise
        promise.then(value => {
          this.value = value
          this.setValue(value)
        })
      }
      return this.value ?? this.render(promise)
    }
  }

  const aDirective = directive(ADirective)
  let aDirectiveInst: ADirective

  const bDirective = directive(
    class extends Directive {
      count = 0

      constructor(partInfo: PartInfo) {
        super(partInfo)
      }

      render(v: unknown) {
        return `[B:${this.count++}:${v}]`
      }
    }
  )

  const syncAsyncDirective = directive(
    class extends AsyncDirective {
      render(x: string) {
        this.setValue(x)
        return noChange
      }
    }
  )

  const assertRender = (r: TemplateResult | CompiledTemplateResult, expected: string, options?: RenderOptions) => {
    const part = render(r, container, options)
    expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
    return part
  }

  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)

  test("async directive can call setValue synchronously", () => {
    assertRender(
      html`
        <div foo=${syncAsyncDirective("test")}>${syncAsyncDirective("test")}</div>
      `,
      '<div foo="test">test</div>'
    )
  })

  test("async directives in ChildPart", async () => {
    const template = (promise: Promise<unknown>) =>
      html`
        <div>${aDirective(promise)}</div>
      `
    let promise = Promise.resolve("resolved1")
    assertRender(template(promise), `<div>initial</div>`)
    await promise
    assertContent(`<div>resolved1</div>`)
    promise = Promise.resolve("resolved2")
    assertRender(template(promise), `<div>resolved1</div>`)
    await promise
    assertContent(`<div>resolved2</div>`)
  })

  test("async directives change to disconnected in ChildPart", async () => {
    const template = (promise: Promise<unknown>) =>
      html`
        <div>${aDirective(promise)}</div>
      `
    const promise = Promise.resolve("resolved1")
    const part = assertRender(template(promise), `<div>initial</div>`)
    expect(aDirectiveInst.isConnected).toBe(true)
    part.setConnected(false)
    assertContent(`<div>initial</div>`)
    // await promise
    await Bun.sleep(1000)
    expect(aDirectiveInst.isConnected).toBe(false)
    assertContent(`<div>resolved1</div>`)
    part.setConnected(true)
    expect(aDirectiveInst.isConnected).toBe(true)
    assertContent(`<div>resolved1</div>`)
  })

  test("async directives render while disconnected in ChildPart", async () => {
    const template = (v: unknown) => html`
      <div>${v}</div>
    `
    const promise = Promise.resolve("resolved1")
    const part = assertRender(template("initial"), `<div>initial</div>`)
    part.setConnected(false)
    assertRender(template(aDirective(promise)), `<div>initial</div>`)
    expect(aDirectiveInst.isConnected).toBe(false)
    await promise
    assertContent(`<div>resolved1</div>`)
    expect(aDirectiveInst.isConnected).toBe(false)
    part.setConnected(true)
    expect(aDirectiveInst.isConnected).toBe(true)
    assertRender(template(aDirective(promise)), `<div>resolved1</div>`)
  })

  test("async directives while disconnected in ChildPart clears its value", async () => {
    const log: string[] = []
    const template = (promise: Promise<unknown>) =>
      html`
        <div>${aDirective(promise)}</div>
      `
    // Async render a TemplateResult containing a AsyncDirective
    let promise: Promise<unknown> = Promise.resolve(
      html`
        ${disconnectingDirective(log, "dd", "dd")}
      `
    )
    const part = assertRender(template(promise), `<div>initial</div>`)
    await promise
    assertContent(`<div>dd</div>`)
    // Eneuque an async clear of the TemplateResult+AsyncDirective
    promise = Promise.resolve(nothing)
    assertRender(template(promise), `<div>dd</div>`)
    expect(log).toEqual([])
    // Disconnect the tree before the clear is committed
    part.setConnected(false)
    expect(aDirectiveInst.isConnected).toBe(false)
    expect(log).toEqual(["disconnected-dd"])
    await promise
    expect(log).toEqual(["disconnected-dd"])
    assertContent(`<div></div>`)
    // Re-connect the tree, which should clear the part but not reconnect
    // the AsyncDirective that was cleared
    part.setConnected(true)
    expect(aDirectiveInst.isConnected).toBe(true)
    assertRender(template(promise), `<div></div>`)
    expect(log).toEqual(["disconnected-dd"])
  })

  test("async nested directives in ChildPart", async () => {
    const template = (promise: Promise<unknown>) =>
      html`
        <div>${aDirective(promise)}</div>
      `
    let promise = Promise.resolve(bDirective("X"))
    assertRender(template(promise), `<div>initial</div>`)
    await promise
    assertContent(`<div>[B:0:X]</div>`)
    assertRender(template(promise), `<div>[B:1:X]</div>`)
    promise = Promise.resolve(bDirective("Y"))
    assertRender(template(promise), `<div>[B:2:X]</div>`)
    await promise
    assertContent(`<div>[B:3:Y]</div>`)
  })

  test("async directives in AttributePart", async () => {
    const template = (promise: Promise<unknown>) =>
      html`
        <div a="${"**"}${aDirective(promise)}${"##"}"></div>
      `
    let promise = Promise.resolve("resolved1")
    assertRender(template(promise), `<div a="**initial##"></div>`)
    await promise
    assertContent(`<div a="**resolved1##"></div>`)
    promise = Promise.resolve("resolved2")
    assertRender(template(promise), `<div a="**resolved1##"></div>`)
    await promise
    assertContent(`<div a="**resolved2##"></div>`)
  })

  test("async directives while disconnected in AttributePart", async () => {
    const template = (promise: Promise<unknown>) =>
      html`
        <div a="${"**"}${aDirective(promise)}${"##"}"></div>
      `
    const promise = Promise.resolve("resolved1")
    const part = assertRender(template(promise), `<div a="**initial##"></div>`)
    part.setConnected(false)
    expect(aDirectiveInst.isConnected).toBe(false)
    await promise
    assertContent(`<div a="**resolved1##"></div>`)
    part.setConnected(true)
    expect(aDirectiveInst.isConnected).toBe(true)
    assertContent(`<div a="**resolved1##"></div>`)
  })

  test("async nested directives in AttributePart", async () => {
    const template = (promise: Promise<unknown>) =>
      html`
        <div a="${"**"}${aDirective(promise)}${"##"}"></div>
      `
    let promise = Promise.resolve(bDirective("X"))
    assertRender(template(promise), `<div a="**initial##"></div>`)
    await promise
    assertContent(`<div a="**[B:0:X]##"></div>`)
    promise = Promise.resolve(bDirective("Y"))
    assertRender(template(promise), `<div a="**[B:1:X]##"></div>`)
    await promise
    assertContent(`<div a="**[B:2:Y]##"></div>`)
  })

  const disconnectingDirective = directive(
    class extends AsyncDirective {
      log!: Array<string>
      id!: string

      render(log: Array<string>, id = "", value?: unknown, bool = true) {
        this.log = log
        this.id = id
        return bool ? value : nothing
      }

      override disconnected() {
        this.log.push("disconnected" + (this.id ? `-${this.id}` : ""))
      }

      override reconnected() {
        this.log.push("reconnected" + (this.id ? `-${this.id}` : ""))
      }
    }
  )

  const passthroughDirective = directive(
    class extends Directive {
      render(value: unknown, bool = true) {
        return bool ? value : nothing
      }
    }
  )

  test("directives can be disconnected from ChildParts", () => {
    const log: Array<string> = []
    const go = (x: boolean) =>
      render(
        html`
          ${x ? disconnectingDirective(log) : nothing}
        `,
        container
      )
    go(true)
    expect(log).toEqual([])
    go(false)
    expect(log).toEqual(["disconnected"])
  })

  test("directives are disconnected when their template is", () => {
    const log: Array<string> = []
    const go = (x: boolean) =>
      render(
        x
          ? html`
              ${disconnectingDirective(log)}
            `
          : nothing,
        container
      )
    go(true)
    expect(log).toEqual([])
    go(false)
    expect(log).toEqual(["disconnected"])
  })

  test("directives are disconnected when their nested template is", () => {
    const log: Array<string> = []
    const go = (x: boolean) =>
      render(
        x
          ? html`
              ${html`
                ${disconnectingDirective(log)}
              `}
            `
          : nothing,
        container
      )
    go(true)
    expect(log).toEqual([])
    go(false)
    expect(log).toEqual(["disconnected"])
  })

  test("directives in different subtrees can be disconnected in separate renders", () => {
    const log: Array<string> = []
    const go = (left: boolean, right: boolean) =>
      render(
        html`
          ${html`
            ${html`
              ${left ? disconnectingDirective(log, "left") : nothing}
            `}
          `}
          ${html`
            ${html`
              ${right ? disconnectingDirective(log, "right") : nothing}
            `}
          `}
        `,
        container
      )
    go(true, true)
    expect(log).toEqual([])
    go(true, false)
    expect(log).toEqual(["disconnected-right"])
    log.length = 0
    go(false, false)
    expect(log).toEqual(["disconnected-left"])
    log.length = 0
    go(true, true)
    expect(log).toEqual([])
    go(false, true)
    expect(log).toEqual(["disconnected-left"])
    log.length = 0
    go(false, false)
    expect(log).toEqual(["disconnected-right"])
  })

  test("directives returned from other directives can be disconnected", () => {
    const log: Array<string> = []
    const go = (clearAll: boolean, left: boolean, right: boolean) =>
      render(
        clearAll
          ? nothing
          : html`
              ${html`
                ${html`
                  ${passthroughDirective(disconnectingDirective(log, "left"), left)}
                `}
              `}
              ${html`
                ${html`
                  ${passthroughDirective(disconnectingDirective(log, "right"), right)}
                `}
              `}
            `,
        container
      )
    go(false, true, true)
    expect(log).toEqual([])
    go(true, true, true)
    expect(log).toEqual(["disconnected-left", "disconnected-right"])
    log.length = 0
    go(false, true, true)
    expect(log).toEqual([])
    go(false, true, false)
    expect(log).toEqual(["disconnected-right"])
    log.length = 0
    go(false, false, false)
    expect(log).toEqual(["disconnected-left"])
    log.length = 0
    go(false, true, true)
    expect(log).toEqual([])
    go(false, false, true)
    expect(log).toEqual(["disconnected-left"])
    log.length = 0
    go(false, false, false)
    expect(log).toEqual(["disconnected-right"])
  })

  test("directives returned from other AsyncDirectives can be disconnected", () => {
    const log: Array<string> = []
    const go = (clearAll: boolean, leftOuter: boolean, leftInner: boolean, rightOuter: boolean, rightInner: boolean) =>
      render(
        clearAll
          ? nothing
          : html`
              ${html`
                ${html`
                  ${leftOuter
                    ? disconnectingDirective(log, "left-outer", disconnectingDirective(log, "left-inner"), leftInner)
                    : nothing}
                `}
              `}
              ${html`
                ${html`
                  ${rightOuter
                    ? disconnectingDirective(log, "right-outer", disconnectingDirective(log, "right-inner"), rightInner)
                    : nothing}
                `}
              `}
            `,
        container
      )
    go(false, true, true, true, true)
    expect(log).toEqual([])
    go(true, true, true, true, true)
    expect(log).toEqual([
      "disconnected-left-outer",
      "disconnected-left-inner",
      "disconnected-right-outer",
      "disconnected-right-inner"
    ])
    log.length = 0
    go(false, true, true, true, true)
    expect(log).toEqual([])
    go(false, false, true, true, true)
    expect(log).toEqual(["disconnected-left-outer", "disconnected-left-inner"])
    log.length = 0
    go(false, true, true, true, true)
    expect(log).toEqual([])
    go(false, true, true, false, true)
    expect(log).toEqual(["disconnected-right-outer", "disconnected-right-inner"])
    log.length = 0
    go(false, true, true, true, true)
    expect(log).toEqual([])
    go(false, true, false, true, true)
    expect(log).toEqual(["disconnected-left-inner"])
    log.length = 0
    go(false, true, false, true, false)
    expect(log).toEqual(["disconnected-right-inner"])
  })

  test("directives can be disconnected from AttributeParts", () => {
    const log: Array<string> = []
    const go = (x: boolean) =>
      render(
        x
          ? html`
              <div foo=${disconnectingDirective(log)}></div>
            `
          : nothing,
        container
      )
    go(true)
    expect(log).toEqual([])
    go(false)
    expect(log).toEqual(["disconnected"])
  })

  test("deeply nested directives can be disconnected from AttributeParts", () => {
    const log: Array<string> = []
    const go = (x: boolean) =>
      render(
        x
          ? html`
              ${html`
                <div foo=${disconnectingDirective(log)}></div>
              `}
            `
          : nothing,
        container
      )
    go(true)
    expect(log).toEqual([])
    go(false)
    expect(log).toEqual(["disconnected"])
  })

  test("directives can be disconnected from iterables", () => {
    const log: Array<string> = []
    const go = (items: string[] | undefined) =>
      render(
        items
          ? items.map(
              item =>
                html`
                  <div foo=${disconnectingDirective(log, item)}></div>
                `
            )
          : nothing,
        container
      )
    go(["0", "1", "2", "3"])
    expect(log).toEqual([])
    go(["0", "2"])
    expect(log).toEqual(["disconnected-2", "disconnected-3"])
    log.length = 0
    go(undefined)
    expect(log).toEqual(["disconnected-0", "disconnected-2"])
  })

  test("directives can be disconnected from repeat", () => {
    const log: Array<string> = []
    const go = (items: string[] | undefined) =>
      render(
        items
          ? repeat(
              items,
              item => item,
              // @ts-ignore
              item => html` <div foo=${disconnectingDirective(log, item)}></div> ` // prettier-ignore
            )
          : nothing,
        container
      )
    go(["0", "1", "2", "3"])
    expect(log).toEqual([])
    go(["0", "2"])
    expect(log).toEqual(["disconnected-1", "disconnected-3"])
    log.length = 0
    go(undefined)
    expect(log).toEqual(["disconnected-0", "disconnected-2"])
  })

  test("directives in ChildParts can be reconnected", () => {
    const log: Array<string> = []
    const go = (left: boolean, right: boolean) => {
      return render(
        html`
          ${html`
            ${html`
              ${left ? disconnectingDirective(log, "left") : nothing}
            `}
          `}
          ${html`
            ${html`
              ${right ? disconnectingDirective(log, "right") : nothing}
            `}
          `}
        `,
        container
      )
    }
    const part = go(true, true)
    expect(log).toEqual([])
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left", "disconnected-right"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left", "reconnected-right"])
    log.length = 0
    go(true, false)
    expect(log).toEqual(["disconnected-right"])
    log.length = 0
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left"])
  })

  test("directives in AttributeParts can be reconnected", () => {
    const log: Array<string> = []
    const go = (left: boolean, right: boolean) => {
      return render(
        html`
          ${html`
            ${html`
              <div a=${left ? disconnectingDirective(log, "left") : nothing}></div>
            `}
          `}
          ${html`
            ${html`
              <div a=${right ? disconnectingDirective(log, "right") : nothing}></div>
            `}
          `}
        `,
        container
      )
    }
    const part = go(true, true)
    expect(log).toEqual([])
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left", "disconnected-right"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left", "reconnected-right"])
    log.length = 0
    go(true, false)
    expect(log).toEqual(["disconnected-right"])
    log.length = 0
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left"])
  })

  test("directives in iterables can be reconnected", () => {
    const log: Array<string> = []
    const go = (left: unknown[], right: unknown[]) => {
      return render(
        html`
          ${html`
            ${html`
              ${left.map(
                i =>
                  html`
                    <div>${disconnectingDirective(log, `left-${i}`)}</div>
                  `
              )}
            `}
          `}
          ${html`
            ${html`
              ${right.map(
                i =>
                  html`
                    <div>${disconnectingDirective(log, `right-${i}`)}</div>
                  `
              )}
            `}
          `}
        `,
        container
      )
    }
    const part = go([0, 1], [0, 1])
    expect(log).toEqual([])
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left-0", "disconnected-left-1", "disconnected-right-0", "disconnected-right-1"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left-0", "reconnected-left-1", "reconnected-right-0", "reconnected-right-1"])
    log.length = 0
    go([0], [])
    expect(log).toEqual(["disconnected-left-1", "disconnected-right-0", "disconnected-right-1"])
    log.length = 0
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left-0"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left-0"])
  })

  test("directives in repeat can be reconnected", () => {
    const log: Array<string> = []
    const go = (left: unknown[], right: unknown[]) => {
      return render(
        html`
          ${html`
            ${html`
              ${repeat(
                left,
                i =>
                  html`
                    <div>${disconnectingDirective(log, `left-${i}`)}</div>
                  `
              )}
            `}
          `}
          ${html`
            ${html`
              ${repeat(
                right,
                i =>
                  html`
                    <div>${disconnectingDirective(log, `right-${i}`)}</div>
                  `
              )}
            `}
          `}
        `,
        container
      )
    }
    const part = go([0, 1], [0, 1])
    expect(log).toEqual([])
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left-0", "disconnected-left-1", "disconnected-right-0", "disconnected-right-1"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left-0", "reconnected-left-1", "reconnected-right-0", "reconnected-right-1"])
    log.length = 0
    go([0], [])
    expect(log).toEqual(["disconnected-left-1", "disconnected-right-0", "disconnected-right-1"])
    log.length = 0
    part.setConnected(false)
    expect(log).toEqual(["disconnected-left-0"])
    log.length = 0
    part.setConnected(true)
    expect(log).toEqual(["reconnected-left-0"])
  })
})
