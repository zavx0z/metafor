# create-metafor

⚛️ Meta for...

## Quick Start

```bash
# Using npm
npm create metafor my-component

# Using Bun
bun create metafor my-component
```

## Usage

### Create Meta-Component

```bash
bun create metafor auth
```

Creates a Meta-Component with basic error handling template.

## Options

| Option | Description | Default |
| ------ | ----------- | ------- |
| `-n, --name <name>` | Component name | positional argument |
| `-d, --desc <desc>` | Component description | `"MetaFor {name}"` |
| `--dir <dir>` | Output directory | `.` |
| `-l, --lang <lang>` | Output language (ru\|en) | auto-detect |

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

## Generated Structure

```text
my-component/
├── src/
│   └── meta.ts          # Meta-Component
├── package.json         # Configuration
├── .gitignore          # Git ignore
└── index.html          # HTML template
```

## Requirements

- Node.js >= 18 or Bun >= 1.0.0

## License

MIT
