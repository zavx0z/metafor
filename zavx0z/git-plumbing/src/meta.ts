import "@metafor/meta"

export default MetaFor("git-plumbing", { desc: "Git plumbing — низкоуровневые команды" })
  .context((t) => ({
    operation: t.enum(
      "cat-file", "check-attr", "check-ignore", "check-mailmap", "commit-graph",
      "commit-tree", "count-objects", "diff-files", "diff-index", "diff-tree",
      "fast-export", "fast-import", "filter-branch", "fsck", "gitfile",
      "hash-object", "mktree", "multi-pack-index", "prune", "reflog",
      "rev-list", "rev-parse", "show-ref", "symbolic-ref", "unpack-objects",
      "update-index", "update-ref", "verify-commit", "verify-pack", "verify-tag"
    ).optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html` <meta-for src="zavx0z/git-plumbing-${context.operation}" context=${{ args: context.args }} /> `}
    `,
  })
