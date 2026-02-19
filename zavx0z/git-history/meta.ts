import "@metafor/meta"

export default MetaFor("git-history")
  .context((t) => ({
    operation: t.enum("switch", "checkout", "commit", "reset", "revert", "bisect", "repair").optional({ label: "Тип операции" }),
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
      switch: /^switch$/,
      checkout: /^checkout$/,
      commit: /^commit$/,
      reset: /^reset$/,
      revert: /^revert$/,
      bisect: /^bisect$/,
      repair: /^repair$/,
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
      ${context.operation === "switch" && html`<meta-for src="zavx0z/git-history-switch" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "checkout" && html`<meta-for src="zavx0z/git-history-checkout" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "commit" && html`<meta-for src="zavx0z/git-history-commit" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "reset" && html`<meta-for src="zavx0z/git-history-reset" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "revert" && html`<meta-for src="zavx0z/git-history-revert" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "bisect" && html`<meta-for src="zavx0z/git-history-bisect" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "repair" && html`<meta-for src="zavx0z/git-history-repair" context=${{ command: context.command, args: context.args }} />`}
      ${context.error && html`<meta-for src="zavx0z/git-error" context=${{ message: context.error }} />`}
    `,
  })
