# **⚛️ Мета для...**

## Quick Start

```bash
# Using npm
npm create metafor my-component

# Using Bun
bun create metafor my-component
```

## Usage

### Создать Meta-компонент

```bash
bun create metafor auth
```

Создаётся Meta-компонент с базовым шаблоном для обработки ошибок.

## Options

| Option | Description | Default |
| ------ | ----------- | ------- |
| `-n, --name <name>` | Имя компонента | positional argument |
| `-d, --desc <desc>` | Описание компонента | `"MetaFor {name}"` |
| `--dir <dir>` | Директория для создания | `.` |
| `-l, --lang <lang>` | Язык вывода (ru\|en) | автодетект |

## Examples

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

## Generated Structure

```text
my-component/
├── src/
│   └── meta.ts          # Meta-компонент
├── package.json         # Конфигурация
├── .gitignore          # Git ignore
└── index.html          # HTML шаблон
```

## Requirements

- Node.js >= 18 или Bun >= 1.0.0

## License

MIT
