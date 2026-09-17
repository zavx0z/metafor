import {describe, test, expect, beforeAll} from "bun:test"
import {html, render} from "../../html.js"
import {ref, createRef} from "../../directives/ref.js"
import type {RefOrCallback} from "../../directives/ref.js"

describe("ref", () => {
  let container: HTMLDivElement

  beforeAll(() => {
    container = document.createElement("div")
  })

  test("sets a ref on a Ref object", () => {
    const divRef = createRef()
    render(
      html`
        <div ${ref(divRef)}></div>
      `,
      container
    )
    const div = container.firstElementChild
    expect(divRef.value).toBe(div)
  })

  test("calls a ref callback", () => {
    let divRef: Element | undefined
    const divCallback = (el: Element | undefined) => (divRef = el)
    render(
      html`
        <div ${ref(divCallback)}></div>
      `,
      container
    )
    const div = container.firstElementChild
    expect(divRef).toBe(div)
  })

  test("handles an undefined ref", () => {
    render(
      html`
        <div ${ref(undefined)}></div>
      `,
      container
    )
    const div = container.firstElementChild
    // Not much to assert. We mainly care that we didn't throw
    expect(div).toBeDefined()
  })

  test("sets a ref when Ref object changes", () => {
    const divRef1 = createRef()
    const divRef2 = createRef()

    const go = (r: RefOrCallback<Element>) =>
      render(
        html`
          <div ${ref(r)}></div>
        `,
        container
      )
    go(divRef1)
    const div1 = container.firstElementChild
    expect(divRef1.value).toBe(div1)

    go(divRef2)
    const div2 = container.firstElementChild
    expect(divRef1.value).toBeUndefined()
    expect(divRef2.value).toBe(div2)
  })

  test("calls a ref callback when callback changes", () => {
    let divRef: Element | undefined
    const divCallback1 = (el: Element | undefined) => (divRef = el)
    const divCallback2 = (el: Element | undefined) => (divRef = el)

    const go = (r: RefOrCallback<Element>) =>
      render(
        html`
          <div ${ref(r)}></div>
        `,
        container
      )

    go(divCallback1)
    const div1 = container.firstElementChild
    expect(divRef).toBe(div1)

    go(divCallback2)
    const div2 = container.firstElementChild
    expect(divRef).toBe(div2)
  })

  test("only sets a ref when element changes", () => {
    let queriedEl: Element | null
    let callCount = 0
    const elRef = createRef()

    // Patch Ref to observe value changes
    let value: Element | undefined
    Object.defineProperty(elRef, "value", {
      set(v: Element | undefined) {
        value = v
        callCount++
      },
      get() {
        return value
      }
    })

    const go = (x: boolean) =>
      render(
        x
          ? html`
              <div ${ref(elRef)}></div>
            `
          : html`
              <span ${ref(elRef)}></span>
            `,
        container
      )

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(elRef.value).toBe(queriedEl)
    expect(callCount).toBe(1)

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(elRef.value).toBe(queriedEl)
    expect(callCount).toBe(1)

    go(false)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("SPAN")
    expect(elRef.value).toBe(queriedEl)
    expect(callCount).toBe(2)
  })

  test("only calls a ref callback when element changes", () => {
    let queriedEl: Element | null
    const calls: Array<string | undefined> = []
    const elCallback = (e: Element | undefined) => {
      calls.push(e?.tagName)
    }
    const go = (x: boolean) =>
      render(
        x
          ? html`
              <div ${ref(elCallback)}></div>
            `
          : html`
              <span ${ref(elCallback)}></span>
            `,
        container
      )

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(calls).toEqual(["DIV"])

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(calls).toEqual(["DIV"])

    go(false)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("SPAN")
    expect(calls).toEqual(["DIV", undefined, "SPAN"])

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(calls).toEqual(["DIV", undefined, "SPAN", undefined, "DIV"])
  })

  test("calls callback bound to options.host", () => {
    class Host {
      bool = false
      calls: Array<string | undefined> = []
      root = document.createElement("div")
      elCallback(e: Element | undefined) {
        this.calls.push(e?.tagName)
      }
      render() {
        return render(
          this.bool
            ? html`
                <div ${ref(this.elCallback)}></div>
              `
            : html`
                <span ${ref(this.elCallback)}></span>
              `,
          this.root,
          {host: this}
        )
      }
    }

    const testRef = (host: Host, initialCalls: Array<string | undefined> = []) => {
      let queriedEl: Element | null
      host.bool = true
      host.render()
      queriedEl = host.root.firstElementChild
      expect(queriedEl?.tagName).toBe("DIV")
      expect(host.calls).toEqual([...initialCalls, "DIV"])

      host.bool = true
      host.render()
      queriedEl = host.root.firstElementChild
      expect(queriedEl?.tagName).toBe("DIV")
      expect(host.calls).toEqual([...initialCalls, "DIV"])

      host.bool = false
      host.render()
      queriedEl = host.root.firstElementChild
      expect(queriedEl?.tagName).toBe("SPAN")
      expect(host.calls).toEqual([...initialCalls, "DIV", undefined, "SPAN"])

      host.bool = true
      host.render()
      queriedEl = host.root.firstElementChild
      expect(queriedEl?.tagName).toBe("DIV")
      expect(host.calls).toEqual([...initialCalls, "DIV", undefined, "SPAN", undefined, "DIV"])
    }

    // Test first instance
    const host1 = new Host()
    testRef(host1)

    // Test second instance
    const host2 = new Host()
    testRef(host2)

    // Test on first instance again
    // (reset boolean to render SPAN, so we see an initial change
    // back to DIV)
    host1.bool = false
    host1.render()
    // Add in an undefined call for the initial switch from SPAN back to DIV
    testRef(host1, [...host1.calls, undefined])
  })

  test("two refs", () => {
    const divRef1 = createRef()
    const divRef2 = createRef()
    render(
      html`
        <div ${ref(divRef1)} ${ref(divRef2)}></div>
      `,
      container
    )
    const div = container.firstElementChild
    expect(divRef1.value).toBe(div)
    expect(divRef2.value).toBe(div)
  })

  test("two ref callbacks alternating", () => {
    let queriedEl: Element | null
    const divCalls: Array<string | undefined> = []
    const divCallback = (e: Element | undefined) => {
      divCalls.push(e?.tagName)
    }
    const spanCalls: Array<string | undefined> = []
    const spanCallback = (e: Element | undefined) => {
      spanCalls.push(e?.tagName)
    }
    const go = (x: boolean) =>
      render(
        x
          ? html`
              <div ${ref(divCallback)}></div>
            `
          : html`
              <span ${ref(spanCallback)}></span>
            `,
        container
      )

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(divCalls).toEqual(["DIV"])
    expect(spanCalls).toEqual([])

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(divCalls).toEqual(["DIV"])
    expect(spanCalls).toEqual([])

    go(false)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("SPAN")
    expect(divCalls).toEqual(["DIV", undefined])
    expect(spanCalls).toEqual(["SPAN"])

    go(true)
    queriedEl = container.firstElementChild
    expect(queriedEl?.tagName).toBe("DIV")
    expect(divCalls).toEqual(["DIV", undefined, "DIV"])
    expect(spanCalls).toEqual(["SPAN", undefined])
  })

  test("refs are always set in tree order", () => {
    const elRef = createRef()
    const go = () =>
      render(
        html`
          <div id="first" ${ref(elRef)}></div>
          <div id="next" ${ref(elRef)}>
            ${html`
              <span id="last" ${ref(elRef)}></span>
            `}
          </div>
        `,
        container
      )

    go()
    expect(elRef.value!.id).toBe("last")
    go()
    expect(elRef.value!.id).toBe("last")
  })

  test("callbacks are always called in tree order", () => {
    const calls: Array<string | undefined> = []
    const elCallback = (e: Element | undefined) => {
      calls.push(e?.id)
    }
    const go = () =>
      render(
        html`
          <div id="first" ${ref(elCallback)}></div>
          <div id="next" ${ref(elCallback)}>
            ${html`
              <span id="last" ${ref(elCallback)}></span>
            `}
          </div>
        `,
        container
      )

    go()
    expect(calls).toEqual(["first", undefined, "next", undefined, "last"])
    calls.length = 0
    go()
    expect(calls).toEqual([undefined, "first", undefined, "next", undefined, "last"])
  })

  test("Ref passed to ref directive changes", () => {
    const aRef = createRef()
    const bRef = createRef()
    const go = (x: boolean) =>
      render(
        html`
          <div ${ref(x ? aRef : bRef)}></div>
        `,
        container
      )

    go(true)
    expect(aRef.value?.tagName).toBe("DIV")
    expect(bRef.value).toBeUndefined()
    go(false)
    expect(aRef.value).toBeUndefined()
    expect(bRef.value?.tagName).toBe("DIV")
    go(true)
    expect(aRef.value?.tagName).toBe("DIV")
    expect(bRef.value).toBeUndefined()
  })

  test("callback passed to ref directive changes", () => {
    const aCalls: Array<string | undefined> = []
    const aCallback = (el: Element | undefined) => aCalls.push(el?.tagName)
    const bCalls: Array<string | undefined> = []
    const bCallback = (el: Element | undefined) => bCalls.push(el?.tagName)
    const go = (x: boolean) =>
      render(
        html`
          <div ${ref(x ? aCallback : bCallback)}></div>
        `,
        container
      )

    go(true)
    expect(aCalls).toEqual(["DIV"])
    expect(bCalls).toEqual([])
    go(false)
    expect(aCalls).toEqual(["DIV", undefined])
    expect(bCalls).toEqual(["DIV"])
    go(true)
    expect(aCalls).toEqual(["DIV", undefined, "DIV"])
    expect(bCalls).toEqual(["DIV", undefined])
  })

  test("new callback created each render", () => {
    const calls: Array<string | undefined> = []
    const go = () =>
      render(
        html`
          <div ${ref(el => calls.push(el?.tagName))}></div>
        `,
        container
      )
    go()
    expect(calls).toEqual(["DIV"])
    go()
    expect(calls).toEqual(["DIV", undefined, "DIV"])
    go()
    expect(calls).toEqual(["DIV", undefined, "DIV", undefined, "DIV"])
  })

  test("set to undefined when disconnected and reset when reconnected", () => {
    let value: Element | undefined
    const go = () =>
      render(
        html`
          <div ${ref(el => (value = el))}></div>
        `,
        container
      )
    const part = go()
    expect(value).toBe(container.firstElementChild)
    part.setConnected(false)
    expect(value).toBeUndefined()
    part.setConnected(true)
    expect(value).toBe(container.firstElementChild)
  })

  test("always undefined when disconnected", () => {
    let value: Element | undefined
    const go = () =>
      render(
        html`
          <div ${ref(el => (value = el))}></div>
        `,
        container
      )
    const part = go()
    part.setConnected(false)
    go()
    expect(value).toBeUndefined()
  })
})
