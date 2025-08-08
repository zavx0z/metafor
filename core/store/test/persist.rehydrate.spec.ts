import { describe, test, expect, afterAll, beforeAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"

const name = Bun.randomUUIDv7()

describe("персистентность: ре-гидратация корневого актора (SQLite)", () => {
  const dbPath = "persist.rehydrate.sqlite"
  let db: Database
  let store: SQLiteStore

  beforeAll(async () => {
    try {
      // очистка на всякий случай
      await Bun.file(dbPath).delete()
      await Bun.file(`${dbPath}-shm`).delete()
      await Bun.file(`${dbPath}-wal`).delete()
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

  test("значения контекста восстанавливаются перед первым рендером", async () => {
    // создаем фабрику с тем же стором
    const LocalMetaFor = MetaForFabric({ store })

    const hash = LocalMetaFor(name)
      .context((types) => ({
        value: types.string.required("initial"),
      }))
      .states({
        idle: {},
      })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div id="root">${context.value}</div>`,
      })

    // первый монт
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    const el1 = document.querySelector(`meta-${hash}`) as any
    await Bun.sleep(100)
    // проверяем snapshot (shadowRoot закрыт у актора, DOM недоступен)
    expect(el1.snapshot.context.value.value, "начальное значение должно быть initial").toBe("initial")

    // обновляем контекст и убеждаемся, что стор содержит обновленный снапшот
    el1.update({ value: "updated" })
    await Bun.sleep(100)

    const actorRow = db.prepare("SELECT * FROM actor WHERE meta = ? AND parent_id IS NULL AND idx = 0").get(hash) as any
    expect(actorRow, "запись актора должна существовать").toBeTruthy()

    const snap = JSON.parse(actorRow.snapshot)
    expect(snap.context.value.value, "в снапшоте должно быть updated").toBe("updated")

    // размонтирование
    document.body.innerHTML = ""
    await Bun.sleep(50)

    // повторный монт (ре-гидратация)
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    const el2 = document.querySelector(`meta-${hash}`) as any
    await Bun.sleep(100)

    // ожидаем, что до первого render были применены сохраненные значения
    // проверяем snapshot (значение восстановлено)
    expect(el2.snapshot.context.value.value, "должно восстановиться updated").toBe("updated")
  })
})
