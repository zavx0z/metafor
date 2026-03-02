import "@metafor/meta"

export default MetaFor("git-start", { desc: "Git start — команды начала работы (clone, init)" })
  .brane((field) => ({
    operation: field.enum("clone", "init").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .bulk({
    gravity: ({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-start-${value.operation}" context=${{ args: value.args }} /> `}
    `,
  })
