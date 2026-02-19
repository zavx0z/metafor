import "@metafor/meta"

export default MetaFor("git")
  .context((t) => ({
    cmd: t.string.optional({ label: "Текущая команда git" }),
  }))
  .states({
    ожидание: {
      "инициализация репозитория": { cmd: { startsWith: "clone" } },
      "работа с файлами": { cmd: { startsWith: "add" } },
      "просмотр изменений": { cmd: { startsWith: "show" } },
      "управление историей": { cmd: { startsWith: "switch" } },
      "удалённая работа": { cmd: { startsWith: "fetch" } },
      "рабочие деревья": { cmd: { startsWith: "worktree" } },
      "отложенные изменения": { cmd: { startsWith: "stash" } },
      "управление субмодулями": { cmd: { startsWith: "submodule" } },
      "конфигурация git": { cmd: { startsWith: "config" } },
      "низкоуровневые команды": { cmd: { startsWith: "cat-file" } },
    },
    "инициализация репозитория": { ожидание: { cmd: null } },
    "работа с файлами": { ожидание: { cmd: null } },
    "просмотр изменений": { ожидание: { cmd: null } },
    "управление историей": { ожидание: { cmd: null } },
    "удалённая работа": { ожидание: { cmd: null } },
    "рабочие деревья": { ожидание: { cmd: null } },
    "отложенные изменения": { ожидание: { cmd: null } },
    "управление субмодулями": { ожидание: { cmd: null } },
    "конфигурация git": { ожидание: { cmd: null } },
    "низкоуровневые команды": { ожидание: { cmd: null } },
  })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ state, html }) => html`
      ${state === "инициализация репозитория" && html`<meta-for src="zavx0z/start"></meta-for>`}
      ${state === "работа с файлами" && html`<meta-for src="zavx0z/work"></meta-for>`}
      ${state === "просмотр изменений" && html`<meta-for src="zavx0z/examine"></meta-for>`}
      ${state === "управление историей" && html`<meta-for src="zavx0z/history"></meta-for>`}
      ${state === "удалённая работа" && html`<meta-for src="zavx0z/collaborate"></meta-for>`}
      ${state === "рабочие деревья" && html`<meta-for src="zavx0z/worktree"></meta-for>`}
      ${state === "отложенные изменения" && html`<meta-for src="zavx0z/stash"></meta-for>`}
      ${state === "управление субмодулями" && html`<meta-for src="zavx0z/submodule"></meta-for>`}
      ${state === "конфигурация git" && html`<meta-for src="zavx0z/config"></meta-for>`}
      ${state === "низкоуровневые команды" && html`<meta-for src="zavx0z/plumbing"></meta-for>`}
    `,
  })
