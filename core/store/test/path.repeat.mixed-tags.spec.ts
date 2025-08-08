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

describe("path + repeat: смешанные теги на одном уровне", () => {
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

  test("индексация среди одноименных тэгов, пути для разных мет уникальны", async () => {
    const A = MetaFor("mixed-a", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const a = A
    const B = MetaFor("mixed-b", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const b = B

    // порядок: A, B, A, B
    const tpl = () => html`<div>
      <meta-${a}></meta-${a}>
      <meta-${b}></meta-${b}>
      <meta-${a}></meta-${a}>
      <meta-${b}></meta-${b}>
    </div>`
    render(tpl(), container)
    await Bun.sleep(10)

    const nodesA = Array.from(container.querySelectorAll(`meta-${a}`)) as any[]
    const nodesB = Array.from(container.querySelectorAll(`meta-${b}`)) as any[]
    expect(nodesA[0]?.path, "первый A idx 0").toBe(`${a}:0`)
    expect(nodesA[1]?.path, "второй A idx 1").toBe(`${a}:1`)
    expect(nodesB[0]?.path, "первый B idx 0").toBe(`${b}:0`)
    expect(nodesB[1]?.path, "второй B idx 1").toBe(`${b}:1`)
  })
})
