import "@metafor/meta"

export default MetaFor("git-work-add", { desc: "Git add — добавление файлов в индекс" })
  .context((t) => ({
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({ idle: {} })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
