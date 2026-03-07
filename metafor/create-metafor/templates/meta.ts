import { MetaFor } from "@metafor/dsl"

export default MetaFor("{{name}}", { desc: "{{description}}" })
  .fields((field) => ({
    error: field.string.optional({ label: "{{errorLabel}}" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .bulk({
    gravity: ({ value, mass, html }) => html``,
    view: ({ css }) => css``,
  })
