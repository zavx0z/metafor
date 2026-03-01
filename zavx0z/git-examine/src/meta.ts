import "@metafor/meta"

export default MetaFor("git-examine", { desc: "Git examine — команды просмотра (show, status, diff, log)" })
  .context((t) => ({
    operation: field.enum("show", "status", "describe", "log", "diff", "range-diff", "shortlog").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-examine-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
