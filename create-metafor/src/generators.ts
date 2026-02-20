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
  return template.replace(/{{(\w+)}}/g, (_, key) => data[key] || "")
}

/**
 * Сгенерировать meta.ts
 */
export function generateMetaFile(name: string, description: string, errorLabel: string): string {
  const template = loadTemplate("meta.ts")
  return render(template, { name, description, errorLabel })
}

/**
 * Сгенерировать package.json
 */
export function generatePackageJsonFile(name: string, description: string): string {
  const template = loadTemplate("package.json")
  return render(template, { name, description })
}

/**
 * Сгенерировать .gitignore
 */
export function generateGitignoreFile(): string {
  return loadTemplate("gitignore")
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
  return render(template, { name, description, lang: htmlLang })
}
