import "@metafor/meta"

export default MetaFor("git-work").context((t) => ({
  command: t.enum(
    "add",
    "mv",
    "restore",
    "rm",
    "sparse-checkout",
    "clean"
  ).optional({ label: "Команды работы с файлами" }),
}))