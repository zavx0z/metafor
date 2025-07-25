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
  .actions((action) => ({
    loading: action(async ({ context }) => {
      // имитация асинхронного запроса
      if (context.email === "fail@example.com") throw new Error("Email уже занят")
      await new Promise((r) => setTimeout(r, 500))
      return { name: "User" }
    })
      .success(({ update, data }) => update({ isRegistered: true, error: "" }))
      .error(({ update, error }) => {
        update({ error: error.message, isRegistered: false })
      }),
    success: action(({ context }) => null).success(({ update }) => {
      update({ name: "", email: "", isRegistered: false })
    }),
    error: action(({ context }) => null).success(({ update }) => {
      update({ error: "" })
    }),
  }))
  .view({
    render: ({ context, html }) => html`<div>${context.name}</div>`,
    style: ({ css }) => css`
      div {
        color: #666;
      }
    `,
  })
