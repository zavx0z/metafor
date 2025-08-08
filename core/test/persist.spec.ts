import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { SQLiteStore } from "../../server/store/index"
import { MetaForFabric } from "../index"

describe("параметр persist", () => {
  const dbPath = "persist.test.sqlite"
  let db: Database
  let store: SQLiteStore

  beforeEach(() => {
    db = new Database(dbPath, { create: true })
    store = new SQLiteStore(dbPath)
  })

  afterEach(async () => {
    db.close()
    try {
      await Bun.file(dbPath).delete()
      await Bun.file(`${dbPath}-shm`).delete()
      await Bun.file(`${dbPath}-wal`).delete()
    } catch {}
  })

  test("persist: true - восстанавливает состояние и сохраняет обновления", async () => {
    const LocalMetaFor = MetaForFabric({ store })
    const name = "persist-true-test"

    const hash = LocalMetaFor(name, { persist: true })
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
        render: ({ html, context }) => html`<div>${context.value}</div>`,
      })

    // Первый монт
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    const el1 = document.querySelector(`meta-${hash}`) as any
    await Bun.sleep(100)

    expect(el1.snapshot.context.value.value, "начальное значение должно быть initial").toBe("initial")

    // Обновляем контекст
    el1.update({ value: "updated" })
    await Bun.sleep(100)

    // Проверяем, что snapshot обновился в базе
    const actorRow1 = db.prepare("SELECT * FROM actor WHERE meta = ?").get(hash) as any
    expect(actorRow1, "запись актора должна существовать").toBeTruthy()

    const snap1 = JSON.parse(actorRow1.snapshot)
    expect(snap1.context.value.value, "snapshot должен обновиться на updated").toBe("updated")

    // Размонтирование
    document.body.innerHTML = ""
    await Bun.sleep(50)

    // Повторный монт (восстановление)
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    const el2 = document.querySelector(`meta-${hash}`) as any
    await Bun.sleep(100)

    // Должно восстановиться обновленное значение
    expect(el2.snapshot.context.value.value, "должно восстановиться updated значение").toBe("updated")
  })

  test("persist: false - не восстанавливает состояние и не сохраняет обновления", async () => {
    const LocalMetaFor = MetaForFabric({ store })
    const name = "persist-false-test"

    const hash = LocalMetaFor(name, { persist: false })
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
        render: ({ html, context }) => html`<div>${context.value}</div>`,
      })

    // Первый монт
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    const el1 = document.querySelector(`meta-${hash}`) as any
    await Bun.sleep(100)

    expect(el1.snapshot.context.value.value, "начальное значение должно быть initial").toBe("initial")

    // Получаем начальный snapshot из базы
    const actorRowInitial = db.prepare("SELECT * FROM actor WHERE meta = ?").get(hash) as any
    expect(actorRowInitial, "запись актора должна существовать").toBeTruthy()

    const snapInitial = JSON.parse(actorRowInitial.snapshot)
    expect(snapInitial.context.value.value, "начальный snapshot должен быть initial").toBe("initial")

    // Обновляем контекст
    el1.update({ value: "updated" })
    await Bun.sleep(100)

    // Проверяем, что snapshot НЕ обновился в базе
    const actorRow1 = db.prepare("SELECT * FROM actor WHERE meta = ?").get(hash) as any
    const snap1 = JSON.parse(actorRow1.snapshot)
    expect(snap1.context.value.value, "snapshot НЕ должен обновиться, остается initial").toBe("initial")

    // Размонтирование
    document.body.innerHTML = ""
    await Bun.sleep(50)

    // Повторный монт (восстановление)
    document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
    const el2 = document.querySelector(`meta-${hash}`) as any
    await Bun.sleep(100)

    // Должно восстановиться начальное значение (не updated)
    expect(el2.snapshot.context.value.value, "должно восстановиться начальное значение initial").toBe("initial")
  })

  test("persist включается в fingerprint и сохраняется в таблице meta", async () => {
    const LocalMetaFor = MetaForFabric({ store })

    // Компонент с persist: false
    const hash1 = LocalMetaFor("test-persist-false", { persist: false })
      .context((types) => ({ value: types.string.required("test") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()

    // Компонент с persist: true
    const hash2 = LocalMetaFor("test-persist-true", { persist: true })
      .context((types) => ({ value: types.string.required("test") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()

    // Хеши должны быть разными, так как persist влияет на fingerprint
    expect(hash1, "хеши должны отличаться").not.toBe(hash2)

    // Проверяем сохранение persist в таблице meta
    const meta1 = db.prepare("SELECT * FROM meta WHERE meta = ?").get(hash1) as any
    const meta2 = db.prepare("SELECT * FROM meta WHERE meta = ?").get(hash2) as any

    expect(meta1.persist, "persist: false должен сохраниться как 0").toBe(0)
    expect(meta2.persist, "persist: true должен сохраниться как 1").toBe(1)
  })
})
