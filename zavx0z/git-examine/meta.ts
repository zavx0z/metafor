import "@metafor/meta"

export default MetaFor("git-examine")
  .context((t) => ({
    operation: t.enum("show", "status", "describe", "log", "diff", "range-diff", "shortlog").optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-examine-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
