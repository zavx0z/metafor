import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-history", {
  desc: "Git history — команды управления историей (switch, checkout, commit, reset, revert)",
})
  .fields((field) => ({
    operation: field
      .enum("switch", "checkout", "commit", "reset", "revert", "bisect", "repair")
      .optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .gravity(
    ({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-history-${value.operation}" fields=${{ args: value.args }} /> `}
    `,
  )
  .bulk()
