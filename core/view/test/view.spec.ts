import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../../web/metafor.ts"

describe("MetaFor view", () => {
  test.skip("Рендерит правильный текст через внутренний snapshot", async () => {
    let snapshot = ""
    let btn = undefined as unknown as HTMLButtonElement
    const hash = MetaFor("test-view")
      .context((t) => ({
        param: t.boolean.required(false),
      }))
      .states({
        init: {},
      })
      .core()
      .processes(() => ({}))
      .reactions()
      .view({
        render: ({ html, update, context }) => {
          snapshot = `${context.param ? "true" : "false"}`
          return html`
            <button ref=${btn} onclick=${() => update({ param: !context.param })}>
              ${context.param ? "true" : "false"}
            </button>
          `
        },
        onMount() {
          if (btn) btn.click()
        },
      })
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    await Bun.sleep(10)
    expect(snapshot).toBe("true") // после клика
  })

  test.skip("Обновляет snapshot при изменении контекста", async () => {
    let snapshot = ""
    let btn = undefined as unknown as HTMLButtonElement
    const hash = MetaFor("test-view-update")
      .context((t) => ({
        param: t.boolean.required(false),
      }))
      .states({
        init: {},
      })
      .core()
      .processes(() => ({}))
      .reactions()
      .view({
        render: ({ html, update, context }) => {
          snapshot = `${context.param ? "true" : "false"}`
          return html` <button ref=${btn} onclick=${() => update({ param: !context.param })}>
            ${context.param ? "true" : "false"}
          </button>`
        },
        onMount() {
          if (btn) btn.click()
        },
      })
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    await Bun.sleep(10)
    expect(snapshot).toBe("true")
    if (btn) btn.click()
    await Bun.sleep(10)
    expect(snapshot).toBe("false")
  })

  test("onMount не вызывается повторно при update (API)", async () => {
    let mountCount = 0
    let snapshot = ""
    let btn = undefined as unknown as HTMLButtonElement
    const hash = MetaFor("test-view-api")
      .context((t) => ({
        param: t.boolean.required(false),
      }))
      .states({
        init: {},
      })
      .core()
      .processes(() => ({}))
      .reactions()
      .view({
        render: ({ html, update, context }) => {
          snapshot = `${context.param ? "true" : "false"}`
          return html` <button ref=${btn} onclick=${() => update({ param: !context.param })}>
            ${context.param ? "true" : "false"}
          </button>`
        },
        onMount() {
          mountCount++
          if (btn) btn.click()
        },
      })
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    await Bun.sleep(10)
    // update через API
    const meta = document.querySelector(`meta-${hash}`) as any
    meta.update({ param: false })
    await Bun.sleep(10)
    expect(mountCount).toBe(1)
  })
})
