import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-submodule", { desc: "Git submodule — управление субмодулями" })
  .fields((field) => ({
    operation: field.enum("submodule").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .gravity(({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-submodule-${value.operation}" context=${{ args: value.args }} /> `}
    `)
  .bulk()
