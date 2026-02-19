import "@metafor/meta"

export default MetaFor("git-history").context((t) => ({
  command: t.enum(
    "switch",
    "checkout",
    "commit",
    "reset",
    "revert",
    "bisect",
    "repair"
  ).optional({ label: "Команды истории" }),
}))