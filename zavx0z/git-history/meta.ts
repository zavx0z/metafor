import "@metafor/meta"

export default MetaFor("git-history")
  .context((t) => ({
    operation: t.enum("switch", "checkout", "commit", "reset", "revert", "bisect", "repair").optional({ label: "Тип операции" }),
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
          src="zavx0z/git-history-${context.operation}"
          context=${{
            command: context.operation,
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
