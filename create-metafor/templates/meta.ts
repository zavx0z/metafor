export default MetaFor({{nameJson}}, { desc: {{descriptionJson}} })
  .fields((field) => ({
    error: field.string.optional({ label: {{errorLabelJson}} }),
  }))
  .superposition({})
  .mass({})
  .processes(() => [])
  .reactions(() => [])
  .matter(({ html }) => html``)
  .bulk({
    view: ({ css }) => css``,
  })
