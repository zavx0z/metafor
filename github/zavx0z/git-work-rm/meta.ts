import "@metafor/meta"

export default MetaFor("git-work-rm", { desc: "Git work-rm — команда git" })
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
