import "@metafor/meta"

export default MetaFor("git-plumbing")
  .context((t) => ({
    operation: t.enum(
      "cat-file", "check-attr", "check-ignore", "check-mailmap", "commit-graph",
      "commit-tree", "count-objects", "diff-files", "diff-index", "diff-tree",
      "fast-export", "fast-import", "filter-branch", "fsck", "gitfile",
      "hash-object", "mktree", "multi-pack-index", "prune", "reflog",
      "rev-list", "rev-parse", "show-ref", "symbolic-ref", "unpack-objects",
      "update-index", "update-ref", "verify-commit", "verify-pack", "verify-tag"
    ).optional({ label: "Тип операции" }),
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
      "cat-file": /^cat-file$/,
      "check-attr": /^check-attr$/,
      "check-ignore": /^check-ignore$/,
      "check-mailmap": /^check-mailmap$/,
      "commit-graph": /^commit-graph$/,
      "commit-tree": /^commit-tree$/,
      "count-objects": /^count-objects$/,
      "diff-files": /^diff-files$/,
      "diff-index": /^diff-index$/,
      "diff-tree": /^diff-tree$/,
      "fast-export": /^fast-export$/,
      "fast-import": /^fast-import$/,
      "filter-branch": /^filter-branch$/,
      "fsck": /^fsck$/,
      gitfile: /^gitfile$/,
      "hash-object": /^hash-object$/,
      mktree: /^mktree$/,
      "multi-pack-index": /^multi-pack-index$/,
      prune: /^prune$/,
      reflog: /^reflog$/,
      "rev-list": /^rev-list$/,
      "rev-parse": /^rev-parse$/,
      "show-ref": /^show-ref$/,
      "symbolic-ref": /^symbolic-ref$/,
      "unpack-objects": /^unpack-objects$/,
      "update-index": /^update-index$/,
      "update-ref": /^update-ref$/,
      "verify-commit": /^verify-commit$/,
      "verify-pack": /^verify-pack$/,
      "verify-tag": /^verify-tag$/,
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
      ${context.operation && html`<meta-for src="zavx0z/git-plumbing-${context.operation}" context=${{ command: context.command, args: context.args }} />`}
      ${context.error && html`<meta-for src="zavx0z/git-error" context=${{ message: context.error }} />`}
    `,
  })
