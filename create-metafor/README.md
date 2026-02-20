# **⚛️ Meta for...**

## Quick Start

```bash
# Using npm
npm create metafor my-meta

# Using Bun
bun create metafor my-meta
```

## Usage

### Create Meta

```bash
bun create metafor auth
```

Creates a Meta with basic error handling template.

## Options

| Option | Description | Default |
| ------ | ----------- | ------- |
| `-n, --name <name>` | Meta name | positional argument |
| `-d, --desc <desc>` | Meta description | `"MetaFor {name}"` |
| `--dir <dir>` | Output directory | `.` |
| `-l, --lang <lang>` | Output language (ru\|en) | auto-detect |
| `--self-update` | Force self-update + clear npx cache | - |

## Examples

```bash
# Create with description
bun create metafor auth -d "Authentication"

# Create in custom directory
bun create metafor player --dir components

# Create with full name
bun create metafor git-commit -d "Commit"

# Force English language
bun create metafor auth -l en
```


## Updates

```bash
# Recommended run to avoid stale npx cache
npx --yes create-metafor@latest my-meta

# Explicitly update installed binary
create-metafor --self-update
```

## Generated Structure

```text
my-meta/
├── src/
│   └── meta.ts          # Meta
├── package.json         # Configuration
├── .gitignore          # Git ignore
└── index.html          # HTML template
```

## Requirements

- Node.js >= 18 or Bun >= 1.0.0

## License

MIT

---

**Other languages:** [Русский](README.ru.md)
