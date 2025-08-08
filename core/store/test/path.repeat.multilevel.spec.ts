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

describe("path + repeat: многоуровневые вложенности", () => {
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

  test("перестановки на 3 уровнях корректно обновляют path", async () => {
    const Child = MetaFor("ml-child", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const childHash = Child

    const Parent = MetaFor("ml-parent", { dev: true })
      .context((t) => ({ arr: t.array.required(["a"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<section class="parent">
          ${repeat(
            context.arr,
            (it) => it,
            (it) => html`<meta-${childHash} data-key=${it}></meta-${childHash}>`
          )}
        </section>`,
      })
    const parentHash = Parent

    const Grand = MetaFor("ml-grand", { dev: true })
      .context((t) => ({ parents: t.array.required(["P1"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div id="grand">
          ${repeat(
            context.parents,
            (p) => p,
            (p) => html`<meta-${parentHash} data-parent=${p} context=${{ arr: ["a", "b", "c"] }}></meta-${parentHash}>`
          )}
        </div>`,
      })
    const grandHash = Grand

    // Монтируем один grand
    const tpl = () => html`<meta-${grandHash}></meta-${grandHash}>`
    render(tpl(), container)
    await Bun.sleep(10)

    const grand = container.querySelector(`meta-${grandHash}`) as any
    const p1 = grand.shadowRoot!.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    expect(grand.path, "grand idx 0").toBe(`${grandHash}:0`)
    expect(p1.path, "p1 под grand").toBe(`${grandHash}:0/${parentHash}:0`)
    const cNodes = Array.from(p1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(
      cNodes.map((n) => n.path),
      "дети p1"
    ).toEqual([
      `${grandHash}:0/${parentHash}:0/${childHash}:0`,
      `${grandHash}:0/${parentHash}:0/${childHash}:1`,
      `${grandHash}:0/${parentHash}:0/${childHash}:2`,
    ])

    // Перестановка детей внутри p1
    p1.update({ arr: ["c", "b", "a"] })
    await Bun.sleep(10)
    const cNodes2 = Array.from(p1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(
      cNodes2.map((n) => n.path),
      "дети p1 переставлены"
    ).toEqual([
      `${grandHash}:0/${parentHash}:0/${childHash}:0`,
      `${grandHash}:0/${parentHash}:0/${childHash}:1`,
      `${grandHash}:0/${parentHash}:0/${childHash}:2`,
    ])

    // Добавим второго родителя P2
    grand.update({ parents: ["P1", "P2"] })
    await Bun.sleep(10)
    const p2 = grand.shadowRoot!.querySelector(`meta-${parentHash}[data-parent="P2"]`) as any
    expect(p2.path, "p2 idx 1").toBe(`${grandHash}:0/${parentHash}:1`)

    // Перестановка родителей: [P2, P1]
    grand.update({ parents: ["P2", "P1"] })
    await Bun.sleep(10)
    const np1 = grand.shadowRoot!.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    expect(np1.path, "p1 стал idx 1").toBe(`${grandHash}:0/${parentHash}:1`)
    const np1Child = (np1.shadowRoot!.querySelectorAll(`meta-${childHash}`)[0] as any)!
    expect(np1Child.path, "ребёнок p1 скорректировал путь").toBe(`${grandHash}:0/${parentHash}:1/${childHash}:0`)
  })
})
