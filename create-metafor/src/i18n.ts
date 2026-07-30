import { execSync } from "child_process"

export type Lang = "ru" | "en"

export interface I18nStrings {
  helpTitle: string
  helpUsage: string
  helpOptions: string
  helpExamples: string
  optionName: string
  optionDesc: string
  optionDir: string
  optionLang: string
  exampleCreate: string
  exampleWithDesc: string
  exampleWithDir: string
  creating: string
  description: string
  path: string
  source: string
  installing: string
  created: string
  toBuild: string
  defaultDesc: string
  errorLabel: string
  htmlLang: string
  helpNoteName: string
  helpNoteOptions: string
  errorPackageName: string
  errorParent: string
  errorOwner: string
  errorNested: string
  errorExists: string
  errorGitRequired: string
  errorInstall: string
  errorGitInit: string
}

const ru: I18nStrings = {
  helpTitle: "⚛️ Мета для...",
  helpUsage: "Использование:",
  helpOptions: "Опции:",
  helpExamples: "Примеры:",
  optionName: "Имя Мета",
  optionDesc: "Описание Мета",
  optionDir: "Родительский каталог peer Meta-репозиториев",
  optionLang: "Язык вывода (ru|en)",
  exampleCreate: "Создать Мета",
  exampleWithDesc: "Создать с описанием",
  exampleWithDir: "Создать в другой директории",
  creating: "Создание Мета:",
  description: "Описание:",
  path: "Путь:",
  source: "WIMP src:",
  installing: "Установка зависимостей:",
  created: "✅ Создана",
  toBuild: "📦 Для сборки:",
  defaultDesc: "MetaFor",
  errorLabel: "Ошибка",
  htmlLang: "ru",
  helpNoteName: "<name> — имя Мета (обязательно)",
  helpNoteOptions: "[options] — необязательные опции",
  errorPackageName: "Имя Meta-репозитория должно быть одним нижнерегистровым сегментом без slash",
  errorParent: "Родительский каталог --dir должен существовать",
  errorOwner: "Имя родительского каталога должно быть валидным owner segment",
  errorNested: "Нельзя создавать Meta внутри существующего Meta-репозитория",
  errorExists: "Meta-репозиторий уже существует",
  errorGitRequired: "Для создания peer Meta-репозитория требуется Git",
  errorInstall: "Не удалось установить зависимости Meta-репозитория",
  errorGitInit: "Не удалось инициализировать и зафиксировать peer Git-репозиторий",
}

const en: I18nStrings = {
  helpTitle: "⚛️ Meta for...",
  helpUsage: "Usage:",
  helpOptions: "Options:",
  helpExamples: "Examples:",
  optionName: "Meta name",
  optionDesc: "Meta description",
  optionDir: "Parent directory for peer Meta repositories",
  optionLang: "Output language (ru|en)",
  exampleCreate: "Create Meta",
  exampleWithDesc: "Create with description",
  exampleWithDir: "Create in custom directory",
  creating: "Creating Meta:",
  description: "Description:",
  path: "Path:",
  source: "WIMP src:",
  installing: "Installing dependencies:",
  created: "✅ Created",
  toBuild: "📦 To build:",
  defaultDesc: "MetaFor",
  errorLabel: "Error",
  htmlLang: "en",
  helpNoteName: "<name> — Meta name (required)",
  helpNoteOptions: "[options] — optional options",
  errorPackageName: "Meta repository name must be one lowercase segment without slashes",
  errorParent: "The --dir parent directory must exist",
  errorOwner: "The parent directory name must be a valid owner segment",
  errorNested: "A Meta cannot be created inside an existing Meta repository",
  errorExists: "Meta repository already exists",
  errorGitRequired: "Git is required to create a peer Meta repository",
  errorInstall: "Could not install Meta repository dependencies",
  errorGitInit: "Could not initialize and commit the peer Git repository",
}

export const translations: Record<Lang, I18nStrings> = {
  ru,
  en,
}

/**
 * Получить локаль macOS UI (AppleLocale)
 */
function getMacOSLocale(): string | null {
  try {
    const output = execSync("defaults read -g AppleLocale", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    })
    const locale = output.trim().split("_")[0] // ru_RU -> ru
    return locale || null
  } catch {
    return null
  }
}

/**
 * Получить локаль Linux из переменных окружения
 */
function getLinuxLocale(): string | null {
  const env = process.env as Record<string, string | undefined>
  const lang = env.LANG !== undefined ? env.LANG : ""
  const lcAll = env.LC_ALL !== undefined ? env.LC_ALL : ""
  const language = env.LANGUAGE !== undefined ? env.LANGUAGE : ""
  
  const locale: string = lang || lcAll || language

  if (locale) {
    return locale.split("_")[0]?.split(".")[0] || null // ru_RU.UTF-8 -> ru
  }
  return null
}

/**
 * Получить локаль Windows через PowerShell
 */
function getWindowsLocale(): string | null {
  try {
    const output = execSync(
      "powershell -NoProfile -Command \"(Get-Culture).Name\"",
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"]
      }
    )
    const locale = output.trim().split("-")[0] // ru-RU -> ru
    return locale || null
  } catch {
    return null
  }
}

/**
 * Автодетект языка системы
 */
export async function detectLanguage(): Promise<Lang> {
  // macOS: читаем AppleLocale (UI язык системы)
  if (process.platform === "darwin") {
    const macLocale = getMacOSLocale()
    if (macLocale) {
      return macLocale.startsWith("ru") ? "ru" : "en"
    }
  }
  
  // Windows: читаем через PowerShell
  if (process.platform === "win32") {
    const winLocale = getWindowsLocale()
    if (winLocale) {
      return winLocale.startsWith("ru") ? "ru" : "en"
    }
  }
  
  // Linux: читаем переменные окружения
  const linuxLocale = getLinuxLocale()
  if (linuxLocale) {
    return linuxLocale.startsWith("ru") ? "ru" : "en"
  }
  
  // Фоллбэк на Intl API
  const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale
  return intlLocale.startsWith("ru") ? "ru" : "en"
}

/**
 * Получить строки локализации
 */
export async function getI18n(lang?: Lang): Promise<I18nStrings> {
  const targetLang = lang ?? await detectLanguage()
  return translations[targetLang]
}
