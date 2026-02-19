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
      .optional({ label: "Группа команд git" }),
  }))
  .states({
    idle: { selected: {} },
    selected: { idle: {} },
  })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ state, context, html }) => html`
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
    `,
  })
