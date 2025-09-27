import "../../schema"
import { test, expect, describe } from "bun:test"

// describe.skip("полный снимок компонента", () => {
//   describe("структура снимка", async () => {
//     const hash = MetaFor("test")
//       .context((types) => ({
//         title: types.string.required("Default Title", { title: "Заголовок" }),
//         count: types.number.required(0, { title: "Счетчик" }),
//         isActive: types.boolean.optional({ title: "Активен" }),
//         tags: types.array.required(["tag1", "tag2"], { title: "Теги" }),
//         status: types.enum("pending", "active", "completed").required("pending", { title: "Статус" }),
//       }))
//       .states({
//         idle: {
//           loading: { count: 0 },
//           error: { count: 0, isActive: false },
//         },
//         loading: {
//           idle: { count: 0 },
//           active: { count: 1, isActive: true },
//         },
//         active: {
//           idle: { count: 0 },
//           completed: { count: 10, status: "completed" },
//         },
//         completed: {},
//         error: {
//           idle: { count: 0, isActive: false },
//         },
//       })
//       .core({
//         apiUrl: "https://api.example.com",
//         version: "1.0.0",
//         config: {
//           timeout: 5000,
//           retries: 3,
//         },
//       })
//       .processes((process) => ({
//         loading: process({ title: "loading", description: "loading description" })
//           .action(({ context }) => new Promise((resolve) => setTimeout(() => resolve(context.count + 1), 100)))
//           .success(({ update }) => update({ count: 1, isActive: true }))
//           .error(({ update }) => update({ isActive: false })),
//         active: process()
//           .action(() => Promise.resolve("success"))
//           .success(({ update }) => update({ count: 10, status: "completed" })),
//       }))
//       .reactions((reaction) => [
//         [
//           ["idle"],
//           reaction({ title: "log_state_changes" })
//             .filter({ op: "replace", path: "/state" })
//             .equal(({ update, context }) => update({ count: context.count + 1 })),
//         ],
//         [
//           ["loading", "active", "idle"],
//           reaction({ title: "set_count_10" })
//             .filter({ op: "replace", path: "/state" })
//             .equal(({ update }) => update({ count: 10 })),
//         ],
//       ])
//       .view({
//         render: ({ html, context, state, update }) => html`
//           <div class="container">
//             <h1>${context.title}</h1>
//             <p>Счетчик: ${context.count}</p>
//             <p>Статус: ${context.status}</p>
//             <p>Состояние: ${state}</p>
//             <button @click=${() => update({ count: context.count + 1 })}>Увеличить</button>
//             <ul>
//               ${context.tags.map((tag) => html`<li>${tag}</li>`)}
//             </ul>
//           </div>
//         `,
//         style: ({ css }) => css`
//           .container {
//             padding: 20px;
//             border: 1px solid #ccc;
//             border-radius: 8px;
//             background-color: #f9f9f9;
//           }

//           h1 {
//             color: #333;
//             font-size: 24px;
//             margin-bottom: 16px;
//           }

//           button {
//             background-color: #007bff;
//             color: white;
//             border: none;
//             padding: 8px 16px;
//             border-radius: 4px;
//             cursor: pointer;
//           }

//           button:hover {
//             background-color: #0056b3;
//           }
//         `,
//       })

//     await Bun.sleep(200)

//     const snapshot = {} as any
//     test("снимок содержит все поля: state, states, context, render, style, processes, reactions", async () => {
//       // Проверяем структуру снимка
//       expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("state")
//       expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("states")
//       expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("context")
//       expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("render")
//       expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("style")
//       expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("processes")
//       expect(snapshot, "снимок должен содержать все обязательные поля").toHaveProperty("reactions")
//     })

//     test("состояние", async () => {
//       // Проверяем состояние (процессы могут изменить начальное состояние)
//       expect(["idle", "loading", "active", "completed"], "состояние должно быть одним из ожидаемых").toContain(
//         snapshot.state
//       )

//       // Проверяем конфигурацию состояний
//       expect(snapshot.states, "должна содержать все состояния").toEqual({
//         idle: {
//           loading: { count: 0 },
//           error: { count: 0, isActive: false },
//         },
//         loading: {
//           idle: { count: 0 },
//           active: { count: 1, isActive: true },
//         },
//         active: {
//           idle: { count: 0 },
//           completed: { count: 10, status: "completed" },
//         },
//         completed: {},
//         error: {
//           idle: { count: 0, isActive: false },
//         },
//       })
//     })
//     test("контекст", async () => {
//       expect(snapshot.context, "контекст должен содержать все поля с метаданными").toMatchObject({
//         title: {
//           type: "string",
//           required: true,
//           title: "Заголовок",
//           default: "Default Title",
//         },
//         count: {
//           type: "number",
//           required: true,
//           title: "Счетчик",
//           default: 0,
//         },
//         isActive: {
//           type: "boolean",
//           required: false,
//         },
//         tags: {
//           type: "array",
//           required: true,
//           title: "Теги",
//           default: ["tag1", "tag2"],
//         },
//         status: {
//           type: "enum",
//           required: true,
//           title: "Статус",
//           values: ["pending", "active", "completed"],
//           default: "pending",
//         },
//       })
//     })
//     test("реакции", async () => {
//       expect(snapshot.reactions, "реакции должны содержать все поля").toMatchObject({
//         reactions: {
//           log_state_changes_0: {
//             cond: {
//               op: "replace",
//               path: "/state",
//             },
//             read: ["count"],
//             write: ["count"],
//             title: "log_state_changes",
//           },
//           set_count_10_1: {
//             write: ["count"],
//             cond: {
//               op: "replace",
//               path: "/state",
//             },
//             title: "set_count_10",
//           },
//         },
//         states: {
//           idle: ["log_state_changes_0", "set_count_10_1"],
//           loading: ["set_count_10_1"],
//           active: ["set_count_10_1"],
//         },
//       })
//     })
//     test("render", async () => {
//       expect(snapshot.render, "render должен содержать извлеченный HTML template").toContain('<div class="container">')
//       expect(snapshot.render, "render должен содержать извлеченный HTML template").toContain("<h1>")
//       expect(snapshot.render, "render должен содержать извлеченный HTML template").toContain("${context.title}")
//       expect(snapshot.render, "render должен содержать извлеченный HTML template").toContain("${context.count}")
//     })

//     test("style", async () => {
//       expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain(".container {")
//       expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain("padding: 20px;")
//       expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain("background-color: #f9f9f9;")
//       expect(snapshot.style, "style должен содержать извлеченный CSS template").toContain("button:hover {")
//     })

//     test("processes", async () => {
//       expect(snapshot.processes, "processes должен содержать все процессы").toMatchObject({
//         loading: {
//           title: "loading",
//           description: "loading description",
//           action: { read: ["count"] },
//           success: { write: ["count", "isActive"] },
//         },
//         active: {
//           success: { write: ["count", "status"] },
//         },
//       })
//     })
//   })
//   describe.skip("обновление снимка", async () => {
//     const contextTestHash = MetaFor("context-test")
//       .context((types) => ({
//         value: types.string.required("initial"),
//       }))
//       .states({
//         state_1: {},
//       })
//       .core()
//       .processes()
//       .reactions()
//       .view({
//         render: ({ html, context }) => html`<div>${context.value}</div>`,
//         style: ({ css }) => css`
//           .test {
//             color: red;
//           }
//         `,
//       })

//     const element = {} as any
//     await Bun.sleep(100)

//     const initialSnapshot = element.snapshot
//     expect(initialSnapshot.context.value.value, "начальное значение должно быть initial").toBe("initial")

//     element.update({ value: "updated" })
//     await Bun.sleep(100)

//     const updatedSnapshot = element.snapshot
//     expect(updatedSnapshot.context.value.value, "значение должно быть обновлено").toBe("updated")
//   })

//   describe("обновление состояния", async () => {
//     const stateTestHash = MetaFor("state-test")
//       .context((types) => ({
//         value: types.string.required("initial"),
//       }))
//       .states({
//         state_1: { state_2: { value: "state2" } },
//         state_2: {},
//       })
//       .core()
//       .processes()
//       .reactions()
//       .view({
//         render: ({ html, context }) => html`<div>${context.value}</div>`,
//         style: ({ css }) => css`
//           .test {
//             color: red;
//           }
//         `,
//       })

//     await Bun.sleep(100)

//     const initialSnapshot = {} as any
//     expect(initialSnapshot.state, "начальное состояние должно быть state_1").toBe("state_1")

//     const updatedSnapshot = {} as any
//     await Bun.sleep(100)

//     test("снимок обновляется при изменении состояния", async () => {
//       expect(updatedSnapshot.state, "состояние должно остаться state_1").toBe("state_1")
//       expect(updatedSnapshot.context.value.value, "значение должно быть обновлено").toBe("state2")
//     })
//   })
// })
