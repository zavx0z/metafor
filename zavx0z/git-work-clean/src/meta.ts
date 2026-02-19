import "@metafor/meta"

export default MetaFor("git-work-clean", { desc: "Git clean — очистка неотслеживаемых файлов" })
  .context((t) => ({
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({ idle: {} })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
