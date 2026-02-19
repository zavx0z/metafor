import "@metafor/meta"

export default MetaFor("git-examine").context((t) => ({
  command: t.enum(
    "show",
    "status",
    "describe",
    "log",
    "diff",
    "range-diff",
    "shortlog"
  ).optional({ label: "Команды просмотра" }),
}))
