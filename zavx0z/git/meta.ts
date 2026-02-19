import "@metafor/meta"

export default MetaFor("git")
  .context((t) => ({
    group: t
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
      "выполнение": { group: { null: false } },
      "ошибка": { error: { null: false } },
    },
    "выполнение": {
      "получение команды": { group: null },
    },
    "ошибка": {
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
        let group: string | null = null
        for (const [key, regex] of Object.entries(patterns)) {
          if (regex.test(command)) {
            group = key
            break
          }
        }
        if (!group) {
          throw new Error(`Неизвестная команда: ${context.command}`)
        }
        return { group: group as NonNullable<typeof context.group>, command, args }
      })
      .success(({ update, data }) => update({ group: data.group, command: data.command, args: data.args }))
      .error(({ update, error }) => update({ error: error.message })),
    "выполнение": process()
      .action(() => null)
      .success(({ update }) => update({ group: null })),
  }))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.group === "start" && html`<meta-for src="zavx0z/start"></meta-for>`}
      ${context.group === "work" && html`<meta-for src="zavx0z/work"></meta-for>`}
      ${context.group === "examine" && html`<meta-for src="zavx0z/examine"></meta-for>`}
      ${context.group === "history" && html`<meta-for src="zavx0z/history"></meta-for>`}
      ${context.group === "collaborate" && html`<meta-for src="zavx0z/collaborate"></meta-for>`}
      ${context.group === "worktree" && html`<meta-for src="zavx0z/worktree"></meta-for>`}
      ${context.group === "stash" && html`<meta-for src="zavx0z/stash"></meta-for>`}
      ${context.group === "submodule" && html`<meta-for src="zavx0z/submodule"></meta-for>`}
      ${context.group === "config" && html`<meta-for src="zavx0z/config"></meta-for>`}
      ${context.group === "plumbing" && html`<meta-for src="zavx0z/plumbing"></meta-for>`}
      ${context.error && html`<div class="error">${context.error}</div>`}
    `,
  })
