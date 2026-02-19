import "@metafor/meta"

export default MetaFor("git-submodule")
  .context((t) => ({
    operation: t.enum("submodule").optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-submodule-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
