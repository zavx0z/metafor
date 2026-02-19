import "@metafor/meta"

export default MetaFor("git-worktree")
  .context((t) => ({
    operation: t.enum("worktree").optional({ label: "Тип операции" }),
    error: t.string.optional({ label: "Ошибка" }),
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({
    "получение команды": {
      "определение операции": { command: { null: false } },
    },
    "определение операции": {
      "выполнение": { operation: { null: false } },
      "ошибка": { error: { null: false } },
    },
    "выполнение": {
      "получение команды": { operation: null },
    },
    "ошибка": {
      "получение команды": { error: null },
    },
  })
  .core({
    patterns: {
      worktree: /^worktree$/,
    } as Record<string, RegExp>,
  })
  .processes((process) => ({
    "определение операции": process()
      .action(({ core, context }) => {
        const command = context.command?.split(" ")[0]
        if (!command) throw new Error("Команда не указана")
        let operation: string | null = null
        for (const [key, regex] of Object.entries(core.patterns)) {
          if (regex.test(command)) {
            operation = key
            break
          }
        }
        if (!operation) throw new Error(`Неизвестная команда: ${command}`)
        return { operation: operation as NonNullable<typeof context.operation>, command, args: context.args }
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    "выполнение": process()
      .action(() => null)
      .success(({ update }) => update({ operation: null })),
  }))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.operation === "worktree" && html`<meta-for src="zavx0z/git-worktree-worktree" context=${{ command: context.command, args: context.args }} />`}
      ${context.error && html`<meta-for src="zavx0z/git-error" context=${{ message: context.error }} />`}
    `,
  })
