# create-metafor

🎨 Scaffolding tool for creating MetaFor packages

## Quick Start

```bash
# Using npm
npm create metafor my-package

# Using Bun (faster)
bunx create-metafor my-package
```

## Usage

### Create a command package

```bash
npm create metafor git-work-add
```

Creates a simple MetaFor package with error handling template.

### Create a group package

```bash
npm create metafor git-work -d "Команды работы с файлами"
```

For known git groups, automatically generates enum with commands:

- `git-start` → clone, init
- `git-work` → add, mv, restore, rm, clean, sparse-checkout
- `git-examine` → show, status, diff, log, range-diff, shortlog, describe
- `git-history` → switch, checkout, commit, reset, revert, bisect, repair
- `git-collaborate` → fetch, pull, push, remote
- `git-config` → config, help

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Package name | positional argument |
| `-d, --desc <desc>` | Package description | "MetaFor {name}" |
| `--dir <dir>` | Output directory | `zavx0z` |

## Examples

```bash
# Create with custom description
npm create metafor git-work -d "Work with files"

# Create in custom directory
npm create metafor my-feature --dir packages

# Create with full name
npm create metafor git-work-add -d "Add files to staging"
```

## Generated Structure

```
zavx0z/git-work-add/
├── src/
│   └── meta.ts          # MetaFor component
├── package.json         # Package configuration
└── index.html          # HTML template
```

## Requirements

- Node.js >= 18 or Bun >= 1.0.0

## License

MIT
