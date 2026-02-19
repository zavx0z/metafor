import "@metafor/meta"

export default MetaFor("git-worktree").context((t) => ({
  command: t.enum(
    "worktree"
  ).optional({ label: "Команды worktree" }),
}))
