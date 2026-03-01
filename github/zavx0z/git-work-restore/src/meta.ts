import "@metafor/meta"

export default MetaFor("git-work-restore", { desc: "Git work-restore — команда git" })
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
