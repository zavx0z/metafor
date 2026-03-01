import "@metafor/meta"

export default MetaFor("git-start-init", { desc: "Git start-init — команда git" })
  .context((t) => ({
    error: field.string.optional({ label: "Ошибка" }),
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
