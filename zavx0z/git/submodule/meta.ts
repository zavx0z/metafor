import "@metafor/meta"

export default MetaFor("git-submodule").context((t) => ({
  command: t.enum(
    "submodule"
  ).optional({ label: "Команды submodule" }),
}))
