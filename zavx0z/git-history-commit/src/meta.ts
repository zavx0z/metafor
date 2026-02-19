import "@metafor/meta"

export default MetaFor("git-history-commit", { desc: "Git commit — создание коммита" })
  .context((t) => ({
    args: t.string.optional({ label: "Аргументы" }),
    all: t.boolean.optional({ label: "Все файлы (-a)" }),
    message: t.string.optional({ label: "Сообщение (-m)" }),
    amend: t.boolean.optional({ label: "Исправить (--amend)" }),
    signoff: t.boolean.optional({ label: "Подпись (-s)" }),
    noVerify: t.boolean.optional({ label: "Без проверки (-n)" }),
    dryRun: t.boolean.optional({ label: "Пробный запуск (--dry-run)" }),
    verbose: t.boolean.optional({ label: "Подробно (-v)" }),
    edit: t.boolean.optional({ label: "Редактировать (-e)" }),
    error: t.string.optional({ label: "Ошибка" }),
    dryRunOutput: t.string.optional({ label: "Результат пробного запуска" }),
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
      ошибка: { error: { null: false } },
    },
    "коммит с сообщением": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "коммит всех файлов": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "амед прошлого коммита": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "коммит с подписью": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "коммит без верификации": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "пробный коммит": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "коммит с редактором": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "коммит всех файлов с сообщением": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "амед с сообщением": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "коммит с подписью и сообщением": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "амед с подписью": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    "амед с подписью и сообщением": {
      ошибка: { error: { null: false } },
      выполнено: {},
    },
    ошибка: {
      "парсинг опций": { error: null },
    },
    выполнено: {},
  })
  .core(() => ({}))
  .processes((process, destroy) => ({
    "парсинг опций": process({
      label: "Парсинг опций",
      desc: "Извлекает флаги и сообщение из аргументов командной строки",
    })
      .action(({ context }) => {
        const args = context.args || ""

        // Проверка: args не должен быть пустым
        if (!args.trim()) {
          throw new Error("Команда не указана")
        }

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
        if (msgMatch && msgMatch[1]) {
          result.message = msgMatch[1]
        }

        return result
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с сообщением": process({
      label: 'git commit -m "msg"',
      desc: "Создаёт коммит с указанным сообщением",
    })
      .action(async ({ context }) => {
        const cmd = `git commit -m ${JSON.stringify(context.message)}`
        const result = await Bun.$`${cmd}`.quiet().text()
        if (!result.includes("created") && !result.includes("mode")) {
          throw new Error(result || "Не удалось создать коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит всех файлов": process({
      label: "git commit -a",
      desc: "Создаёт коммит всех изменённых отслеживаемых файлов",
    })
      .action(async () => {
        const result = await Bun.$`git commit -a`.quiet().text()
        if (!result.includes("created") && !result.includes("mode")) {
          throw new Error(result || "Не удалось создать коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед прошлого коммита": process({
      label: "git commit --amend",
      desc: "Заменяет последний коммит без изменения сообщения",
    })
      .action(async () => {
        const result = await Bun.$`git commit --amend --no-edit`.quiet().text()
        if (!result.includes("amend") && !result.includes("mode")) {
          throw new Error(result || "Не удалось заменить коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с подписью": process({
      label: "git commit -s",
      desc: "Создаёт коммит с добавлением Signed-off-by трейлера",
    })
      .action(async ({ context }) => {
        const cmd = context.message
          ? `git commit -s -m ${JSON.stringify(context.message)}`
          : `git commit -s`
        const result = await Bun.$`${cmd}`.quiet().text()
        if (!result.includes("created") && !result.includes("mode")) {
          throw new Error(result || "Не удалось создать коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит без верификации": process({
      label: "git commit -n",
      desc: "Пропускает pre-commit и commit-msg хуки",
    })
      .action(async ({ context }) => {
        const cmd = context.message
          ? `git commit -n -m ${JSON.stringify(context.message)}`
          : `git commit -n`
        const result = await Bun.$`${cmd}`.quiet().text()
        if (!result.includes("created") && !result.includes("mode")) {
          throw new Error(result || "Не удалось создать коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "пробный коммит": process({
      label: "git commit --dry-run",
      desc: "Показывает что будет закоммичено без фактического создания коммита",
    })
      .action(async ({ context }) => {
        const cmd = context.message
          ? `git commit --dry-run -m ${JSON.stringify(context.message)}`
          : `git commit --dry-run`
        await Bun.$`${cmd}`.quiet().text()
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с редактором": process({
      label: "git commit -e",
      desc: "Открывает редактор для написания сообщения коммита",
    })
      .action(async () => {
        const result = await Bun.$`git commit -e`.quiet().text()
        if (!result.includes("created") && !result.includes("mode")) {
          throw new Error(result || "Не удалось создать коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит всех файлов с сообщением": process({
      label: 'git commit -a -m "msg"',
      desc: "Создаёт коммит всех изменённых файлов с сообщением",
    })
      .action(async ({ context }) => {
        const cmd = `git commit -a -m ${JSON.stringify(context.message)}`
        const result = await Bun.$`${cmd}`.quiet().text()
        if (!result.includes("created") && !result.includes("mode")) {
          throw new Error(result || "Не удалось создать коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед с сообщением": process({
      label: 'git commit --amend -m "msg"',
      desc: "Заменяет последний коммит с новым сообщением",
    })
      .action(async ({ context }) => {
        const cmd = `git commit --amend -m ${JSON.stringify(context.message)}`
        const result = await Bun.$`${cmd}`.quiet().text()
        if (!result.includes("amend") && !result.includes("mode")) {
          throw new Error(result || "Не удалось заменить коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с подписью и сообщением": process({
      label: 'git commit -s -m "msg"',
      desc: "Создаёт коммит с подписью и сообщением",
    })
      .action(async ({ context }) => {
        const cmd = `git commit -s -m ${JSON.stringify(context.message)}`
        const result = await Bun.$`${cmd}`.quiet().text()
        if (!result.includes("created") && !result.includes("mode")) {
          throw new Error(result || "Не удалось создать коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед с подписью": process({
      label: "git commit --amend -s",
      desc: "Заменяет последний коммит с добавлением подписи",
    })
      .action(async () => {
        const result = await Bun.$`git commit --amend -s --no-edit`.quiet().text()
        if (!result.includes("amend") && !result.includes("mode")) {
          throw new Error(result || "Не удалось заменить коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед с подписью и сообщением": process({
      label: 'git commit --amend -s -m "msg"',
      desc: "Заменяет последний коммит с подписью и новым сообщением",
    })
      .action(async ({ context }) => {
        const cmd = `git commit --amend -s -m ${JSON.stringify(context.message)}`
        const result = await Bun.$`${cmd}`.quiet().text()
        if (!result.includes("amend") && !result.includes("mode")) {
          throw new Error(result || "Не удалось заменить коммит")
        }
      })
      .error(({ update, error }) => update({ error: error.message })),

    "выполнено": destroy(),
  }))
  .reactions(() => [])
  .view({ render: ({ context }) => null })
