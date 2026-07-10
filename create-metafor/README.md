# **⚛️ Мета для...**

## Быстрый старт

```bash
# Using npm
npm create metafor my-meta

# Using Bun
bun create metafor my-meta
```

## Использование

### Создать Мета

```bash
bun create metafor auth
```

Создаётся универсальный каркас Мета без привязки к конкретному типу интерфейса или процесса.

Сгенерированная Мета является source declaration, а не runtime snapshot. Dark
индексирует её parent-child связи и передаёт каждую добавленную, удалённую или
изменённую declaration entity отдельным `ForceMessage` с одной `Particle`.
Повторное чтение не пересылает неизменённые сущности и не выполняет reset.

## Опции

| Option              | Description                 | Default             |
| ------------------- | --------------------------- | ------------------- |
| `-n, --name <name>` | Имя Мета                    | positional argument |
| `-d, --desc <desc>` | Описание Мета               | `"MetaFor {name}"`  |
| `--dir <dir>`       | Директория для создания     | `.`                 |
| `-l, --lang <lang>` | Язык вывода (`ru` или `en`) | автодетект          |

## Примеры

```bash
# Создать с описанием
bun create metafor auth -d "Авторизация"

# Создать в другой директории
bun create metafor player --dir components

# Создать с полным именем
bun create metafor git-commit -d "Коммит"

# Принудительно английский язык
bun create metafor auth -l en
```

## Структура

```text
my-meta/
├── src/
│   ├── meta.ts          # Мета
│   └── metafor.d.ts     # Локальные DSL-типы
├── package.json         # Конфигурация
├── tsconfig.json        # TypeScript
├── TODO.md              # Заметки по доработке меты
├── .gitignore           # Git ignore
└── index.html           # HTML шаблон
```

## Требования

- Node.js >= 18 или Bun >= 1.0.0

## Лицензия

MIT

---
