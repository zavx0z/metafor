import "@metafor/meta"

export default MetaFor("git-error", { desc: "Git error — команда git" })
  .fields((field) => ({
    error: field.string.optional({ label: "Ошибка" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .bulk({
    gravity: ({ value, html }) => html`
      ${value.error && html`<div class="error">${value.error}</div>`}
    `,
  })
