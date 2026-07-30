import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Путь к шаблонам:
// - Для src: src/generators.ts -> ../templates/
// - Для dist: dist/generators.js -> templates/
const TEMPLATES_DIR = join(__dirname, "..", "templates")

/**
 * Загрузить шаблон из файла
 */
function loadTemplate(name: string): string {
  const templatePath = join(TEMPLATES_DIR, name)
  return readFileSync(templatePath, "utf-8")
}

/**
 * Заменить плейсхолдеры в шаблоне
 */
function render(template: string, data: Record<string, string>): string {
  return template
    .replace(/\/\*\s*@template\s+(\w+)\s*\*\/\s*""/g, (_, key) => data[key] || "")
    .replace(/{{(\w+)}}/g, (_, key) => data[key] || "")
}

function jsString(value: string): string {
  return JSON.stringify(value)
}

/**
 * Сгенерировать meta.ts
 */
export function generateMetaFile(name: string, description: string, errorLabel: string): string {
  const template = loadTemplate("meta.ts")
  return render(template, {
    nameJson: jsString(name),
    descriptionJson: jsString(description),
    errorLabelJson: jsString(errorLabel),
  })
}

/**
 * Сгенерировать локальные декларации DSL-глобалов
 */
export function generateMetaforTypesFile(): string {
  const template = loadTemplate("metafor.d.ts")
  const metadataOnlyMass = `type MetaForMassFormat = "json" | "binary"

type MetaForMassDeclaration = {
  readonly format: MetaForMassFormat
  readonly label?: string
  readonly description?: string
}

type MetaForMassDeclarations = Record<string, MetaForMassDeclaration>

type MetaForMassHandle = {
  readBytes(): Promise<Uint8Array>
  readText(): Promise<string>
  readJson(): Promise<unknown>
  write(value: unknown): Promise<void>
}

type MetaForMassHandles<Schema extends MetaForMassDeclarations> = {
  [Key in keyof Schema]: MetaForMassHandle
}

type MetaForMassOptions = {
  label?: string
  description?: string
}

type MetaForMassFactory = {
  json(options?: MetaForMassOptions): MetaForMassDeclaration
  binary(options?: MetaForMassOptions): MetaForMassDeclaration
}

`
  const withoutLegacyMass = template.replace(
    /type MetaForIsAny<Value>[\s\S]*?(?=type MetaForSelf =)/,
    metadataOnlyMass,
  )
  if (withoutLegacyMass === template) throw new Error("Generated MetaFor declaration is missing the legacy Mass contract")

  const generated = withoutLegacyMass.replace(
    /type MetaForMassStage<[\s\S]*?\n}\n\ntype MetaForSuperpositionStage/,
    `type MetaForMassStage<
  Fields extends MetaForFields,
  Superposition,
> = {
  mass<Factory extends (mass: MetaForMassFactory) => MetaForMassDeclarations>(
    factory: Factory,
  ): MetaForEnergyStage<Fields, Superposition, MetaForMassHandles<ReturnType<Factory>>>
}

type MetaForSuperpositionStage`,
  )
  if (generated === withoutLegacyMass) throw new Error("Generated MetaFor declaration is missing the Mass stage")
  return generated
}

/**
 * Сгенерировать TODO.md
 */
export function generateTodoFile(name: string, description: string): string {
  const template = loadTemplate("TODO.md")
  return render(template, {
    name,
    description,
  })
}

export interface MetaIdentity {
  owner: string
  repository: string
}

export function npmPackageName(identity: MetaIdentity): string {
  const scope = identity.owner.toLowerCase()
  return `@${scope}/${identity.repository.toLowerCase()}`
}

/**
 * Сгенерировать package.json независимого peer Meta-репозитория.
 * Canonical src owner/repository соответствует npm identity @owner/repository.
 */
export function generatePackageJsonFile(
  identity: MetaIdentity,
  description: string,
  author: string,
): string {
  const template = loadTemplate("package.json")
  return render(template, {
    packageNameJson: jsString(npmPackageName(identity)),
    descriptionJson: jsString(description),
    authorJson: jsString(author),
    buildScriptJson: jsString("bun build meta.ts --outdir dist --target browser --format=esm"),
  })
}

/**
 * Сгенерировать .gitignore
 */
export function generateGitignoreFile(): string {
  return loadTemplate("gitignore")
}

/**
 * Сгенерировать tsconfig.json
 */
export function generateTsconfigFile(): string {
  return loadTemplate("tsconfig.json")
}

/**
 * Экранирование HTML для безопасности
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Сгенерировать index.html
 */
export function generateIndexHtmlFile(
  name: string,
  description: string,
  htmlLang: string,
  source: string,
): string {
  const template = loadTemplate("index.html")
  return render(template, { name, description: escapeHtml(description), lang: htmlLang, source })
}
