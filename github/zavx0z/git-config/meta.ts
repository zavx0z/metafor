import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-config", { desc: "Git config — конфигурация и справка" })
  .fields((field) => ({
    operation: field.enum("config", "help").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .gravity(({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-config-${value.operation}" fields=${{ args: value.args }} /> `}
    `)
  .bulk()
