import "@metafor/meta"

export default MetaFor("git-stash", { desc: "Git stash — отложенные изменения" })
  .context((t) => ({
    operation: field.enum("stash").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-stash-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
