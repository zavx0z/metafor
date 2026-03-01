import "@metafor/meta"

export default MetaFor("git-config", { desc: "Git config — конфигурация и справка" })
  .context((t) => ({
    operation: field.enum("config", "help").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-config-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
