import "@metafor/meta"

export default MetaFor("git-submodule", { desc: "Git submodule — управление субмодулями" })
  .brane((field) => ({
    operation: field.enum("submodule").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .bulk({
    gravity: ({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-submodule-${value.operation}" context=${{ args: value.args }} /> `}
    `,
  })
