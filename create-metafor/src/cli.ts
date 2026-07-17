#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "fs"
import { spawnSync } from "child_process"
import { resolve } from "path"
import {
  getI18n,
  detectLanguage,
  type Lang,
} from "./i18n.ts"
import {
  generateMetaFile,
  generateMetaforTypesFile,
  generateTodoFile,
  generatePackageJsonFile,
  generateGitignoreFile,
  generateIndexHtmlFile,
  generateTsconfigFile,
} from "./generators.ts"
import {
  isGitInstalled,
  getGitUserName,
  initGitRepo,
  gitAddAll,
  gitCommit,
} from "./git.ts"

function runBunInstall(cwd: string): void {
  const result = spawnSync("bun", ["install"], {
    cwd,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error.message)
    }
    process.exit(result.status ?? 1)
  }
}

async function main() {
  // Парсинг аргументов
  const args = process.argv.slice(2)

  // Определяем рантайм
  const isBun = typeof Bun !== "undefined"
  const runner = isBun ? "bun" : "npm"

  // Обработка --lang
  const langIndex = args.findIndex((arg) => arg === "--lang" || arg === "-l")
  const userLang: Lang | undefined = langIndex !== -1 && args[langIndex + 1]
    ? (args[langIndex + 1] as Lang)
    : undefined
  const lang: Lang = userLang ?? await detectLanguage()
  const t = await getI18n(lang)

// Обработка --help
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
${t.helpTitle}

${t.helpUsage}
  ${runner} create metafor <name> [options]

${t.helpOptions}
  -n, --name <name>    ${t.optionName}
  -d, --desc <desc>    ${t.optionDesc}
  --dir <dir>          ${t.optionDir} (${t.defaultDesc}: .)
  -l, --lang <lang>    ${t.optionLang}

${t.helpExamples}
  ${runner} create metafor my-feature
  ${runner} create metafor my-component -d "${t.exampleWithDesc}"
  ${runner} create metafor my-component --dir packages

${t.helpNoteName}
${t.helpNoteOptions}
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
  ${runner} create metafor <name> [options]

${t.helpOptions}
  -n, --name <name>    ${t.optionName}
  -d, --desc <desc>    ${t.optionDesc}
  --dir <dir>          ${t.optionDir} (${t.defaultDesc}: .)
  -l, --lang <lang>    ${t.optionLang}

${t.helpExamples}
  ${runner} create metafor my-feature
  ${runner} create metafor my-component -d "${t.exampleWithDesc}"
  ${runner} create metafor my-component --dir packages

${t.helpNoteName}
${t.helpNoteOptions}
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
const packagePath = resolve(baseDir, packageName)

console.log(`\n${t.creating} ${packageName}`)
console.log(`   ${t.description} ${desc}`)
console.log(`   ${t.path} ${packagePath}\n`)

// Создание директории
mkdirSync(`${packagePath}/src`, { recursive: true })

// Генерация meta.ts
const metaContent = generateMetaFile(packageName, desc!, t.errorLabel)
writeFileSync(`${packagePath}/meta.ts`, metaContent)

// Генерация локальных деклараций DSL-глобалов
writeFileSync(`${packagePath}/src/metafor.d.ts`, generateMetaforTypesFile())

// Генерация package.json
const author = getGitUserName() || "unknown"
const packageJson = generatePackageJsonFile(packageName, desc!, author)
writeFileSync(`${packagePath}/package.json`, packageJson)

// Генерация tsconfig.json
writeFileSync(`${packagePath}/tsconfig.json`, generateTsconfigFile())

// Генерация TODO.md
writeFileSync(`${packagePath}/TODO.md`, generateTodoFile(packageName, desc!))

// Генерация .gitignore
const gitignore = generateGitignoreFile()
writeFileSync(`${packagePath}/.gitignore`, gitignore)

// Генерация index.html
const indexHtml = generateIndexHtmlFile(packageName, desc!, t.htmlLang)
writeFileSync(`${packagePath}/index.html`, indexHtml)

// Установка зависимостей и создание lockfile
console.log(`${t.installing} bun install`)
runBunInstall(packagePath)

// Инициализация git репозитория
if (isGitInstalled()) {
  initGitRepo(packagePath)
  gitAddAll(packagePath)
  gitCommit(packagePath, "Initial commit")
}

console.log(`${t.created} ${packageName}`)
console.log(`   📄 ${packagePath}/meta.ts`)
console.log(`   📄 ${packagePath}/src/metafor.d.ts`)
console.log(`   📄 ${packagePath}/package.json`)
console.log(`   📄 ${packagePath}/tsconfig.json`)
console.log(`   📄 ${packagePath}/TODO.md`)
console.log(`   📄 ${packagePath}/index.html`)
console.log(`   📄 ${packagePath}/.gitignore`)
if (isGitInstalled()) {
  console.log(`   📂 ${packagePath}/.git/`)
}
console.log(`\n${t.toBuild} cd ${packagePath} && bun run build\n`)
}

main()
