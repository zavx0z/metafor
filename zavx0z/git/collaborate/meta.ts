import "@metafor/meta"

export default MetaFor("git-collaborate").context((t) => ({
  command: t.enum(
    "fetch",
    "pull",
    "push",
    "remote"
  ).optional({ label: "Команды совместной работы" }),
}))
