import "@metafor/meta"

export default MetaFor("git-stash")
  .context((t) => ({
    operation: t.enum("stash").optional({ label: "Тип операции" }),
    error: t.string.optional({ label: "Ошибка" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({
    "ожидание команды": {
      выполнение: {},
    },
    выполнение: {
      "ожидание команды": { operation: null },
    },
  })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation && html`
        <meta-for
          src="zavx0z/git-stash-${context.operation}"
          context=${{
            
            args: context.args,
          }} />
      `}
      ${context.error && html`
        <meta-for
          src="zavx0z/git-error"
          context=${{ message: context.error }} />
      `}
    `,
  })
