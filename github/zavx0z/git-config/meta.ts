import "@metafor/meta"

export default MetaFor("git-config", { desc: "Git config — конфигурация и справка" })
  .fields((field) => ({
    operation: field.enum("config", "help").optional({ label: "Тип операции" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .bulk({
    gravity: ({ value, html }) => html`
      ${value.operation &&
      html` <meta-for src="zavx0z/git-config-${value.operation}" context=${{ args: value.args }} /> `}
    `,
  })
