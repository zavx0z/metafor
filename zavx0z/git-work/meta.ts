import "@metafor/meta"

export default MetaFor("git-work")
  .context((t) => ({
    operation: t.enum("add", "mv", "restore", "rm", "clean", "sparse-checkout").optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-work-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
