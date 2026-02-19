import "@metafor/meta"

export default MetaFor("git-config").context((t) => ({
  command: t.enum(
    "config",
    "help"
  ).optional({ label: "Команды конфигурации" }),
}))
