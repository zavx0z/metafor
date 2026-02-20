#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import {
  generateMetaTemplate,
  generatePackageJson,
  generateGitignore,
  generateIndexHtml,
  getI18n,
  detectLanguage,
  type Lang,
} from "../templates/index.ts"

// Парсинг аргументов
const args = process.argv.slice(2)

// Обработка --lang
const langIndex = args.findIndex((arg) => arg === "--lang" || arg === "-l")
const userLang: Lang | undefined = langIndex !== -1 && args[langIndex + 1]
  ? (args[langIndex + 1] as Lang)
  : undefined
const lang: Lang = userLang || detectLanguage()
const t = getI18n(lang)

// Обработка --help
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
${t.helpTitle}

${t.helpUsage}
  npm create metafor <name> [options]
  bun create metafor <name> [options]

${t.helpOptions}
  -n, --name <name>    ${t.optionName}
  -d, --desc <desc>    ${t.optionDesc}
  --dir <dir>          ${t.optionDir} (${t.defaultDesc}: .)
  -l, --lang <lang>    ${t.optionLang}

${t.helpExamples}
  bun create metafor my-feature
  bun create metafor my-component -d "${t.exampleWithDesc}"
  bun create metafor my-component --dir packages
`)
  process.exit(0)
}

const nameIndex = args.findIndex((arg) => arg === "--name" || arg === "-n")
const nameArg = nameIndex !== -1 && args[nameIndex + 1]
  ? args[nameIndex + 1]
  : args.find((arg) => !arg.startsWith("--"))

if (!nameArg) {
  console.log(`
${t.helpTitle}

${t.helpUsage}
  npm create metafor <name> [options]
  bun create metafor <name> [options]

${t.helpOptions}
  -n, --name <name>    ${t.optionName}
  -d, --desc <desc>    ${t.optionDesc}
  --dir <dir>          ${t.optionDir} (${t.defaultDesc}: .)
  -l, --lang <lang>    ${t.optionLang}

${t.helpExamples}
  bun create metafor my-feature
  bun create metafor my-component -d "${t.exampleWithDesc}"
  bun create metafor my-component --dir packages
`)
  process.exit(0)
}

const descIndex = args.findIndex((arg) => arg === "--desc" || arg === "-d")
const desc = descIndex !== -1 && args[descIndex + 1]
  ? args[descIndex + 1]
  : `${t.defaultDesc} ${nameArg!.replace(/-/g, " ")}`

const dirIndex = args.findIndex((arg) => arg === "--dir")
const baseDir = dirIndex !== -1 && args[dirIndex + 1] ? args[dirIndex + 1]! : "."

const packageName = nameArg!
const packagePath = join(process.cwd(), baseDir, packageName)

console.log(`\n${t.creating} ${packageName}`)
console.log(`   ${t.description} ${desc}`)
console.log(`   ${t.path} ${packagePath}\n`)

// Создание директории
mkdirSync(`${packagePath}/src`, { recursive: true })

// Генерация meta.ts
const metaContent = generateMetaTemplate(packageName, desc!, t.errorLabel)
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

console.log(`${t.created} ${packageName}`)
console.log(`   📄 ${packagePath}/src/meta.ts`)
console.log(`   📄 ${packagePath}/package.json`)
console.log(`   📄 ${packagePath}/index.html`)
console.log(`\n${t.toBuild} cd ${packagePath} && bun run build\n`)
