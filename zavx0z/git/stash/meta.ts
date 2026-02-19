import "@metafor/meta"

export default MetaFor("git-stash").context((t) => ({
  command: t.enum(
    "stash"
  ).optional({ label: "Команды stash" }),
}))