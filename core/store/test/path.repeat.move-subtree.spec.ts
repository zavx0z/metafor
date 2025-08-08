import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import type { ActorStore, MetaRecord, Store } from "../../store/index.t.ts"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

class MemStore implements Store {
  #auto = 1
  #metas = new Map<string, string>()
  #actors: ActorStore[] = []
  saveMetaIsNotExists(fingerprint: string): string {
    const name = JSON.parse(fingerprint).name as string
    const hash = `test-${name}`
    if (!this.#metas.has(hash)) this.#metas.set(hash, fingerprint)
    return hash
  }
  getMeta(meta: string): MetaRecord | null {
    const fp = this.#metas.get(meta)
    return fp ? { meta, fingerprint: fp, timestamp: new Date().toISOString() } : null
  }
  saveActorIsNotExist(actor: Omit<ActorStore, "id" | "timestamp">): ActorStore {
    const found = this.#actors.find(
      (a) => a.meta === actor.meta && a.parent_id === actor.parent_id && a.idx === actor.idx
    )
    if (found) return found
    const rec: ActorStore = { id: this.#auto++, timestamp: new Date().toISOString(), ...actor }
    this.#actors.push(rec)
    return rec
  }
  getActorByMeta(meta: string): ActorStore | null {
    return [...this.#actors].reverse().find((a) => a.meta === meta) || null
  }
  updateActorSnapshot(id: number, snapshot: string): void {
    const row = this.#actors.find((a) => a.id === id)
    if (row) row.snapshot = snapshot
  }
  getActorByComposite(meta: string, parent_id: number | null, idx: number): ActorStore | null {
    return this.#actors.find((a) => a.meta === meta && a.parent_id === parent_id && a.idx === idx) || null
  }
  updateActorLocation(id: number, parent_id: number | null, idx: number): void {
    const row = this.#actors.find((a) => a.id === id)
    if (row) {
      row.parent_id = parent_id
      row.idx = idx
    }
  }
  getActorByKey(meta: string, parent_id: number | null, key: string): ActorStore | null {
    return this.#actors.find((a) => a.meta === meta && a.parent_id === parent_id && a.key === key) || null
  }
  getActorByKeyAnyParent(meta: string, key: string): ActorStore | null {
    return this.#actors.find((a) => a.meta === meta && a.key === key) || null
  }
  updateActorKey(id: number, key: string): void {
    const row = this.#actors.find((a) => a.id === id)
    if (row) row.key = key
  }
}

describe("перенос поддерева между родителями", () => {
  let store: MemStore
  let MetaFor: ReturnType<typeof MetaForFabric>
  let container: HTMLDivElement

  beforeEach(() => {
    store = new MemStore()
    MetaFor = MetaForFabric({ store })
    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.append(container)
  })

  test("поддерево меняет префикс пути на новый родитель", async () => {
    const Leaf = MetaFor("ms-leaf", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const leaf = Leaf

    const Inner = MetaFor("ms-inner", { dev: true })
      .context((t) => ({ arr: t.array.required([1]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) =>
          html`<div>
            ${repeat(
              context.arr,
              (x) => x,
              () => html`<meta-${leaf}></meta-${leaf}>`
            )}
          </div>`,
      })
    const inner = Inner

    const Outer = MetaFor("ms-outer", { dev: true })
      .context((t) => ({ inners: t.array.required(["I1"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) =>
          html`<section>
            ${repeat(
              context.inners,
              (k) => k,
              () => html`<meta-${inner}></meta-${inner}>`
            )}
          </section>`,
      })
    const outer = Outer

    // Два родителя-наружных
    let roots = ["A", "B"]
    const Page = () =>
      html`<div id="page">
        ${repeat(
          roots,
          (r) => r,
          () => html`<meta-${outer}></meta-${outer}>`
        )}
      </div>`
    render(Page(), container)
    await Bun.sleep(10)

    const A = container.querySelectorAll(`meta-${outer}`)[0] as any
    const B = container.querySelectorAll(`meta-${outer}`)[1] as any
    const leafA = A.shadowRoot!.querySelector(`meta-${inner}`)!.shadowRoot!.querySelector(`meta-${leaf}`) as any
    expect(leafA.path, "лист в A").toBe(`${outer}:0/${inner}:0/${leaf}:0`)

    // Перенос поддерева: убираем inner из A и добавляем в B
    const innerA = A.shadowRoot!.querySelector(`meta-${inner}`) as any
    innerA.update({ arr: [] })
    const innerB = B.shadowRoot!.querySelector(`meta-${inner}`) as any
    innerB.update({ arr: [1] })
    await Bun.sleep(10)

    const leafB = B.shadowRoot!.querySelector(`meta-${inner}`)!.shadowRoot!.querySelector(`meta-${leaf}`) as any
    expect(leafB.path, "лист теперь под B").toBe(`${outer}:1/${inner}:0/${leaf}:0`)

    // Ре-гидратация: меняем контекст у листа под B и повторно монтируем всю страницу
    leafB.update({ v: "persist-subtree" })
    await Bun.sleep(20)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(Page(), container)
    await Bun.sleep(60)
    const B2 = container.querySelectorAll(`meta-${outer}`)[1] as any
    const leafB2 = B2.shadowRoot!.querySelector(`meta-${inner}`)!.shadowRoot!.querySelector(`meta-${leaf}`) as any
    expect(leafB2.snapshot.context.v.value, "лист под B восстановил контекст из стора").toBe("persist-subtree")
  })
})
