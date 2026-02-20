#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import {
  generateMetaTemplate,
  generatePackageJson,
  generateGitignore,
  generateIndexHtml,
} from "../templates/index.ts"

// Парсинг аргументов
const args = process.argv.slice(2)

// Обработка --help
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
🎨 Create MetaFor Package

Usage:
  npm create metafor <name> [options]
  bun create metafor <name> [options]

Options:
  -n, --name <name>    Имя пакета
  -d, --desc <desc>    Описание пакета
  --dir <dir>          Директория для создания (по умолчанию: .)

Examples:
  bun create metafor my-feature
  bun create metafor my-component -d "Мой компонент"
`)
  process.exit(0)
}

const nameIndex = args.findIndex((arg) => arg === "--name" || arg === "-n")
const nameArg = nameIndex !== -1 && args[nameIndex + 1]
  ? args[nameIndex + 1]
  : args.find((arg) => !arg.startsWith("--"))

if (!nameArg) {
  console.log(`
🎨 Create MetaFor Package

Usage:
  npm create metafor <name> [options]
  bun create metafor <name> [options]

Options:
  -n, --name <name>    Имя пакета
  -d, --desc <desc>    Описание пакета
  --dir <dir>          Директория для создания (по умолчанию: .)

Examples:
  bun create metafor my-feature
  bun create metafor my-component -d "Мой компонент"
`)
  process.exit(0)
}

const descIndex = args.findIndex((arg) => arg === "--desc" || arg === "-d")
const desc = descIndex !== -1 && args[descIndex + 1]
  ? args[descIndex + 1]
  : `MetaFor ${nameArg!.replace(/-/g, " ")}`

const dirIndex = args.findIndex((arg) => arg === "--dir")
const baseDir = dirIndex !== -1 && args[dirIndex + 1] ? args[dirIndex + 1]! : "."

const packageName = nameArg!
const packagePath = join(process.cwd(), baseDir, packageName)

console.log(`\n🎨 Creating MetaFor package: ${packageName}`)
console.log(`   Description: ${desc}`)
console.log(`   Path: ${packagePath}\n`)

// Создание директории
mkdirSync(`${packagePath}/src`, { recursive: true })

// Генерация meta.ts (базовый шаблон)
const metaContent = generateMetaTemplate(packageName, desc!)
writeFileSync(`${packagePath}/src/meta.ts`, metaContent)

// Генерация package.json
const packageJson = generatePackageJson(packageName, desc!)
writeFileSync(`${packagePath}/package.json`, JSON.stringify(packageJson, null, 2))

// Генерация .gitignore
const gitignore = generateGitignore()
writeFileSync(`${packagePath}/.gitignore`, gitignore)

// Генерация index.html
const indexHtml = generateIndexHtml(packageName, desc!)
writeFileSync(`${packagePath}/index.html`, indexHtml)

console.log(`✅ Created ${packageName}`)
console.log(`   📄 ${packagePath}/src/meta.ts`)
console.log(`   📄 ${packagePath}/package.json`)
console.log(`   📄 ${packagePath}/index.html`)
console.log(`\n📦 To build: cd ${packagePath} && bun run build\n`)
