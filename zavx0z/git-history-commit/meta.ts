import "@metafor/meta"

export default MetaFor("git-history-commit")
  .context((t) => ({
    args: t.string.optional({ label: "Аргументы" }),
    all: t.boolean.optional({ label: "Commit all (-a)" }),
    message: t.string.optional({ label: "Commit message (-m)" }),
    amend: t.boolean.optional({ label: "Amend (--amend)" }),
    signoff: t.boolean.optional({ label: "Signoff (-s)" }),
    noVerify: t.boolean.optional({ label: "No verify (-n)" }),
    dryRun: t.boolean.optional({ label: "Dry run (--dry-run)" }),
    verbose: t.boolean.optional({ label: "Verbose (-v)" }),
    edit: t.boolean.optional({ label: "Edit (-e)" }),
    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({
    "парсинг опций": {
      // Популярные комбинации (сначала более специфичные)
      "амед с подписью и сообщением": { amend: { null: false }, signoff: { null: false }, message: { null: false } },
      "коммит всех файлов с сообщением": { all: { null: false }, message: { null: false } },
      "амед с сообщением": { amend: { null: false }, message: { null: false } },
      "коммит с подписью и сообщением": { signoff: { null: false }, message: { null: false } },
      "амед с подписью": { amend: { null: false }, signoff: { null: false } },
      // Одиночные опции
      "коммит с сообщением": { message: { null: false } },
      "коммит всех файлов": { all: { null: false } },
      "амед прошлого коммита": { amend: { null: false } },
      "коммит с подписью": { signoff: { null: false } },
      "коммит без верификации": { noVerify: { null: false } },
      "пробный коммит": { dryRun: { null: false } },
      "коммит с редактором": { edit: { null: false } },
      ошибка: { args: null },
    },
    // git commit -m "msg"
    "коммит с сообщением": {
      выполнено: {},
    },
    // git commit -a
    "коммит всех файлов": {
      выполнено: {},
    },
    // git commit --amend
    "амед прошлого коммита": {
      выполнено: {},
    },
    // git commit -s
    "коммит с подписью": {
      выполнено: {},
    },
    // git commit -n
    "коммит без верификации": {
      выполнено: {},
    },
    // git commit --dry-run
    "пробный коммит": {
      выполнено: {},
    },
    // git commit -e
    "коммит с редактором": {
      выполнено: {},
    },
    // git commit -a -m "msg"
    "коммит всех файлов с сообщением": {
      выполнено: {},
    },
    // git commit --amend -m "msg"
    "амед с сообщением": {
      выполнено: {},
    },
    // git commit -s -m "msg"
    "коммит с подписью и сообщением": {
      выполнено: {},
    },
    // git commit --amend -s
    "амед с подписью": {
      выполнено: {},
    },
    // git commit --amend -s -m "msg"
    "амед с подписью и сообщением": {
      выполнено: {},
    },
    // git commit (без аргументов)
    ошибка: {
      "парсинг опций": { error: null },
    },
    выполнено: {},
  })
  .core(() => ({}))
  .processes((process) => ({
    "парсинг опций": process()
      .action(({ context }) => {
        const args = context.args || ""
        const result: Record<string, any> = {}

        // Флаги
        if (args.includes("-a") || args.includes("--all")) result.all = true
        if (args.includes("--amend")) result.amend = true
        if (args.includes("-s") || args.includes("--signoff")) result.signoff = true
        if (args.includes("-n") || args.includes("--no-verify")) result.noVerify = true
        if (args.includes("--dry-run")) result.dryRun = true
        if (args.includes("-v") || args.includes("--verbose")) result.verbose = true
        if (args.includes("-e") || args.includes("--edit")) result.edit = true

        // Сообщение коммита
        const msgMatch = args.match(/-m\s+"([^"]+)"/) || args.match(/-m\s+'([^']+)'/) || args.match(/-m\s+(\S+)/)
        if (msgMatch && msgMatch[1]) result.message = msgMatch[1]

        return result
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
  }))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
