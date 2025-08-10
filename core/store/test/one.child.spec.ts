import { test, expect, describe, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { MetaClass } from "../../../core/store/index.ts"

const db = new Database("test.sqlite")
const store = new SQLiteStore("test.sqlite")
const MetaFor = MetaForFabric({ store })

const parentName = Bun.randomUUIDv7()
const childName = Bun.randomUUIDv7()

describe.skip("работа со статическими тегами", async () => {
  let parentMounted = false
  let childMounted = false

  const childHash = MetaFor(childName)
    .context((types) => ({
      message: types.string.required("child message"),
      count: types.number.required(1),
    }))
    .states({
      idle: {},
    })
    .core()
    .processes()
    .reactions()
    .view({
      onMount: () => {
        childMounted = true
      },
      render: ({ context, html }) => html`
        <div>
          <p>Сообщение: ${context.message}</p>
          <p>Счетчик: ${context.count}</p>
        </div>
      `,
    })

  const parentHash = MetaFor(parentName)
    .context((types) => ({
      parentMessage: types.string.required("message"),
      parentCount: types.number.required(0),
    }))
    .states({
      idle: {},
    })
    .core()
    .processes()
    .reactions()
    .view({
      onMount: () => {
        parentMounted = true
      },
      render: ({ context, html }) => html`
      <div>
        <h1>Родитель: ${context.parentMessage}</h1>
        <meta-${childHash}
          context=${{
            message: context.parentMessage,
            count: context.parentCount,
          }}></meta-${childHash}>
      </div>
    `,
    })

  document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`

  test("должно быть создано 2 мета", () => {
    const allMeta = db.prepare("SELECT * FROM meta").as(MetaClass).all()

    expect(allMeta.length, "должно быть создано 2 мета").toBe(2)
    expect(
      allMeta.find((meta) => meta.meta === parentHash),
      "родительский мета присутствует"
    ).toBeTruthy()
    expect(
      allMeta.find((meta) => meta.meta === childHash),
      "дочерний мета присутствует"
    ).toBeTruthy()
  })

  test("ребенок должен быть отрендерен", () => {
    expect(childMounted, "ребенок должен быть отрендерен").toBeTrue()
  })

  test("родитель должен быть отрендерен", () => {
    expect(parentMounted, "родитель должен быть отрендерен").toBeTrue()
  })

  afterAll(async () => {
    db.close()
    await Bun.file("test.sqlite").delete()
    await Bun.file("test.sqlite-shm").delete()
    await Bun.file("test.sqlite-wal").delete()
  })
})
