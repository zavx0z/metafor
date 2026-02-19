import "@metafor/meta"

export default MetaFor("git-examine")
  .context((t) => ({
    operation: t.enum("show", "status", "describe", "log", "diff", "range-diff", "shortlog").optional({ label: "Тип операции" }),
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
      show: /^show$/,
      status: /^status$/,
      describe: /^describe$/,
      log: /^log$/,
      diff: /^diff$/,
      "range-diff": /^range-diff$/,
      shortlog: /^shortlog$/,
    } as Record<string, RegExp>,
  })
  .processes((process) => ({
    "определение операции": process()
      .action(({ core, context }) => {
        const command = context.command
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
      ${context.operation === "show" && html`<meta-for src="zavx0z/git-examine-show" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "status" && html`<meta-for src="zavx0z/git-examine-status" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "describe" && html`<meta-for src="zavx0z/git-examine-describe" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "log" && html`<meta-for src="zavx0z/git-examine-log" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "diff" && html`<meta-for src="zavx0z/git-examine-diff" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "range-diff" && html`<meta-for src="zavx0z/git-examine-range-diff" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "shortlog" && html`<meta-for src="zavx0z/git-examine-shortlog" context=${{ command: context.command, args: context.args }} />`}
      ${context.error && html`<meta-for src="zavx0z/git-error" context=${{ message: context.error }} />`}
    `,
  })
