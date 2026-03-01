import "@metafor/meta"

export default MetaFor("{{name}}", { desc: "{{description}}" })
  .context((t) => ({
    error: t.string.optional({ label: "{{errorLabel}}" }),
  }))
  .states({})
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.error && html`<div class="error">${context.error}</div>`}
    `,
  })
