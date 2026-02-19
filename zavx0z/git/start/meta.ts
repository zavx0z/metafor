import "@metafor/meta"

export default MetaFor("git-start").context((t) => ({
  command: t.enum(
    "clone",
    "init"
  ).optional({ label: "Команды начала работы" }),
}))
