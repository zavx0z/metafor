import "@metafor/meta"

export default MetaFor("{{name}}", { desc: "{{description}}" })
  .brane((field) => ({
    error: field.string.optional({ label: "{{errorLabel}}" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .bulk({
    gravity: ({ value, mass, html }) => html``,
    view: ({ css }) => css``,
  })
