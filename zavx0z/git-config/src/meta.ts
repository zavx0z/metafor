import "@metafor/meta"

export default MetaFor("git-config", { desc: "Git config — конфигурация и справка" })
  .context((t) => ({
    operation: t.enum("config", "help").optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-config-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
