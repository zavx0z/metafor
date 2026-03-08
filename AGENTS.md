# Repository Guidelines

## Приоритет правил агента (обязательно)

Для работы агента в этом репозитории:

- Основной навигатор правил: `/Users/zavx0z/.codex/memories/metafor-native/AGENT_GUIDE.md`.
- Перед действием нужно определить триггер задачи и открыть соответствующее правило.
- Нельзя действовать “по памяти”, если правило можно проверить.
- При конфликте правил применять более строгое ограничение.

Карта триггеров:

- Markdown -> `/Users/zavx0z/.codex/memories/metafor-native/rules/markdown.md`
- Новый модуль -> `/Users/zavx0z/.codex/memories/metafor-native/rules/module.md`
- Пакеты `@boundary/*`, `@metafor/*` -> `/Users/zavx0z/.codex/memories/metafor-native/rules/packages.md`
- TSDoc -> `/Users/zavx0z/.codex/memories/metafor-native/rules/tsdoc.md`
- Функциональный стиль и чистые функции -> `/Users/zavx0z/.codex/memories/metafor-native/rules/fp.md`
- Графы/связи -> `/Users/zavx0z/.codex/memories/metafor-native/rules/graph.md`
- Создание/изменение правил -> `/Users/zavx0z/.codex/memories/metafor-native/rules/rules.md`, `/Users/zavx0z/.codex/memories/metafor-native/rules/rules.edit.md`
- История сессии и “вспомни” запросы -> `/Users/zavx0z/.codex/memories/metafor-native/rules/session.md`

Для таблиц Markdown использовать skill `table-format` из `/Users/zavx0z/.codex/skills/metafor/table-format/`.

## Структура проекта и организация модулей

Этот репозиторий — монорепо на Bun Workspaces с тремя основными доменами:

- `boundary/`: низкоуровневый движок состояния/матрицы (`boundary/tests`, `boundary/fields`, `boundary/matrix`, `boundary/atlas`).
- `force/`: оркестрация акторов и процессов (`force/tests`, а также `force/weak`, `force/strong`, `force/gravity`, `force/em`).
- `metafor/`: DSL, AST-инструменты, шаблоны и генерация проектов (`metafor/dsl`, `metafor/ast`, `metafor/template`, `metafor/create-metafor`).

Дополнительные каталоги: `app/web` (локальный демо-сервер), `fixture` (browser/WebGPU-фикстуры), `github/zavx0z/*` (примерные пакеты), `shared/` (скрипты и ассеты), `tasks/` (планы и заметки по архитектуре).

## Команды сборки, тестов и разработки

Запускайте команды из корня репозитория:

- `bun install`: установка зависимостей workspace.
- `bun run dev`: запуск локального веб-приложения (`@app/web`, порт 3000).
- `bun run build`: сборка артефактов `@metafor/dsl`.
- `bun run typegen`: генерация bundled-типов для DSL.
- `bun test`: запуск всех тестов Bun по workspace.
- `bun test boundary/tests` / `bun test force/tests`: запуск тестов по доменам.
- `bun run lint:md`: линтинг Markdown-документации.

## Стиль кода и соглашения по именованию

- Язык: TypeScript ESM (`"type": "module"`).
- Отступы: 2 пробела; сохраняйте текущий стиль форматирования и импорты.
- Именование: `kebab-case` для файлов, `camelCase` для переменных/функций, `PascalCase` для типов/интерфейсов/enum.
- Тесты используют суффиксы `*.test.ts` и `*.spec.ts`; типовые файлы часто имеют суффикс `*.t.ts`.
- Следуйте строгой типизации из корневого `tsconfig.json` (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).

## Правила тестирования

- Фреймворк: `bun:test`.
- Добавляйте/обновляйте тесты в ближайшем доменном каталоге (`boundary/tests`, `force/tests`, `metafor/dsl/*.spec.ts`).
- Названия тестов должны описывать поведение (пример: `transitions/string.test.ts`).
- Перед PR сначала прогоняйте целевые тесты, затем полный `bun test`.

## Коммиты и pull request

- Используйте стиль коммитов из истории: теги в квадратных скобках + область + краткое описание, например: `[refactor/type] force - simplify store API`.
- Один коммит — одно логическое изменение; при изменении поведения обновляйте тесты.
- В PR включайте:
  - краткое описание проблемы и решения,
  - список затронутых пакетов/модулей,
  - подтверждение тестами (какие команды запускались),
  - скриншоты или логи для изменений `app/web`.
