import { test, expect, describe } from "bun:test"
import { MetaForFabric } from "../../../core/index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"

describe("функционал получения родительского meta и индекса", () => {
  const store = new SQLiteStore(":memory:")
  const MetaFor = MetaForFabric({ store })

  const single = MetaFor(Bun.randomUUIDv7())
    .context((types) => ({
      title: types.string.required("Single"),
    }))
    .states({
      idle: {},
    })
    .core({})
    .processes(() => ({}))
    .reactions(() => [])
    .view({
      render: ({ html }) => html`<div>Single</div>`,
    })

  document.body.innerHTML = `<meta-${single}></meta-${single}>`
  const actors = store.getAllActors()

  test("в базе должен быть один экземпляр мета", () => {
    expect(actors.length, "должен быть создан ровно один актор").toBe(1)
  })

  const actor = actors[0]!

  test("не должно быть родителя", () => {
    expect(actor.parent_id, "у корневого актора не должно быть родителя").toBeNull()
  })

  test("meta должен соответствовать хешу компонента", () => {
    expect(actor.meta, "meta должен соответствовать хешу компонента").toBe(single)
  })

  test("индекс равен 0", () => {
    expect(actor.idx, "индекс корневого актора должен быть 0").toBe(0)
  })
})
