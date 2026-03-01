import "@metafor/meta"

export default MetaFor("git-work-rm", { desc: "Git work-rm — команда git" })
  .context((t) => ({
    error: t.string.optional({ label: "Ошибка" }),
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
