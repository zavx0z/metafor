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

Создаётся Мета с базовым шаблоном для обработки ошибок.

## Опции

| Option | Description | Default |
| ------ | ----------- | ------- |
| `-n, --name <name>` | Имя Мета | positional argument |
| `-d, --desc <desc>` | Описание Мета | `"MetaFor {name}"` |
| `--dir <dir>` | Директория для создания | `.` |
| `-l, --lang <lang>` | Язык вывода (ru\|en) | автодетект |

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
│   └── meta.ts          # Мета
├── package.json         # Конфигурация
├── .gitignore          # Git ignore
└── index.html          # HTML шаблон
```

## Требования

- NodeType.js >= 18 или Bun >= 1.0.0

## Лицензия

MIT

---

**Other languages:** [English](README.md)
