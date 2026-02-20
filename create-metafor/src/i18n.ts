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
  created: string
  toBuild: string
  defaultDesc: string
  errorLabel: string
  htmlLang: string
  helpNoteName: string
  helpNoteOptions: string
}

const ru: I18nStrings = {
  helpTitle: "⚛️ Мета для...",
  helpUsage: "Использование:",
  helpOptions: "Опции:",
  helpExamples: "Примеры:",
  optionName: "Имя Мета",
  optionDesc: "Описание Мета",
  optionDir: "Директория для создания",
  optionLang: "Язык вывода (ru|en)",
  exampleCreate: "Создать Мета",
  exampleWithDesc: "Создать с описанием",
  exampleWithDir: "Создать в другой директории",
  creating: "Создание Мета:",
  description: "Описание:",
  path: "Путь:",
  created: "✅ Создана",
  toBuild: "📦 Для сборки:",
  defaultDesc: "MetaFor",
  errorLabel: "Ошибка",
  htmlLang: "ru",
  helpNoteName: "<name> — имя Мета (обязательно)",
  helpNoteOptions: "[options] — необязательные опции",
}

const en: I18nStrings = {
  helpTitle: "⚛️ Meta for...",
  helpUsage: "Usage:",
  helpOptions: "Options:",
  helpExamples: "Examples:",
  optionName: "Meta name",
  optionDesc: "Meta description",
  optionDir: "Output directory",
  optionLang: "Output language (ru|en)",
  exampleCreate: "Create Meta",
  exampleWithDesc: "Create with description",
  exampleWithDir: "Create in custom directory",
  creating: "Creating Meta:",
  description: "Description:",
  path: "Path:",
  created: "✅ Created",
  toBuild: "📦 To build:",
  defaultDesc: "MetaFor",
  errorLabel: "Error",
  htmlLang: "en",
  helpNoteName: "<name> — Meta name (required)",
  helpNoteOptions: "[options] — optional options",
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
    return output.trim().split("_")[0] // ru_RU -> ru
  } catch {
    return null
  }
}

/**
 * Получить локаль Linux из переменных окружения
 */
function getLinuxLocale(): string | null {
  const locale = 
    process.env.LANG || 
    process.env.LC_ALL || 
    process.env.LANGUAGE || 
    ""
  
  if (locale) {
    return locale.split("_")[0].split(".")[0] // ru_RU.UTF-8 -> ru
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
    return output.trim().split("-")[0] // ru-RU -> ru
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
