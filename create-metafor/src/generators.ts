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
    .replace(/\/\*\s*@template\s+(\w+)\s*\*\/\s*\{\}/g, (_, key) => data[key] || "{}")
    .replace(/\/\*\s*@template\s+(\w+)\s*\*\//g, (_, key) => data[key] || "")
    .replace(/{{(\w+)}}/g, (_, key) => data[key] || "")
}

function jsString(value: string): string {
  return JSON.stringify(value)
}

/**
 * Сгенерировать meta.ts
 */
export type MetaTemplateProfile = "standard" | "empty"

export function generateMetaFile(
  name: string,
  description: string,
  errorLabel: string,
  profile: MetaTemplateProfile = "standard",
): string {
  const template = loadTemplate("meta.ts")
  return render(template, {
    agentsImport: 'import agents from "./agents/index.tsx"',
    agentsStage: ".agents(agents)",
    nameJson: jsString(name),
    descriptionJson: jsString(description),
    fieldsBody: profile === "empty"
      ? "{}"
      : `{
    task: field.string.optional(),
    answer: field.string.optional(),
    status: field.string.required("idle"),
    error: field.string.optional({ label: ${jsString(errorLabel)} }),
  }`,
  })
}

/**
 * Сгенерировать локальные декларации DSL-глобалов
 */
export function generateMetaforTypesFile(): string {
  return loadTemplate("metafor.d.ts")
}

/** Baseline JSX composition; even an empty Meta keeps the reusable component. */
export function generateAgentsIndexFile(profile: MetaTemplateProfile = "standard"): string {
  return profile === "empty"
    ? '/** @jsxImportSource @metafor/dsl */\nexport default () => null\n'
    : loadTemplate("agents/index.tsx.txt")
}

export function generateAssistantFile(): string {
  return loadTemplate("agents/assistant.tsx.txt")
}

export function generateAgentsJsxTypesFile(): string {
  return loadTemplate("agents-jsx.d.ts.txt")
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
    repositoryJson: JSON.stringify({type: "git", url: `https://github.com/${identity.owner}/${identity.repository}.git`}),
    descriptionJson: jsString(description),
    authorJson: jsString(author),
    buildScriptJson: jsString("bun build meta.ts --outdir dist --target browser --format=esm --external=@metafor/dsl --external=@metafor/dsl/*"),
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
