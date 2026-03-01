import "@metafor/meta"

export default MetaFor("git-collaborate", { desc: "Git collaborate — команды совместной работы (fetch, pull, push, remote)" })
  .context((t) => ({
    operation: field.enum("fetch", "pull", "push", "remote").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-collaborate-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
