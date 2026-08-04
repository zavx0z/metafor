export default MetaFor(/* @template nameJson */ "", { desc: /* @template descriptionJson */ "" })
  .fields((field) => (/* @template fieldsBody */ {}))
  .superposition({})
  .mass(() => ({}))
  .energy()
  .processes(() => [])
  .reactions(() => [])
  .matter(({ html }) => html``)
  .bulk({
    view: ({ css }) => css``,
  })
