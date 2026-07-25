export default MetaFor(/* @template nameJson */ "", { desc: /* @template descriptionJson */ "" })
  .fields((field) => ({
    error: field.string.optional({ label: /* @template errorLabelJson */ "" }),
  }))
  .superposition({})
  .mass(() => ({}))
  .energy()
  .processes(() => [])
  .reactions(() => [])
  .matter(({ html }) => html``)
  .bulk({
    view: ({ css }) => css``,
  })
