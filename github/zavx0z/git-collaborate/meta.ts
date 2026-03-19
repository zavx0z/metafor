import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-collaborate", { desc: "Git collaborate — команды совместной работы (fetch, pull, push, remote)" })
  .fields((field) => ({
    operation: field.enum("fetch", "pull", "push", "remote").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .matter(({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-collaborate-${value.operation}" fields=${{ args: value.args }} /> `}
    `)
  .bulk()
