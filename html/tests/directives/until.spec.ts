import {beforeEach, describe, expect, test} from "bun:test"
import {html, nothing, render} from "../../html.js"
import {until} from "../../directives/until.js"

/** Помощник для создания Promises, которые могут быть разрешены или отклонены после первоначального создания. */
export class Deferred<T> {
  readonly promise: Promise<T>
  resolve!: (value: T) => void
  reject!: (error: Error) => void

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res
      this.reject = rej
    })
  }
}

const laterTask = () => new Promise(resolve => setTimeout(resolve))

describe("until directive", () => {
  let container: HTMLDivElement
  let deferred: Deferred<string>

  beforeEach(() => {
    container = document.createElement("div")
    deferred = new Deferred<string>()
  })

  test("renders a Promise when it resolves", async () => {
    const deferred = new Deferred<any>()
    render(
      html`
        <div>${until(deferred.promise)}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    deferred.resolve("foo")
    await deferred.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("renders non-Promises immediately", async () => {
    const defaultContent = html`
      <span>loading...</span>
    `
    render(
      html`
        <div>${until(deferred.promise, defaultContent)}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><span>loading...</span></div>")
    deferred.resolve("foo")
    await deferred.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("renders primitive low-priority content only once", async () => {
    const go = () =>
      render(
        html`
          <div>${until(deferred.promise, "loading...")}</div>
        `,
        container
      )

    go()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>loading...</div>")
    deferred.resolve("foo")
    await deferred.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    go()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("renders non-primitive low-priority content only once", async () => {
    const go = () =>
      render(
        html`
          <div>
            ${until(
              deferred.promise,
              html`
                loading...
              `
            )}
          </div>
        `,
        container
      )

    go()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>loading...</div>")
    deferred.resolve("foo")
    await deferred.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    go()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("renders changing defaultContent", async () => {
    const t = (d: any) =>
      html`
        <div>${until(deferred.promise, d)}</div>
      `
    render(t("A"), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>A</div>")

    render(t("B"), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>B</div>")

    deferred.resolve("C")
    await deferred.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>C</div>")
  })

  test("отображает Promise в атрибут", async () => {
    const promise = Promise.resolve("foo")
    render(
      html`
        <div test=${until(promise)}></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="foo"></div>')
  })

  test("отображает defaultContent в атрибут", async () => {
    const promise = Promise.resolve("foo")
    render(
      html`
        <div test=${until(promise, "bar")}></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="bar"></div>')
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="foo"></div>')
  })

  test("отображает Promise в интерполированный атрибут", async () => {
    const promise = Promise.resolve("foo")
    render(
      html`
        <div test="value:${until(promise)}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="value:"></div>')
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="value:foo"></div>')
  })

  test("отображает nothing fallback в интерполированный атрибут", async () => {
    const promise = Promise.resolve("foo")
    render(
      html`
        <div test="value:${until(promise, nothing)}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="value:foo"></div>')
  })

  test("отображает defaultContent в интерполированный атрибут", async () => {
    const promise = Promise.resolve("foo")
    render(
      html`
        <div test="value:${until(promise, "bar")}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="value:bar"></div>')
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test="value:foo"></div>')
  })

  test("отображает Promise в свойство", async () => {
    const promise = Promise.resolve("foo")
    render(
      html`
        <div .test=${until(promise)}></div>
      `,
      container
    )
    const div = container.querySelector("div")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect((div as any).test).toBeUndefined()
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect((div as any).test).toMatchStringHTML("foo")
  })

  test("отображает Promise в булевом атрибуте", async () => {
    const promise = Promise.resolve(true)
    render(
      html`
        <div ?test=${until(promise)}></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div test=""></div>')
  })

  test("отображает Promise в событие", async () => {
    let called = false
    const promise = Promise.resolve(() => {
      called = true
    })
    render(
      html`
        <div @test=${until(promise)}></div>
      `,
      container
    )
    const div = container.querySelector("div")!
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    div.dispatchEvent(new CustomEvent("test"))
    expect(called).toMatchStringHTML(false)
    await promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    div.dispatchEvent(new CustomEvent("test"))
    expect(called).toMatchStringHTML(true)
  })

  test("отображает новый Promise над существующим Promise", async () => {
    const t = (v: any) =>
      html`
        <div>
          ${until(
            v,
            html`
              <span>loading...</span>
            `
          )}
        </div>
      `
    render(t(deferred.promise), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><span>loading...</span></div>")

    const deferred2 = new Deferred<string>()
    render(t(deferred2.promise), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><span>loading...</span></div>")

    deferred2.resolve("bar")
    await deferred2.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")

    deferred.resolve("foo")
    await deferred.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")
  })

  test("отображает соревнование Promises между рендерами", async () => {
    const deferred1 = new Deferred<any>()
    const deferred2 = new Deferred<any>()

    const t = (promise: any) =>
      html`
        <div>${until(promise)}</div>
      `

    // First render, first Promise, no value
    render(t(deferred1.promise), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    // Second render, second Promise, still no value
    render(t(deferred2.promise), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    // Resolve the first Promise, should not update the container
    deferred1.resolve("foo")
    await deferred1.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    // Resolve the second Promise, should update the container
    deferred2.resolve("bar")
    await deferred2.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")
  })

  test("отображает Promises, решающиеся в высоко-низком приоритете", async () => {
    const deferred1 = new Deferred<any>()
    const deferred2 = new Deferred<any>()

    const t = () =>
      html`
        <div>${until(deferred1.promise, deferred2.promise)}</div>
      `

    // Первый рендер с обеими Promise не разрешены
    render(t(), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    // Разрешение первого Promise, обновляет DOM
    deferred1.resolve("foo")
    await deferred1.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    // Разрешение второго Promise, не обновляет DOM
    deferred2.resolve("bar")
    await deferred2.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("отображает Promises, решающиеся в низко-высоком приоритете", async () => {
    const deferred1 = new Deferred<any>()
    const deferred2 = new Deferred<any>()

    const t = () =>
      html`
        <div>${until(deferred1.promise, deferred2.promise)}</div>
      `

    // Первый рендер с обеими Promise не разрешены
    render(t(), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    // Разрешение второго Promise, обновляет DOM
    deferred2.resolve("bar")
    await deferred2.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")

    // Разрешение первого Promise, обновляет DOM
    deferred1.resolve("foo")
    await deferred1.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("отображает Promises с изменяющимися приоритетами", async () => {
    const promise1 = Promise.resolve("foo")
    const promise2 = Promise.resolve("bar")

    const t = (p1: any, p2: any) =>
      html`
        <div>${until(p1, p2)}</div>
      `

    render(t(promise1, promise2), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    // Ждем микрозадачу, чтобы оба Promise then callbacks завершились
    await 0
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    render(t(promise2, promise1), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
    await 0
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")
  })

  test("отображает низко-приоритетное содержимое, когда аргументы меняются", async () => {
    const deferred1 = new Deferred<any>()
    const promise2 = Promise.resolve("bar")

    const t = (p1: any, p2: any) =>
      html`
        <div>${until(p1, p2)}</div>
      `

    // Первый рендер с высоким приоритетом значением
    render(t("string", promise2), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>string</div>")
    // Ждем микрозадачу, чтобы оба Promise then callbacks завершились
    await 0
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>string</div>")

    // Затем рендер новых Promise с низким приоритетом Promise уже разрешен
    render(t(deferred1.promise, promise2), container)
    // Поскольку они являются Promise, ничего не происходит синхронно
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>string</div>")
    await 0
    // Низко-приоритетный рендер
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")
    deferred1.resolve("foo")
    await deferred1.promise
    // Высоко-приоритетный рендер
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")
  })

  test("отображает Promises, решающиеся после изменения приоритета", async () => {
    const deferred1 = new Deferred<any>()
    const deferred2 = new Deferred<any>()

    const t = (p1: any, p2: any) =>
      html`
        <div>${until(p1, p2)}</div>
      `

    // Первый рендер с обеими Promise не разрешены
    render(t(deferred1.promise, deferred2.promise), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    // Изменение приоритетов
    render(t(deferred2.promise, deferred1.promise), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    // Разрешение первого Promise, обновляет DOM
    deferred1.resolve("foo")
    await deferred1.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>foo</div>")

    // Разрешение второго Promise, также обновляет DOM
    deferred2.resolve("bar")
    await deferred2.promise
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bar</div>")
  })

  test("отображает литерал в ChildPart", () => {
    render(
      html`
        ${until("a")}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("a")
  })

  test("отображает литерал в AttributePart", () => {
    render(
      html`
        <div data-attr="${until("a")}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="a"></div>')
  })

  test("отображает литералы в интерполированном AttributePart", () => {
    render(
      html`
        <div data-attr="other ${until("a")} ${until("b")}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="other a b"></div>')
  })

  test("отображает литерал в BooleanAttributePart", () => {
    render(
      html`
        <div ?data-attr="${until("a")}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr=""></div>')
  })

  test("отображает литерал в EventPart", () => {
    let callCount = 0
    render(
      html`
        <div @some-event="${until(() => callCount++)}"></div>
      `,
      container
    )
    const div = container.querySelector("div") as HTMLDivElement
    div.dispatchEvent(new Event("some-event"))
    expect(callCount).toMatchStringHTML(1)
  })

  test("отображает литерал в PropertyPart", () => {
    render(
      html`
        <div .someProp="${until("a")}"></div>
      `,
      container
    )
    expect((container.querySelector("div")! as any).someProp).toMatchStringHTML("a")
  })

  test("отображает Promise в ChildPart", async () => {
    render(
      html`
        ${until(Promise.resolve("a"))}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("")

    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("a")
  })

  test("отображает Promise в AttributePart", async () => {
    render(
      html`
        <div data-attr="${until(Promise.resolve("a"))}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="a"></div>')
  })

  test("отображает Promises в интерполированном AttributePart", async () => {
    render(
      html`
        <div data-attr="other ${until(Promise.resolve("a"))} ${until(Promise.resolve("b"))}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="other  "></div>')

    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="other a b"></div>')
  })

  test("отображает Promise в BooleanAttributePart", async () => {
    render(
      html`
        <div ?data-attr="${until(Promise.resolve("a"))}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr=""></div>')
  })

  test("отображает Promise в PropertyPart", async () => {
    render(
      html`
        <div .someProp="${until(Promise.resolve("a"))}"></div>
      `,
      container
    )
    expect((container.querySelector("div")! as any).someProp).toBeUndefined()

    await laterTask()
    expect((container.querySelector("div")! as any).someProp).toMatchStringHTML("a")
  })

  test("отображает Promise в EventPart", async () => {
    let callCount = 0
    render(
      html`
        <div @some-event="${until(Promise.resolve(() => callCount++))}"></div>
      `,
      container
    )
    const div = container.querySelector("div") as HTMLDivElement
    div.dispatchEvent(new Event("some-event"))
    expect(callCount).toMatchStringHTML(0)

    await laterTask()
    div.dispatchEvent(new Event("some-event"))
    expect(callCount).toMatchStringHTML(1)
  })

  test("отображает promise-like в ChildPart", async () => {
    const thenable = {
      then(resolve: (arg: unknown) => void) {
        resolve("a")
      }
    }

    render(
      html`
        ${until(thenable)}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("")

    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("a")
  })

  test("отображает promise-like в AttributePart", async () => {
    const thenable = {
      then(resolve: (arg: unknown) => void) {
        resolve("a")
      }
    }

    render(
      html`
        <div data-attr="${until(thenable)}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="a"></div>')
  })

  test("отображает promise-likes в интерполированном AttributePart", async () => {
    const thenableA = {
      then(resolve: (arg: unknown) => void) {
        resolve("a")
      }
    }

    const thenableB = {
      then(resolve: (arg: unknown) => void) {
        resolve("b")
      }
    }

    render(
      html`
        <div data-attr="other ${until(thenableA)} ${until(thenableB)}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="other  "></div>')

    await Bun.sleep(0)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr="other a b"></div>')
  })

  test("отображает promise-like в BooleanAttributePart", async () => {
    const thenable = {
      then(resolve: (arg: unknown) => void) {
        resolve("a")
      }
    }

    render(
      html`
        <div ?data-attr="${until(thenable)}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div data-attr=""></div>')
  })

  test("отображает promise-like в PropertyPart", async () => {
    const thenable = {
      then(resolve: (arg: unknown) => void) {
        resolve("a")
      }
    }

    render(
      html`
        <div .someProp="${until(thenable)}"></div>
      `,
      container
    )
    expect((container.querySelector("div")! as any).someProp).toBeUndefined()

    await laterTask()
    expect((container.querySelector("div")! as any).someProp).toMatchStringHTML("a")
  })

  test("отображает promise-like в EventPart", async () => {
    let callCount = 0
    const thenable = {
      then(resolve: (arg: unknown) => void) {
        resolve(() => callCount++)
      }
    }

    render(
      html`
        <div @some-event="${until(thenable)}"></div>
      `,
      container
    )
    const div = container.querySelector("div") as HTMLDivElement
    div.dispatchEvent(new Event("some-event"))
    expect(callCount).toMatchStringHTML(0)

    await laterTask()
    div.dispatchEvent(new Event("some-event"))
    expect(callCount).toMatchStringHTML(1)
  })

  test("отображает аргументы позже, пока ранее разрешенные Promise не разрешатся", async () => {
    let resolvePromise: (arg: any) => void
    const promise = new Promise((resolve, _reject) => {
      resolvePromise = resolve
    })

    render(
      html`
        ${until(promise, "default")}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("default")

    resolvePromise!("resolved value")
    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("resolved value")
  })

  test("промисы, находящиеся в массиве аргументов позже текущего используемого значения, не перезаписывают текущее значение при их разрешении", async () => {
    let resolvePromiseA: (arg: any) => void
    const promiseA = new Promise((resolve, _reject) => {
      resolvePromiseA = resolve
    })

    let resolvePromiseB: (arg: any) => void
    const promiseB = new Promise((resolve, _reject) => {
      resolvePromiseB = resolve
    })

    render(
      html`
        ${until(promiseA, promiseB, "default")}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("default")

    resolvePromiseA!("A")
    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("A")

    resolvePromiseB!("B")
    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("A")
  })

  test("промисы, находящиеся в массиве аргументов раньше текущего используемого значения, перезаписывают текущее значение при их разрешении", async () => {
    let resolvePromiseA: (arg: any) => void
    const promiseA = new Promise((resolve, _reject) => {
      resolvePromiseA = resolve
    })

    let resolvePromiseB: (arg: any) => void
    const promiseB = new Promise((resolve, _reject) => {
      resolvePromiseB = resolve
    })

    render(
      html`
        ${until(promiseA, promiseB, "default")}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("default")

    resolvePromiseB!("B")
    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("B")

    resolvePromiseA!("A")
    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("A")
  })

  test("промисы, находящиеся в массиве аргументов позже не-промиса, никогда не отображаются", async () => {
    let resolvePromise: (arg: any) => void
    const promise = new Promise((resolve, _reject) => {
      resolvePromise = resolve
    })

    render(
      html`
        ${until("default", promise)}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("default")

    resolvePromise!("resolved value")
    await laterTask()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("default")
  })

  describe("disconnection", () => {
    test("until не отображается, когда promise разрешается, пока отсоединен", async () => {
      let resolvePromise: (arg: any) => void
      const promise = new Promise((resolve, _reject) => {
        resolvePromise = resolve
      })

      const part = render(
        html`
          <div>${until(promise)}</div>
        `,
        container
      )
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

      part.setConnected(false)
      resolvePromise!("resolved")
      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

      part.setConnected(true)
      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>resolved</div>")
    })

    test("отсоединение переполнения", async () => {
      let resolvePromise: (arg: any) => void
      const promise = new Promise((resolve, _reject) => {
        resolvePromise = resolve
      })

      const part = render(
        html`
          <div>${until(promise)}</div>
        `,
        container
      )
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

      part.setConnected(false)
      resolvePromise!("resolved")
      await laterTask()
      part.setConnected(true)
      part.setConnected(false)

      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

      part.setConnected(true)
      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>resolved</div>")
    })

    test("until не отображается, когда новый рендер происходит, пока отсоединен", async () => {
      let resolvePromise: (arg: any) => void
      const promise = new Promise((resolve, _reject) => {
        resolvePromise = resolve
      })

      const template = (v: unknown) => html`
        <div>${v}</div>
      `

      const part = render(template(""), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

      part.setConnected(false)
      render(template(until(promise)), container)
      resolvePromise!("resolved")
      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")

      part.setConnected(true)
      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>resolved</div>")
    })

    test("until не отображается, когда разрешен и изменен, пока отсоединен", async () => {
      let resolvePromise: (arg: any) => void
      const promise = new Promise((resolve, _reject) => {
        resolvePromise = resolve
      })

      const template = (v: unknown) => html`
        <div>${v}</div>
      `

      const part = render(template("1"), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>1</div>")

      part.setConnected(false)
      render(template(until(promise)), container)
      await laterTask()

      render(template("2"), container)
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>2</div>")

      resolvePromise!("resolved")
      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>2</div>")

      part.setConnected(true)
      await laterTask()
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>2</div>")
    })

    test("тот же promise может быть отображен в два экземпляра until", async () => {
      let resolvePromise: (arg: any) => void
      const promise = new Promise((resolve, _reject) => {
        resolvePromise = resolve
      })

      render(
        html`
          <div>${until(promise, "unresolved1")}</div>
          <span>${until(promise, "unresolved2")}</span>
        `,
        container
      )
      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>unresolved1</div><span>unresolved2</span>")

      resolvePromise!("resolved")
      await promise

      expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>resolved</div><span>resolved</span>")
    })
  })
})
