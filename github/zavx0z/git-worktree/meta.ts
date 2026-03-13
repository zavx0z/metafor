import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-worktree", { desc: "Git worktree — управление рабочими деревьями" })
  .fields((field) => ({
    operation: field.enum("worktree").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .gravity(({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-worktree-${value.operation}" context=${{ args: value.args }} /> `}
    `)
  .bulk()
