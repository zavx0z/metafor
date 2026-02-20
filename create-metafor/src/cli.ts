#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"

// Парсинг аргументов
const args = process.argv.slice(2)
const nameArg = args.find((arg, i) => arg === "--name" || arg === "-n")?.[1]
  || args.find((arg, i) => !arg.startsWith("--"))

if (!nameArg) {
  console.log(`
🎨 Create MetaFor Package

Usage:
  npx create-metafor <name> [options]
  bunx create-metafor <name> [options]

Options:
  -n, --name <name>    Имя пакета (например: git-work-add)
  -d, --desc <desc>    Описание пакета
  --dir <dir>          Директория для создания (по умолчанию: zavx0z)

Examples:
  npx create-metafor git-work-add
  npx create-metafor git-work -d "Команды работы с файлами"
  npx create-metafor my-feature -d "Моя фича"
`)
  process.exit(0)
}

const descIndex = args.findIndex(arg => arg === "--desc" || arg === "-d")
const desc = descIndex !== -1 && args[descIndex + 1] ? args[descIndex + 1] : `MetaFor ${nameArg}`

const dirIndex = args.findIndex(arg => arg === "--dir")
const baseDir = dirIndex !== -1 && args[dirIndex + 1] ? args[dirIndex + 1] : "zavx0z"

const packageName = nameArg.startsWith("git-") ? nameArg : `git-${nameArg}`
const packagePath = join(process.cwd(), baseDir, packageName)

console.log(`\n🎨 Creating MetaFor package: ${packageName}`)
console.log(`   Description: ${desc}`)
console.log(`   Path: ${packagePath}\n`)

// Создание директории
mkdirSync(`${packagePath}/src`, { recursive: true })

// Генерация enum значений для группы
const enumValues = generateGroupEnum(packageName)

// Генерация meta.ts
const metaContent = generateMetaTemplate(packageName, desc, enumValues)
writeFileSync(`${packagePath}/src/meta.ts`, metaContent)

// Генерация package.json
const packageJson = {
  name: `@zavx0z/${packageName}`,
  version: "0.1.0",
  description: desc,
  type: "module",
  private: true,
  exports: {
    ".": "./src/meta.ts",
    "./monad": `./${packageName}.json`
  },
  dependencies: {
    "@metafor/build": "link:@metafor/build"
  },
  scripts: {
    build: `metafor-build src/meta.ts --out ${packageName}.json`
  }
}
writeFileSync(`${packagePath}/package.json`, JSON.stringify(packageJson, null, 2))

// Генерация index.html
const indexHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${desc}</title>
</head>
<body>
  <meta-for src="zavx0z/${packageName}"></meta-for>
</body>
</html>
`
writeFileSync(`${packagePath}/index.html`, indexHtml)

console.log(`✅ Created ${packageName}`)
console.log(`   📄 ${packagePath}/src/meta.ts`)
console.log(`   📄 ${packagePath}/package.json`)
console.log(`   📄 ${packagePath}/index.html`)
console.log(`\n📦 To build: cd ${packagePath} && bun run build\n`)

// Генерация enum значений для группы
function generateGroupEnum(packageName: string): string[] {
  const groupEnums: Record<string, string[]> = {
    "git-start": ["clone", "init"],
    "git-work": ["add", "mv", "restore", "rm", "clean", "sparse-checkout"],
    "git-examine": ["show", "status", "diff", "log", "range-diff", "shortlog", "describe"],
    "git-history": ["switch", "checkout", "commit", "reset", "revert", "bisect", "repair"],
    "git-collaborate": ["fetch", "pull", "push", "remote"],
    "git-config": ["config", "help"],
  }
  return groupEnums[packageName] || []
}

// Генерация шаблона meta.ts
function generateMetaTemplate(name: string, description: string, enumValues: string[]): string {
  if (enumValues.length > 0) {
    return `import "@metafor/meta"

export default MetaFor("${name}", { desc: "${description}" })
  .context((t) => ({
    operation: t.enum(
      ${enumValues.map(v => `"${v}"`).join(",\n      ")}
    ).optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html\`
      \${context.operation &&
      html\` <meta-for src="zavx0z/${name}-\${context.operation}" context=\${{ args: context.args }} /> \`}
    \`,
  })
`
  }

  // Шаблон для команды или группы без enum
  return `import "@metafor/meta"

export default MetaFor("${name}", { desc: "${description}" })
  .context((t) => ({
    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html\`
      \${context.error && html\`<div class="error">\${context.error}</div>\`}
    \`,
  })
`
}
