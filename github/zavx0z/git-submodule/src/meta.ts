import "@metafor/meta"

export default MetaFor("git-submodule", { desc: "Git submodule — управление субмодулями" })
  .context((t) => ({
    operation: field.enum("submodule").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-submodule-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
