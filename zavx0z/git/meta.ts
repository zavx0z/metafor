import "@metafor/meta"

export default MetaFor("git")
  .context((t) => ({
    group: t.enum(
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
    ).optional({ label: "Группа команд git" }),
  }))
  .states({
    idle: { active: {} },
    active: { idle: { group: null } },
  })
  .core({
    command: "" as string,
    args: [] as string[],
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
    idle: process()
      .action(({ core, context }) => {
        const cmd = core.command
        const patterns = core.patterns
        let group: string | null = null
        for (const [key, regex] of Object.entries(patterns)) {
          if (regex.test(cmd)) {
            group = key
            break
          }
        }
        if (!group) {
          group = "plumbing"
        }
        return { group: group as NonNullable<typeof context.group> }
      })
      .success(({ update, data }) => {
        update({ group: data.group })
      })
      .error(({ update, error }) => {
        update({ group: null })
        console.error(error)
      }),
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
    `,
  })
