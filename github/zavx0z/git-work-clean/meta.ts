import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-work-clean", { desc: "Git work-clean — команда git" })
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
