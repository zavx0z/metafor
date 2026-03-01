export default MetaFor("gravity", {
  desc: "Gravity",
})
  .context((t) => ({
    bool: field.boolean.optional(true),
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
