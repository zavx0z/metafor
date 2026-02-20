import "@metafor/meta"

export default MetaFor("git-work-mv", { desc: "Git work-mv — команда git" })
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
