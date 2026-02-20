import "@metafor/meta"

export default MetaFor("git-work-add", { desc: "Git work-add — команда git" })
  .context((t) => ({
    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.error && html`<div class="error">${context.error}</div>`}
    `,
  })
