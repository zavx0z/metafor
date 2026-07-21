#!/usr/bin/env node

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
  type MetaPackageIdentity,
} from "./generators.ts"
import {getGitUserName, gitAddAll, gitCommit, initGitRepo, isGitInstalled} from "./git.ts"

const PACKAGE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/
const OPTIONS_WITH_VALUE = new Set(["--name", "-n", "--desc", "-d", "--dir", "--lang", "-l"])

type CreationContext =
  | {kind: "root"; galaxyRoot: string; owner: string}
  | {kind: "internal"; repositoryRoot: string; owner: string; repository: string}

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

const creationContext = (baseDir: string): CreationContext | undefined => {
  if (!directoryExists(baseDir)) return

  const parent = dirname(baseDir)
  if (basename(parent) === "cluster" && PACKAGE_SEGMENT.test(basename(baseDir))) {
    return {kind: "root", galaxyRoot: baseDir, owner: basename(baseDir)}
  }

  const galaxyRoot = parent
  if (
    basename(dirname(galaxyRoot)) === "cluster" &&
    PACKAGE_SEGMENT.test(basename(galaxyRoot)) &&
    PACKAGE_SEGMENT.test(basename(baseDir)) &&
    existsSync(resolve(baseDir, ".git"))
  ) {
    return {
      kind: "internal",
      repositoryRoot: baseDir,
      owner: basename(galaxyRoot),
      repository: basename(baseDir),
    }
  }
}

const writePackage = (
  packagePath: string,
  identity: MetaPackageIdentity,
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
  ${runner} create metafor profile --dir cluster/zavx0z/capsule
  ${runner} create metafor container -d "${t.exampleWithDesc}" --dir cluster/zavx0z/capsule

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
  const baseDir = resolve(option(args, "--dir") ?? ".")
  const context = creationContext(baseDir) ?? fail(t.errorCreationRoot)
  const isRoot = context.kind === "root"
  const owner = context.owner
  const repository = context.kind === "root" ? name : context.repository
  const packagePath = context.kind === "root"
    ? resolve(context.galaxyRoot, name)
    : resolve(context.repositoryRoot, name)
  const identity: MetaPackageIdentity = context.kind === "root"
    ? {owner, repository}
    : {owner, repository, metaPackage: name}
  const source = isRoot ? `${owner}/${repository}` : `${owner}/${repository}/${name}`

  if (existsSync(packagePath)) fail(`${t.errorExists}: ${packagePath}`)
  if (isRoot && !isGitInstalled()) fail(t.errorGitRequired)

  console.log(`\n${t.creating} ${name}`)
  console.log(`   ${t.kind} ${isRoot ? t.rootAtom : t.internalAtom}`)
  console.log(`   ${t.description} ${description}`)
  console.log(`   ${t.source} ${source}`)
  console.log(`   ${t.path} ${packagePath}\n`)

  const author = getGitUserName(context.kind === "internal" ? context.repositoryRoot : undefined) ?? owner
  writePackage(packagePath, identity, source, name, description, author, t.errorLabel, t.htmlLang)

  if (isRoot) {
    if (!initGitRepo(packagePath) || !gitAddAll(packagePath) || !gitCommit(packagePath, "Initial commit")) {
      fail(t.errorGitInit)
    }
  }

  console.log(`${t.created} ${name}`)
  console.log(`   📄 ${packagePath}/meta.ts`)
  console.log(`   📦 ${source}`)
  if (isRoot) console.log(`   📂 ${packagePath}/.git/`)
  console.log(`\n${t.toBuild} cd ${packagePath} && bun run build\n`)
}

void main()
