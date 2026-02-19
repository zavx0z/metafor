import "@metafor/meta"

export default MetaFor("git-start-init", { desc: "Git init — инициализация репозитория" })
  .context((t) => ({
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({ idle: {} })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
