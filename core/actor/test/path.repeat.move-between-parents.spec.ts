import { describe, test, expect, beforeEach } from "bun:test"
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
}

describe("перенос ребёнка между разными родителями", () => {
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

  test("ребёнок меняет parent segment в path", async () => {
    const Child = MetaFor("move-child", { dev: true }).context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const child = Child

    const Parent = MetaFor("move-parent", { dev: true })
      .context((t) => ({ arr: t.array.required(["x"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div class="p">
          ${repeat(
            context.arr,
            (it) => it,
            (it) => html`<meta-${child} data-key=${it}></meta-${child}>`
          )}
        </div>`,
      })
    const parent = Parent

    let order = ["A", "B"]
    const Page = () => html`<div>
      ${repeat(
        order,
        (it) => it,
        (it) => html`<meta-${parent} data-p=${it} context=${{ arr: ["x"] }}></meta-${parent}>`
      )}
    </div>`

    render(Page(), container)
    await Bun.sleep(10)
    const pA = container.querySelector(`meta-${parent}[data-p="A"]`) as any
    const pB = container.querySelector(`meta-${parent}[data-p="B"]`) as any
    const xA = pA.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xA.path, "ребенок x у A").toBe(`${parent}:0/${child}:0`)

    // перенос x из A к B
    pA.update({ arr: [] })
    pB.update({ arr: ["x"] })
    await Bun.sleep(10)
    const xB = pB.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xB.path, "ребенок x теперь у B").toBe(`${parent}:1/${child}:0`)
  })
})


