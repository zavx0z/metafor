import { describe, test, expect, afterAll, beforeAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"

describe("персистентность: parent/child и idx (SQLite)", () => {
  const dbPath = "children.persist.sqlite"
  let db: Database
  let store: SQLiteStore

  beforeAll(() => {
    try {
      Bun.file(dbPath).deleteSync()
      Bun.file(`${dbPath}-shm`).deleteSync()
      Bun.file(`${dbPath}-wal`).deleteSync()
    } catch {}
    db = new Database(dbPath)
    store = new SQLiteStore(dbPath)
  })

  afterAll(async () => {
    db.close()
    try {
      await Bun.file(dbPath).delete()
      await Bun.file(`${dbPath}-shm`).delete()
      await Bun.file(`${dbPath}-wal`).delete()
    } catch {}
  })

  test("дети получают корректный parent_id и последовательный idx", async () => {
    const MetaFor = MetaForFabric({ store })
    const parentName = `parent-${Bun.randomUUIDv7()}`
    const childName = `child-${Bun.randomUUIDv7()}`

    const childHash = MetaFor(childName)
      .context((types) => ({ msg: types.string.required("child") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({ render: ({ html, context }) => html`<div>${context.msg}</div>` })

    const parentHash = MetaFor(parentName)
      .context((types) => ({ title: types.string.required("p") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`
          <section>
            <h1>${context.title}</h1>
            <meta-${childHash}></meta-${childHash}>
            <meta-${childHash}></meta-${childHash}>
          </section>
        `,
      })

    document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
    await Bun.sleep(150)

    const parentActor = db
      .prepare("SELECT * FROM actor WHERE meta = ? AND parent_id IS NULL AND idx = 0")
      .get(parentHash) as any
    expect(parentActor, "родитель должен существовать").toBeTruthy()

    const children = db.prepare("SELECT * FROM actor WHERE parent_id = ? ORDER BY idx ASC").all(parentActor.id) as any[]
    expect(children.length, "должно быть 2 ребенка").toBe(2)
    expect(children[0].meta, "child meta совпадает").toBe(childHash)
    expect(children[1].meta, "child meta совпадает").toBe(childHash)
    expect(children[0].idx, "первый ребенок имеет idx=0").toBe(0)
    expect(children[1].idx, "второй ребенок имеет idx=1").toBe(1)
  })
})


