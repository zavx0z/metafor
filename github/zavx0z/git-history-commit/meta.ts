import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-history-commit", { desc: "Git commit — создание коммита" })
  .fields((field) => ({
    args: field.string.optional({ label: "Аргументы" }),
    all: field.boolean.optional({ label: "Все файлы (-a)" }),
    message: field.string.optional({ label: "Сообщение (-m)" }),
    amend: field.boolean.optional({ label: "Исправить (--amend)" }),
    signoff: field.boolean.optional({ label: "Подпись (-s)" }),
    noVerify: field.boolean.optional({ label: "Без проверки (-n)" }),
    dryRun: field.boolean.optional({ label: "Пробный запуск (--dry-run)" }),
    verbose: field.boolean.optional({ label: "Подробно (-v)" }),
    edit: field.boolean.optional({ label: "Редактировать (-e)" }),
    error: field.string.optional({ label: "Ошибка" }),
    dryRunOutput: field.string.optional({ label: "Результат пробного запуска" }),
  }))
  .superposition({
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
  .mass({})
  .processes((process, destroy) => ({
    "парсинг опций": process({
      label: "Парсинг опций",
      desc: "Извлекает флаги и сообщение из аргументов командной строки",
    })
      .action(async ({ value }) => {
        if (!value.args) throw new Error("Не указаны аргументы")
        const mod = await import("./actions/commit")
        return mod.parseCommitOptions(value.args)
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с сообщением": process({
      label: 'git commit -m "msg"',
      desc: "Создаёт коммит с указанным сообщением",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: `git commit -m ${JSON.stringify(value.message)}`, mode: "commit" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит всех файлов": process({
      label: "git commit -a",
      desc: "Создаёт коммит всех изменённых отслеживаемых файлов",
    })
      .action(async () => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: "git commit -a", mode: "commit" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед прошлого коммита": process({
      label: "git commit --amend",
      desc: "Заменяет последний коммит без изменения сообщения",
    })
      .action(async () => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: "git commit --amend --no-edit", mode: "amend" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с подписью": process({
      label: "git commit -s",
      desc: "Создаёт коммит с добавлением Signed-off-by трейлера",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({
          command: value.message ? `git commit -s -m ${JSON.stringify(value.message)}` : "git commit -s",
          mode: "commit",
        })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит без верификации": process({
      label: "git commit -n",
      desc: "Пропускает pre-commit и commit-msg хуки",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({
          command: value.message ? `git commit -n -m ${JSON.stringify(value.message)}` : "git commit -n",
          mode: "commit",
        })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "пробный коммит": process({
      label: "git commit --dry-run",
      desc: "Показывает что будет закоммичено без фактического создания коммита",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({
          command: value.message ? `git commit --dry-run -m ${JSON.stringify(value.message)}` : "git commit --dry-run",
          mode: "dry-run",
        })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с редактором": process({
      label: "git commit -e",
      desc: "Открывает редактор для написания сообщения коммита",
    })
      .action(async () => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: "git commit -e", mode: "commit" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит всех файлов с сообщением": process({
      label: 'git commit -a -m "msg"',
      desc: "Создаёт коммит всех изменённых файлов с сообщением",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: `git commit -a -m ${JSON.stringify(value.message)}`, mode: "commit" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед с сообщением": process({
      label: 'git commit --amend -m "msg"',
      desc: "Заменяет последний коммит с новым сообщением",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: `git commit --amend -m ${JSON.stringify(value.message)}`, mode: "amend" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "коммит с подписью и сообщением": process({
      label: 'git commit -s -m "msg"',
      desc: "Создаёт коммит с подписью и сообщением",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: `git commit -s -m ${JSON.stringify(value.message)}`, mode: "commit" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед с подписью": process({
      label: "git commit --amend -s",
      desc: "Заменяет последний коммит с добавлением подписи",
    })
      .action(async () => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: "git commit --amend -s --no-edit", mode: "amend" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    "амед с подписью и сообщением": process({
      label: 'git commit --amend -s -m "msg"',
      desc: "Заменяет последний коммит с подписью и новым сообщением",
    })
      .action(async ({ value }) => {
        const mod = await import("./actions/commit")
        return mod.runCommitCommand({ command: `git commit --amend -s -m ${JSON.stringify(value.message)}`, mode: "amend" })
      })
      .error(({ update, error }) => update({ error: error.message })),

    выполнено: destroy(),
  }))
  .reactions(() => [])
  .gravity(({ value, html }) => html` ${value.error && html`<div class="error">${value.error}</div>`} `)
  .bulk()
