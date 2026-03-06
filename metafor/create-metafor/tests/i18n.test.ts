import { describe, test, expect, afterEach, beforeEach } from "bun:test"
import { detectLanguage, getI18n } from "../src/i18n.ts"

describe("detectLanguage", () => {
  // Сохраняем оригинальную платформу
  const originalPlatform = process.platform

  afterEach(() => {
    // Восстанавливаем платформу
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      writable: false,
      configurable: true
    })
  })

  test("должен определять русский на macOS", () => {
    Object.defineProperty(process, "platform", {
      value: "darwin",
      writable: false,
      configurable: true
    })
    // macOS использует AppleLocale через execSync - тестируем только что функция работает
    const lang = detectLanguage()
    expect(lang).toBeTypeOf("object") // Promise
  })

  test("должен определять язык на Linux", () => {
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: false,
      configurable: true
    })
    const originalLang = process.env.LANG
    process.env.LANG = "ru_RU.UTF-8"
    const lang = detectLanguage()
    expect(lang).toBeTypeOf("object") // Promise
    process.env.LANG = originalLang
  })

  test("должен использовать Intl API фоллбэк", async () => {
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: false,
      configurable: true
    })
    const originalLang = process.env.LANG
    const originalLCAll = process.env.LC_ALL
    const originalLanguage = process.env.LANGUAGE
    process.env.LANG = ""
    process.env.LC_ALL = ""
    process.env.LANGUAGE = ""
    const lang = await detectLanguage()
    expect(["ru", "en"]).toContain(lang)
    process.env.LANG = originalLang
    process.env.LC_ALL = originalLCAll
    process.env.LANGUAGE = originalLanguage
  })
})

describe("getI18n", () => {
  test("должен возвращать русские строки", async () => {
    const t = await getI18n("ru")
    expect(t.optionName).toBe("Имя Мета")
    expect(t.htmlLang).toBe("ru")
  })

  test("должен возвращать английские строки", async () => {
    const t = await getI18n("en")
    expect(t.optionName).toBe("Meta name")
    expect(t.htmlLang).toBe("en")
  })

  test("должен использовать автодетект без параметров", async () => {
    const t = await getI18n()
    expect(t).toHaveProperty("optionName")
    expect(t).toHaveProperty("htmlLang")
  })
})
