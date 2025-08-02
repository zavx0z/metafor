import { test, expect, describe } from "bun:test"
import { MetaFor } from "../../web/metafor.ts"

describe("полный снимок компонента", () => {
  test("снимок содержит все поля: state, states, context, view, style", async () => {
    document.body.innerHTML = `<metafor-test></metafor-test>`

    MetaFor("test")
      .context((types) => ({
        title: types.string.required("Default Title")({ title: "Заголовок" }),
        count: types.number.required(0)({ title: "Счетчик" }),
        isActive: types.boolean.optional()({ title: "Активен" }),
        tags: types.array.required(["tag1", "tag2"])({ title: "Теги" }),
        status: types.enum("pending", "active", "completed").required("pending")({ title: "Статус" }),
      }))
      .states({
        idle: {
          loading: { count: 0 },
          error: { count: 0, isActive: false },
        },
        loading: {
          idle: { count: 0 },
          active: { count: 1, isActive: true },
        },
        active: {
          idle: { count: 0 },
          completed: { count: 10, status: "completed" },
        },
        completed: {},
        error: {
          idle: { count: 0, isActive: false },
        },
      })
      .core((ref) => ({
        apiUrl: "https://api.example.com",
        version: "1.0.0",
        config: {
          timeout: 5000,
          retries: 3,
        },
      }))
      .processes((process) => ({
        loading: process()
          .action(() => new Promise((resolve) => setTimeout(resolve, 100)))
          .success(({ update }) => update({ count: 1, isActive: true }))
          .error(({ update }) => update({ isActive: false })),
        active: process()
          .action(() => Promise.resolve("success"))
          .success(({ update }) => update({ count: 10, status: "completed" })),
      }))
      .reactions((reaction) => [
        [
          ["idle"],
          reaction({ title: "log_state_changes" })
            .filter({ op: "replace", path: "/state" })
            .equal(({ meta, patch }) => console.log("State changed:", patch.value)),
        ],
      ])
      .view({
        render: ({ html, context, state, update }) => html`
          <div class="container">
            <h1>${context.title}</h1>
            <p>Счетчик: ${context.count}</p>
            <p>Статус: ${context.status}</p>
            <p>Состояние: ${state}</p>
            <button @click=${() => update({ count: context.count + 1 })}>Увеличить</button>
            <ul>
              ${context.tags.map((tag) => html`<li>${tag}</li>`)}
            </ul>
          </div>
        `,
        style: ({ css }) => css`
          .container {
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 8px;
            background-color: #f9f9f9;
          }

          h1 {
            color: #333;
            font-size: 24px;
            margin-bottom: 16px;
          }

          button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
          }

          button:hover {
            background-color: #0056b3;
          }
        `,
      })

    const element = document.querySelector("metafor-test") as any
    await Bun.sleep(200)

    const snapshot = element.getSnapshot()

    // Проверяем структуру снимка
    expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("state")
    expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("states")
    expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("context")
    expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("view")
    expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("style")

    // Проверяем состояние (процессы могут изменить начальное состояние)
    expect(["idle", "loading", "active", "completed"], "состояние должно быть одним из ожидаемых").toContain(
      snapshot.state
    )

    // Проверяем конфигурацию состояний
    expect(snapshot.states, "должна содержать все состояния").toEqual({
      idle: {
        loading: { count: 0 },
        error: { count: 0, isActive: false },
      },
      loading: {
        idle: { count: 0 },
        active: { count: 1, isActive: true },
      },
      active: {
        idle: { count: 0 },
        completed: { count: 10, status: "completed" },
      },
      completed: {},
      error: {
        idle: { count: 0, isActive: false },
      },
    })

    // Проверяем контекст с метаданными (процессы могут изменить значения)
    expect(snapshot.context, "контекст должен содержать все поля с метаданными").toMatchObject({
      title: {
        type: "string",
        required: true,
        title: "Заголовок",
        default: "Default Title",
      },
      count: {
        type: "number",
        required: true,
        title: "Счетчик",
        default: 0,
      },
      isActive: {
        type: "boolean",
        required: false,
      },
      tags: {
        type: "array",
        required: true,
        title: "Теги",
        default: ["tag1", "tag2"],
      },
      status: {
        type: "enum",
        required: true,
        title: "Статус",
        values: ["pending", "active", "completed"],
        default: "pending",
      },
    })

    // Проверяем HTML template
    expect(snapshot.view, "view должен содержать извлеченный HTML template").toContain('<div class="container">')
    expect(snapshot.view, "view должен содержать извлеченный HTML template").toContain("<h1>")
    expect(snapshot.view, "view должен содержать извлеченный HTML template").toContain("${context.title}")
    expect(snapshot.view, "view должен содержать извлеченный HTML template").toContain("${context.count}")

    // Проверяем CSS template
    expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain(".container {")
    expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain("padding: 20px;")
    expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain("background-color: #f9f9f9;")
    expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain("button:hover {")
  })

  test("снимок обновляется при изменении контекста", async () => {
    document.body.innerHTML = `<metafor-context-test></metafor-context-test>`

    MetaFor("context-test")
      .context((types) => ({
        value: types.string.required("initial"),
      }))
      .states({
        state_1: {},
      })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div>${context.value}</div>`,
        style: ({ css }) =>
          css`
            .test {
              color: red;
            }
          `,
      })

    const element = document.querySelector("metafor-context-test") as any
    await Bun.sleep(100)

    // Получаем начальный снимок
    const initialSnapshot = element.getSnapshot()
    expect(initialSnapshot.context.value.value, "начальное значение должно быть initial").toBe("initial")

    // Обновляем контекст
    element.update({ value: "updated" })
    await Bun.sleep(100)

    // Получаем обновленный снимок
    const updatedSnapshot = element.getSnapshot()
    expect(updatedSnapshot.context.value.value, "значение должно быть обновлено").toBe("updated")
  })

  test("снимок обновляется при изменении состояния", async () => {
    document.body.innerHTML = `<metafor-state-test></metafor-state-test>`

    MetaFor("state-test")
      .context((types) => ({
        value: types.string.required("initial"),
      }))
      .states({
        state_1: { state_2: { value: "state2" } },
        state_2: {},
      })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div>${context.value}</div>`,
        style: ({ css }) =>
          css`
            .test {
              color: red;
            }
          `,
      })

    const element = document.querySelector("metafor-state-test") as any
    await Bun.sleep(100)

    // Получаем начальный снимок
    const initialSnapshot = element.getSnapshot()
    expect(initialSnapshot.state, "начальное состояние должно быть state_1").toBe("state_1")

    // Обновляем контекст
    element.update({ value: "state2" })
    await Bun.sleep(100)

    // Получаем обновленный снимок
    const updatedSnapshot = element.getSnapshot()
    expect(updatedSnapshot.state, "состояние должно остаться state_1").toBe("state_1")
    expect(updatedSnapshot.context.value.value, "значение должно быть обновлено").toBe("state2")
  })
})
