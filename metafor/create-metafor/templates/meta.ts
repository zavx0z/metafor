import { MetaFor } from "@metafor/dsl"

export default MetaFor("{{name}}", { desc: "{{description}}" })
  .fields((field) => ({
    error: field.string.optional({ label: "{{errorLabel}}" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => [])
  .reactions(() => [])
  .matter(({ value, mass, html }) => html``)
  .bulk({
    view: ({ css }) => css``,
  })
