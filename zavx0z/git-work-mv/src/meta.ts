import "@metafor/meta"

export default MetaFor("git-work-mv", { desc: "Git mv — перемещение файлов" })
  .context((t) => ({
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({ idle: {} })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
