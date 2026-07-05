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
  return loadTemplate("metafor.d.ts")
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

/**
 * Сгенерировать package.json
 */
export function generatePackageJsonFile(
  name: string,
  description: string,
  author: string
): string {
  const template = loadTemplate("package.json")
  return render(template, {
    packageNameJson: jsString(`@zavx0z/${name}`),
    descriptionJson: jsString(description),
    authorJson: jsString(author),
    buildScriptJson: jsString("bun build src/meta.ts --outdir dist --target browser --format=esm"),
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
  htmlLang: string
): string {
  const template = loadTemplate("index.html")
  return render(template, { name, description: escapeHtml(description), lang: htmlLang })
}
