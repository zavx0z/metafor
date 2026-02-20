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
}

const ru: I18nStrings = {
  helpTitle: "🎨 Create MetaFor Package",
  helpUsage: "Usage:",
  helpOptions: "Options:",
  helpExamples: "Examples:",
  optionName: "Имя пакета",
  optionDesc: "Описание пакета",
  optionDir: "Директория для создания",
  optionLang: "Язык вывода (ru|en)",
  exampleCreate: "Создать пакет",
  exampleWithDesc: "Создать с описанием",
  exampleWithDir: "Создать в другой директории",
  creating: "Creating MetaFor package:",
  description: "Description:",
  path: "Path:",
  created: "✅ Created",
  toBuild: "📦 To build:",
  defaultDesc: "MetaFor",
  errorLabel: "Ошибка",
}

const en: I18nStrings = {
  helpTitle: "🎨 Create MetaFor Package",
  helpUsage: "Usage:",
  helpOptions: "Options:",
  helpExamples: "Examples:",
  optionName: "Package name",
  optionDesc: "Package description",
  optionDir: "Output directory",
  optionLang: "Output language (ru|en)",
  exampleCreate: "Create a package",
  exampleWithDesc: "Create with description",
  exampleWithDir: "Create in custom directory",
  creating: "Creating MetaFor package:",
  description: "Description:",
  path: "Path:",
  created: "✅ Created",
  toBuild: "📦 To build:",
  defaultDesc: "MetaFor",
  errorLabel: "Error",
}

export const translations: Record<Lang, I18nStrings> = {
  ru,
  en,
}

/**
 * Автодетект языка системы
 */
export function detectLanguage(): Lang {
  const locale = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || ""
  return locale.toLowerCase().startsWith("ru") ? "ru" : "en"
}

/**
 * Получить строки локализации
 */
export function getI18n(lang?: Lang): I18nStrings {
  const targetLang = lang || detectLanguage()
  return translations[targetLang]
}
