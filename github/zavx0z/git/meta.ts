import { MetaFor } from "@metafor/dsl"

export default MetaFor("git", { desc: "Git — распределённая система управления версиями" })
  .fields((field) => ({
    operation: field
      .enum(
        "start",
        "work",
        "examine",
        "history",
        "collaborate",
        "worktree",
        "stash",
        "submodule",
        "config",
        "plumbing",
      )
      .optional({ label: "Тип операции" }),
    error: field.string.optional({ label: "Ошибка" }),
    command: field.string.optional({ label: "Команда" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({
    "получение команды": {
      "определение операции": { command: { null: false } },
    },
    "определение операции": {
      выполнение: { operation: { null: false } },
      ошибка: { error: { null: false } },
    },
    выполнение: {
      "получение команды": { operation: null },
    },
    ошибка: {
      "получение команды": { error: null },
    },
  })
  .mass({})
  .processes((process) => ({
    "определение операции": process({ env: ["any"] })
      .action(async ({ value }) => {
        if (!value.command) throw new Error("Не удалось определить команду")

        const { detect } = await import("./actions/detect")
        return detect<typeof value.operation>(value.command)
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
  }))
  .reactions(() => [])
  .matter(
    ({ value, state, html }) => html`
      <meta-for
        src="zavx0z/git-${value.operation}"
        fields=${{
          operation: value.operation,
          args: value.args,
        }} />
      ${state === "ошибка" &&
      html`
        <meta-for
          src="zavx0z/git-error"
          fields=${{
            message: value.error,
          }} />
      `}
    `,
  )
  .bulk()
