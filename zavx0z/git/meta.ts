import "@metafor/meta"

export default MetaFor("git")
  .context((t) => ({
    operation: t
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
    error: t.string.optional({ label: "Ошибка" }),
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({
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
  .core({
    patterns: {
      start: /^(clone|init)$/,
      work: /^(add|mv|restore|rm|clean|sparse-checkout)$/,
      examine: /^(show|status|diff|log|range-diff|shortlog|describe)$/,
      history: /^(switch|checkout|commit|reset|revert|bisect|repair)$/,
      collaborate: /^(fetch|pull|push|remote)$/,
      worktree: /^worktree$/,
      stash: /^stash$/,
      submodule: /^submodule$/,
      config: /^(config|help)$/,
    } as Record<string, RegExp>,
  })
  .processes((process) => ({
    "определение операции": process()
      .action(({ core, context }) => {
        if (!context.command) {
          throw new Error("Команда не указана")
        }
        const parts = context.command.split(" ")
        const command = parts[0]
        if (!command) {
          throw new Error("Не удалось извлечь команду")
        }
        const args = parts.length > 1 ? parts.slice(1).join(" ") : null
        const patterns = core.patterns
        let operation: string | null = null
        for (const [key, regex] of Object.entries(patterns)) {
          if (regex.test(command)) {
            operation = key
            break
          }
        }
        if (!operation) {
          throw new Error(`Неизвестная команда: ${context.command}`)
        }
        return { operation: operation as NonNullable<typeof context.operation>, command, args }
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    выполнение: process()
      .action(() => null)
      .success(({ update }) => update({ operation: null })),
  }))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation &&
      html`
        <meta-for
          src="zavx0z/${context.operation}"
          context=${{
            command: context.command,
            args: context.args,
          }} />
      `}
      ${context.error &&
      html`
        <meta-for
          src="zavx0z/error"
          context=${{
            message: context.error,
          }} />
      `}
    `,
  })
