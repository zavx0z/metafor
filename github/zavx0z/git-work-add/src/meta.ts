import "@metafor/meta"

export default MetaFor("git-work-add", { desc: "Git work-add — команда git" })
  .brane((field) => ({
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
