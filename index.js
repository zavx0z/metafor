import { MetaFor } from "./dist/metafor.js"

MetaFor("user")
  .context((types) => ({
    name: types.string.required("Anonymous"),
    email: types.string.required(""),
    error: types.string.optional(),
    isRegistered: types.boolean.required(false),
  }))
  .states({
    form: { loading: { name: { length: { min: 2 } }, email: { pattern: /@/ } } },
    loading: {
      success: { isRegistered: true },
      error: { error: { notEq: "" } },
    },
    success: { form: {} },
    error: { form: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        // имитация асинхронного запроса
        if (context.email === "fail@example.com") throw new Error("Email уже занят")
        await new Promise((r) => setTimeout(r, 500))
        return { name: "User" }
      })
      .success(({ update, data }) => update({ isRegistered: true, error: "", name: data.name }))
      .error(({ update, error }) => {
        update({ error: error.message, isRegistered: false })
      }),
    success: process()
      .action(() => null)
      .success(({ update }) => {
        update({ name: "", email: "", isRegistered: false })
      }),
    error: process()
      .action(() => null)
      .success(({ update }) => {
        update({ error: "" })
      }),
  }))
  .reactions((reaction) => [
    [
      ["form", "loading"],
      reaction()
        .filter({
          tag: "user",
        })
        .equal(({ update }) => update({ name: "User" })),
    ],
  ])
  .view({
    render: ({ context, html }) => html`<div>${context.name}</div>`,
    style: ({ css }) => css`
      div {
        color: #666;
      }
    `,
  })
