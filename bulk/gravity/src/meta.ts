import "@metafor/meta"

export default MetaFor("gravity", {
  desc: "Gravity",
})
  .context((t) => ({
    bool: t.boolean.optional(true),
  }))
  .states({
    ожидание: { завершено: { bool: true } },
    завершено: {},
  })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html``,
  })
