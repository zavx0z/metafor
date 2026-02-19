import "@metafor/meta"

export default MetaFor("git-work")
  .context((t) => ({
    operation: t.enum("add", "mv", "restore", "rm", "clean", "sparse-checkout").optional({ label: "Тип операции" }),
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
      add: /^add$/,
      mv: /^mv$/,
      restore: /^restore$/,
      rm: /^rm$/,
      clean: /^clean$/,
      "sparse-checkout": /^sparse-checkout$/,
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
      ${context.operation === "add" && html`<meta-for src="zavx0z/git-work-add" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "mv" && html`<meta-for src="zavx0z/git-work-mv" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "restore" && html`<meta-for src="zavx0z/git-work-restore" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "rm" && html`<meta-for src="zavx0z/git-work-rm" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "clean" && html`<meta-for src="zavx0z/git-work-clean" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "sparse-checkout" && html`<meta-for src="zavx0z/git-work-sparse-checkout" context=${{ command: context.command, args: context.args }} />`}
      ${context.error && html`<meta-for src="zavx0z/git-error" context=${{ message: context.error }} />`}
    `,
  })
