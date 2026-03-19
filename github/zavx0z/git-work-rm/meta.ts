import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-work-rm", { desc: "Git work-rm — команда git" })
  .fields((field) => ({
    error: field.string.optional({ label: "Ошибка" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .matter(({ value, html }) => html`
      ${value.error && html`<div class="error">${value.error}</div>`}
    `)
  .bulk()
