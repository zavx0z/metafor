#!/usr/bin/env node

import {spawnSync} from "node:child_process"
import {existsSync, mkdirSync, statSync, writeFileSync} from "node:fs"
import {basename, dirname, resolve} from "node:path"
import {detectLanguage, getI18n, type Lang} from "./i18n.ts"
import {
  generateGitignoreFile,
  generateIndexHtmlFile,
  generateMetaFile,
  generateMetaforTypesFile,
  generatePackageJsonFile,
  generateTodoFile,
  generateTsconfigFile,
  type MetaIdentity,
} from "./generators.ts"
import {getGitUserName, gitAddAll, gitCommit, initGitRepo, isGitInstalled} from "./git.ts"

const PACKAGE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/
const OPTIONS_WITH_VALUE = new Set(["--name", "-n", "--desc", "-d", "--dir", "--lang", "-l"])

const fail = (message: string): never => {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

const option = (args: string[], ...names: string[]): string | undefined => {
  const index = args.findIndex((arg) => names.includes(arg))
  return index >= 0 ? args[index + 1] : undefined
}

const positional = (args: string[]): string | undefined => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (OPTIONS_WITH_VALUE.has(arg)) {
      index += 1
      continue
    }
    if (!arg.startsWith("-")) return arg
  }
}

const directoryExists = (path: string): boolean =>
  existsSync(path) && statSync(path).isDirectory()

const containingMetaRepository = (path: string): string | undefined => {
  let current = resolve(path)
  while (true) {
    if (
      existsSync(resolve(current, ".git")) &&
      existsSync(resolve(current, "meta.ts"))
    ) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}

const runBunInstall = (cwd: string, errorMessage: string): void => {
  const result = spawnSync("bun", ["install"], {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    const detail = result.error?.message ?? result.stderr.trim()
    fail(detail ? `${errorMessage}: ${detail}` : errorMessage)
  }
}

const writePackage = (
  packagePath: string,
  identity: MetaIdentity,
  source: string,
  name: string,
  description: string,
  author: string,
  errorLabel: string,
  htmlLang: string,
): void => {
  mkdirSync(resolve(packagePath, "src"), {recursive: true})
  writeFileSync(resolve(packagePath, "meta.ts"), generateMetaFile(name, description, errorLabel))
  writeFileSync(resolve(packagePath, "src/metafor.d.ts"), generateMetaforTypesFile())
  writeFileSync(resolve(packagePath, "package.json"), generatePackageJsonFile(identity, description, author))
  writeFileSync(resolve(packagePath, "tsconfig.json"), generateTsconfigFile())
  writeFileSync(resolve(packagePath, "TODO.md"), generateTodoFile(name, description))
  writeFileSync(resolve(packagePath, ".gitignore"), generateGitignoreFile())
  writeFileSync(resolve(packagePath, "index.html"), generateIndexHtmlFile(name, description, htmlLang, source))
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const runner = typeof Bun !== "undefined" ? "bun" : "npm"
  const userLang = option(args, "--lang", "-l") as Lang | undefined
  const lang = userLang ?? await detectLanguage()
  const t = await getI18n(lang)

  const help = `
${t.helpTitle}

${t.helpUsage}
  ${runner} create metafor <name> [options]

${t.helpOptions}
  -n, --name <name>    ${t.optionName}
  -d, --desc <desc>    ${t.optionDesc}
  --dir <dir>          ${t.optionDir} (${t.defaultDesc}: .)
  -l, --lang <lang>    ${t.optionLang}

${t.helpExamples}
  ${runner} create metafor capsule --dir cluster/zavx0z
  ${runner} create metafor capsule-profile --dir cluster/zavx0z
  ${runner} create metafor capsule-container -d "${t.exampleWithDesc}" --dir cluster/zavx0z

${t.helpNoteName}
${t.helpNoteOptions}
`

  if (args.includes("--help") || args.includes("-h")) {
    console.log(help)
    return
  }

  const name = option(args, "--name", "-n") ?? positional(args)
  if (!name) {
    console.log(help)
    return
  }
  if (!PACKAGE_SEGMENT.test(name)) fail(t.errorPackageName)

  const description = option(args, "--desc", "-d") ?? `${t.defaultDesc} ${name.replace(/-/g, " ")}`
  const parentDirectory = resolve(option(args, "--dir") ?? ".")
  if (!directoryExists(parentDirectory)) fail(t.errorParent)

  const owner = basename(parentDirectory)
  if (!PACKAGE_SEGMENT.test(owner)) fail(t.errorOwner)

  const nestedIn = containingMetaRepository(parentDirectory)
  if (nestedIn) fail(`${t.errorNested}: ${nestedIn}`)

  const repository = name
  const packagePath = resolve(parentDirectory, repository)
  const identity: MetaIdentity = {owner, repository}
  const source = `${owner}/${repository}`

  if (existsSync(packagePath)) fail(`${t.errorExists}: ${packagePath}`)
  if (!isGitInstalled()) fail(t.errorGitRequired)

  console.log(`\n${t.creating} ${name}`)
  console.log(`   ${t.description} ${description}`)
  console.log(`   ${t.source} ${source}`)
  console.log(`   ${t.path} ${packagePath}\n`)

  const author = getGitUserName() ?? owner
  writePackage(packagePath, identity, source, name, description, author, t.errorLabel, t.htmlLang)

  console.log(`${t.installing} bun install`)
  runBunInstall(packagePath, t.errorInstall)

  if (!initGitRepo(packagePath) || !gitAddAll(packagePath) || !gitCommit(packagePath, "Initial commit")) {
    fail(t.errorGitInit)
  }

  console.log(`${t.created} ${name}`)
  console.log(`   📄 ${packagePath}/meta.ts`)
  console.log(`   📦 ${source}`)
  console.log(`   📂 ${packagePath}/.git/`)
  console.log(`\n${t.toBuild} cd ${packagePath} && bun run build\n`)
}

void main()
