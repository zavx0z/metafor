import "@metafor/meta"

export default MetaFor("git-collaborate")
  .context((t) => ({
    operation: t.enum("fetch", "pull", "push", "remote").optional({ label: "Тип операции" }),
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
      fetch: /^fetch$/,
      pull: /^pull$/,
      push: /^push$/,
      remote: /^remote$/,
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
      ${context.operation === "fetch" && html`<meta-for src="zavx0z/git-collaborate-fetch" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "pull" && html`<meta-for src="zavx0z/git-collaborate-pull" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "push" && html`<meta-for src="zavx0z/git-collaborate-push" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "remote" && html`<meta-for src="zavx0z/git-collaborate-remote" context=${{ command: context.command, args: context.args }} />`}
      ${context.error && html`<meta-for src="zavx0z/git-error" context=${{ message: context.error }} />`}
    `,
  })
