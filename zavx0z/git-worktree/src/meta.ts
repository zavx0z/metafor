import "@metafor/meta"

export default MetaFor("git-worktree", { desc: "Git worktree — управление рабочими деревьями" })
  .context((t) => ({
    operation: t.enum("worktree").optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-worktree-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
