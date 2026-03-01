import "@metafor/meta"

export default MetaFor("git-history", { desc: "Git history — команды управления историей (switch, checkout, commit, reset, revert)" })
  .context((t) => ({
    operation: t
      .enum("switch", "checkout", "commit", "reset", "revert", "bisect", "repair")
      .optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-history-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
