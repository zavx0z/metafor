#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import {
  getI18n,
  detectLanguage,
  type Lang,
} from "./i18n.ts"
import {
  generateMetaFile,
  generatePackageJsonFile,
  generateGitignoreFile,
  generateIndexHtmlFile,
} from "./generators.ts"
import {
  isGitInstalled,
  getGitUserName,
  getGitUserEmail,
  initGitRepo,
  gitAddAll,
  gitCommit,
} from "./git.ts"
import { runSelfUpdate } from "./update.ts"

async function main() {
  // Парсинг аргументов
  const args = process.argv.slice(2)

  if (args.includes("--self-update") || args.includes("--update")) {
    console.log("\n🔄 Обновляю create-metafor до последней версии...\n")
    const result = await runSelfUpdate()

    if (result.ok) {
      console.log("\n✅ create-metafor обновлен. Кеш npx очищен.\n")
      process.exit(0)
    }

    console.error(`\n❌ Не удалось обновить: ${result.error}\n`)
    console.error(`Попробуйте вручную: ${result.command.label}\n`)
    process.exit(1)
  }

  // Если нет аргументов и есть интерактивный терминал — запускаем TUI
  if (args.length === 0 && process.stdin.isTTY) {
    const { spawn } = await import("child_process")
    const { fileURLToPath } = await import("url")
    const { dirname } = await import("path")
    
    // Путь к директории установленного пакета
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    
    // Запускаем через тот же рантайм (bun или node)
    const runtime = typeof Bun !== "undefined" ? "bun" : "node"
    // Путь к TUI относительно установленного пакета
    const tuiPath = runtime === "bun" 
      ? `${__dirname}/tui/tui.tsx` 
      : `${__dirname}/tui.js`
    
    const child = spawn(runtime, [tuiPath], { stdio: "inherit" })
    child.on("exit", (code) => process.exit(code || 0))
    child.on("error", () => {
      // Если TUI не запустился — показываем help
      console.log("\nИспользуйте аргументы:\n")
      console.log("  bun create metafor <name> -d \"description\"\n")
    })
    return
  }

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
  --self-update        self update create-metafor

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
  --self-update        self update create-metafor

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
const packagePath = join(process.cwd(), baseDir, packageName)

console.log(`\n${t.creating} ${packageName}`)
console.log(`   ${t.description} ${desc}`)
console.log(`   ${t.path} ${packagePath}\n`)

// Создание директории
mkdirSync(`${packagePath}/src`, { recursive: true })

// Генерация meta.ts
const metaContent = generateMetaFile(packageName, desc!, t.errorLabel)
writeFileSync(`${packagePath}/src/meta.ts`, metaContent)

// Генерация package.json
const author = getGitUserName() || "unknown"
const packageJson = generatePackageJsonFile(packageName, desc!, author)
writeFileSync(`${packagePath}/package.json`, packageJson)

// Генерация .gitignore
const gitignore = generateGitignoreFile()
writeFileSync(`${packagePath}/.gitignore`, gitignore)

// Генерация index.html
const indexHtml = generateIndexHtmlFile(packageName, desc!, t.htmlLang)
writeFileSync(`${packagePath}/index.html`, indexHtml)

// Инициализация git репозитория
if (isGitInstalled()) {
  initGitRepo(packagePath)
  gitAddAll(packagePath)
  gitCommit(packagePath, "Initial commit")
}

console.log(`${t.created} ${packageName}`)
console.log(`   📄 ${packagePath}/src/meta.ts`)
console.log(`   📄 ${packagePath}/package.json`)
console.log(`   📄 ${packagePath}/index.html`)
console.log(`   📄 ${packagePath}/.gitignore`)
if (isGitInstalled()) {
  console.log(`   📂 ${packagePath}/.git/`)
}
console.log(`\n${t.toBuild} cd ${packagePath} && bun run build\n`)
}

main()
