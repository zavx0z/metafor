import "@metafor/meta"

export default MetaFor("git-start-clone", { desc: "Git clone — клонирование репозитория" })
  .context((t) => ({
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({ idle: {} })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
