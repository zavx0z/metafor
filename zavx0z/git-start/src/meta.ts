import "@metafor/meta"

export default MetaFor("git-start", { desc: "Git start — команды начала работы (clone, init)" })
  .context((t) => ({
    operation: t.enum("clone", "init").optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-start-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
