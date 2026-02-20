# create-metafor

🎨 Универсальный генератор пакетов для MetaFor framework

## Quick Start

```bash
# Using npm
npm create metafor my-package

# Using Bun
bun create metafor my-package
```

## Usage

### Создать пакет

```bash
bun create metafor my-feature
```

Создаётся пакет с базовым шаблоном для обработки ошибок.

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Имя пакета | positional argument |
| `-d, --desc <desc>` | Описание пакета | "MetaFor {name}" |
| `--dir <dir>` | Директория для создания | `.` |

## Examples

```bash
# Создать с описанием
bun create metafor my-feature -d "Моя фича"

# Создать в другой директории
bun create metafor my-component --dir packages

# Создать с полным именем
bun create metafor auth-login -d "Авторизация"
```

## Generated Structure

```
my-package/
├── src/
│   └── meta.ts          # MetaFor компонент
├── package.json         # Конфигурация пакета
├── .gitignore          # Git ignore
└── index.html          # HTML шаблон
```

## Requirements

- Node.js >= 18 или Bun >= 1.0.0

## License

MIT
