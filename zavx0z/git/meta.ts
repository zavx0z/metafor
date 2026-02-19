import "@metafor/meta"

export default MetaFor("git")
  .context((t) => ({
    cmd: t.string.optional({ label: "Текущая команда git" }),
  }))
  .states({
    ожидание: {
      начало: { cmd: { startsWith: "clone" } },
      работа: { cmd: { startsWith: "add" } },
      просмотр: { cmd: { startsWith: "show" } },
      история: { cmd: { startsWith: "switch" } },
      совместная: { cmd: { startsWith: "fetch" } },
      "рабочие деревья": { cmd: { startsWith: "worktree" } },
      запас: { cmd: { startsWith: "stash" } },
      субмодуль: { cmd: { startsWith: "submodule" } },
      конфигурация: { cmd: { startsWith: "config" } },
      водопровод: { cmd: { startsWith: "cat-file" } },
    },
    начало: { ожидание: { cmd: null } },
    работа: { ожидание: { cmd: null } },
    просмотр: { ожидание: { cmd: null } },
    история: { ожидание: { cmd: null } },
    совместная: { ожидание: { cmd: null } },
    "рабочие деревья": { ожидание: { cmd: null } },
    запас: { ожидание: { cmd: null } },
    субмодуль: { ожидание: { cmd: null } },
    конфигурация: { ожидание: { cmd: null } },
    водопровод: { ожидание: { cmd: null } },
  })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ state, html }) => html`
      ${state === "начало" && html`<meta-for src="zavx0z/start"></meta-for>`}
      ${state === "работа" && html`<meta-for src="zavx0z/work"></meta-for>`}
      ${state === "просмотр" && html`<meta-for src="zavx0z/examine"></meta-for>`}
      ${state === "история" && html`<meta-for src="zavx0z/history"></meta-for>`}
      ${state === "совместная" && html`<meta-for src="zavx0z/collaborate"></meta-for>`}
      ${state === "рабочие деревья" && html`<meta-for src="zavx0z/worktree"></meta-for>`}
      ${state === "запас" && html`<meta-for src="zavx0z/stash"></meta-for>`}
      ${state === "субмодуль" && html`<meta-for src="zavx0z/submodule"></meta-for>`}
      ${state === "конфигурация" && html`<meta-for src="zavx0z/config"></meta-for>`}
      ${state === "водопровод" && html`<meta-for src="zavx0z/plumbing"></meta-for>`}
    `,
  })
