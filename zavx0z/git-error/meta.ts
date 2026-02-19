import "@metafor/meta"

export default MetaFor("git-error")
  .context((t) => ({
    message: t.string.optional({ label: "Сообщение ошибки" }),
  }))
  .states({ idle: {} })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
