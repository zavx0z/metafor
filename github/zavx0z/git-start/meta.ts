import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-start", { desc: "Git start — команды начала работы (clone, init)" })
  .fields((field) => ({
    operation: field.enum("clone", "init").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .matter(
    ({ value, html }) => html`
      <meta-for
        src="zavx0z/git-start-${value.operation}"
        fields=${{
          args: value.args,
        }} />
    `,
  )
  .bulk()
