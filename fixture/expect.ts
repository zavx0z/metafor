import { expect } from "bun:test"
import { diffChars } from "diff"
import prettier from "prettier"

/** Удаляет комментарии выражений из предоставленной html-строки. */
export const stripExpressionComments = (html: string) => html.replace(/<!--\?html\$[0-9]+\$-->|<!--\??-->/g, "")
/** Удаляет маркеры выражений из предоставленной html-строки. */
export const stripExpressionMarkers = (html: string) =>
  html.replace(/<!--\?html\$[0-9]+\$-->|<!--\??-->|html\$[0-9]+\$/g, "")

/** Удаляет все пробельные символы */
export const stripWhitespace = (str: unknown) => {
  const normalized = typeof str === "string" ? str.replace(/[\s\n]+/g, "") : String(str).replace(/[\s\n]+/g, "")
  return normalized.trim()
}

/** Канонизирует HTML через сериализацию DOM (Happy DOM / браузер) */
const canonicalizeViaDOM = (html: string) => {
  try {
    // Используем <template>, чтобы корректно держать произвольный фрагмент (несколько корневых узлов)
    const tpl = document.createElement("template")
    tpl.innerHTML = html
    return tpl.innerHTML
  } catch {
    // Если DOM недоступен (не наш случай), возвращаем как есть
    return html
  }
}

/** Нормализует порядок атрибутов в HTML тегах */
const normalizeAttributeOrder = (str: string) => {
  return str.replace(/<([^>]+)>/g, (match, tagContent) => {
    // Разделяем тег на имя и атрибуты
    const parts = tagContent.trim().split(/\s+/)
    const tagName = parts[0]
    const attributes = parts.slice(1)

    if (attributes.length === 0) {
      return `<${tagName}>`
    }

    // Сортируем атрибуты по имени
    const sortedAttributes = attributes.sort((a: string, b: string) => {
      const aName = a.split("=")[0] || ""
      const bName = b.split("=")[0] || ""
      return aName.localeCompare(bName)
    })

    return `<${tagName} ${sortedAttributes.join(" ")}>`
  })
}

/** Нормализует HTML строку для сравнения */
export const normalizeHTML = (str: string) => {
  // 1) Канонизируем через DOM (чтобы убрать различия вида visible vs visible="")
  const dom = canonicalizeViaDOM(str)
  return (
    dom
      // Удаляем лишние пробелы и переносы строк между тегами
      .replace(/>\s+</g, "><")
      // Удаляем пробелы в начале и конце
      .trim()
      // Нормализуем самозакрывающиеся теги (img, br, input, etc.) - убираем слэш
      .replace(/<([^>]+)\/>/g, "<$1>")
      // (!) БОЛЬШЕ НИЧЕГО НЕ ХАРДКОДИМ для булевых — за нас уже решил DOM-рантайм
      // Приводим одинарные кавычки атрибутов к двойным и экранируем внутренние двойные кавычки
      .replace(/(\s[^\s=]+)='([^']*)'/g, (_m, name, val) => {
        const escaped = String(val).replace(/\"/g, '"').replace(/"/g, "&quot;")
        return `${name}="${escaped}"`
      })
      // Нормализуем порядок атрибутов
      .replace(/<([^>]+)>/g, (match, tagContent) => {
        // Разделяем тег на имя и атрибуты
        const parts = tagContent.trim().split(/\s+/)
        const tagName = parts[0]
        const attributes = parts.slice(1)

        if (attributes.length === 0) {
          return `<${tagName}>`
        }

        // Сортируем атрибуты по имени
        const sortedAttributes = attributes.sort((a: string, b: string) => {
          const aName = a.split("=")[0] || ""
          const bName = b.split("=")[0] || ""
          return aName.localeCompare(bName)
        })

        return `<${tagName} ${sortedAttributes.join(" ")}>`
      })
      // Удаляем лишние пробелы внутри тегов, но сохраняем один пробел между атрибутами
      .replace(/\s+/g, " ")
      // Удаляем пробелы перед закрывающими скобками в тегах
      .replace(/\s+>/g, ">")
      // Удаляем пробелы в тексте между тегами
      .replace(/>\s+</g, "><")
      // Нормализуем текст внутри тегов - убираем лишние пробелы
      .replace(/>\s+([^<]+)\s+</g, ">$1<")
      // Убираем пробелы в начале и конце текста
      .replace(/>\s+([^<]+)</g, ">$1<")
      .replace(/>([^<]+)\s+</g, ">$1<")
      // Дополнительно схлопываем последовательности пробелов/переносов внутри текстовых узлов до одного пробела
      .replace(/>([^<]+)</g, (_m, text) => {
        const normalizedText = String(text).replace(/\s+/g, " ").trim()
        return ">" + normalizedText + "<"
      })
  )
}

/** Форматирует HTML с помощью prettier */
const formatHTML = async (html: string) => {
  try {
    const result = await prettier.format(html, {
      parser: "html",
      printWidth: 1, // Минимальная ширина для принудительного переноса
      tabWidth: 2,
      useTabs: false,
      semi: false,
      singleQuote: false,
      quoteProps: "as-needed",
      jsxSingleQuote: false,
      trailingComma: "none",
      bracketSpacing: false,
      bracketSameLine: false,
      arrowParens: "avoid",
      endOfLine: "lf",
    })
    return result
  } catch (error) {
    // Fallback к простому форматированию
    return html
      .replace(/></g, ">\n<")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n")
  }
}

/** Создает diff с помощью библиотеки diff */
const createDiff = (received: string, expected: string) => {
  try {
    const differences = diffChars(received, expected)
    let diffOutput = ""

    differences.forEach((part) => {
      if (part.added) {
        // Зеленый цвет для того, что ожидали (но не получили)
        diffOutput += `\x1b[32m${part.value}\x1b[0m`
      } else if (part.removed) {
        // Красный цвет для того, что получили (но не ожидали)
        diffOutput += `\x1b[31m${part.value}\x1b[0m`
      } else {
        // Обычный цвет для неизмененного
        diffOutput += part.value
      }
    })

    return diffOutput
  } catch (error) {
    // Fallback к простому сравнению строк
    return `Получено: ${received}\nОжидалось: ${expected}`
  }
}

const divider = "\n" + "-".repeat(20) + "\n"

const toMatchStringHTML = async (received: unknown, expected: string) => {
  const normalizedReceived = normalizeHTML(received as string)
  const normalizedExpected = normalizeHTML(expected)
  const pass = normalizedReceived === normalizedExpected

  if (pass) {
    return {
      message: () => `expected ${received} not to match ${expected} ignoring whitespace`,
      pass: true,
    }
  } else {
    // Debug output for investigation
    try {
      console.log("__DEBUG_NORMALIZED_RECEIVED__:\n", normalizedReceived)
      console.log("__DEBUG_NORMALIZED_EXPECTED__:\n", normalizedExpected)
    } catch {}
    const formattedReceived = await formatHTML(normalizedReceived)
    const formattedExpected = await formatHTML(normalizedExpected)
    const diff = createDiff(formattedReceived, formattedExpected)

    return {
      message: () => `\x1b[1mHTML не совпадает:\x1b[0m${divider}${diff}${divider}`,
      pass: false,
    }
  }
}

/** Сравнивает Proxy-контекст с plain-объектом по схеме */
function toPlainObject(proxy: any, schema: any): any {
  const result: any = {}
  const keys = Object.keys(schema)
  for (const key of keys) {
    result[key] = proxy[key]
  }
  return result
}

expect.extend({
  /** Проверяет, что строка соответствует ожидаемой строке, игнорируя пробельные символы. */
  toMatchStringHTML,
  /** Проверяет, что строка соответствует ожидаемой строке, игнорируя пробельные символы и маркеры выражений. */
  toMatchStringHTMLStripMarkers(received: unknown, expected: string) {
    return toMatchStringHTML(stripExpressionMarkers(received as string), expected)
  },
  /** Проверяет, что строка соответствует одной из ожидаемых строк, игнорируя пробельные символы и маркеры выражений. */
  oneOfMatchStringHTMLStripMarkers(received: unknown, expected: string[]) {
    const receivedString = stripWhitespace(stripExpressionMarkers(received as string))
    const expectedStrings = expected.map((e) => stripWhitespace(stripExpressionMarkers(e)))
    const pass = expectedStrings.includes(receivedString)
    if (pass) {
      return {
        message: () => `expected ${received} not to match ${expected} ignoring whitespace`,
        pass: true,
      }
    } else {
      return {
        message: () => `not match:${divider}${receivedString}${divider}${expectedStrings.join("\n")}`,
        pass: false,
      }
    }
  },
  /** Проверяет, что строка соответствует одной из ожидаемых строк, игнорируя пробельные символы и комментарии. */
  oneOfMatchStringHTMLStripComments(received: unknown, expected: string[]) {
    const receivedString = stripWhitespace(stripExpressionComments(received as string))
    const expectedStrings = expected.map((e) => stripWhitespace(stripExpressionComments(e)))
    const pass = expectedStrings.includes(receivedString)
    if (pass) {
      return {
        message: () => `expected ${received} not to match ${expected} ignoring whitespace`,
        pass: true,
      }
    } else {
      return {
        message: () => `not match:${divider}${receivedString}${divider}${expectedStrings.join("\n")}`,
        pass: false,
      }
    }
  },
  /** Проверяет, что строка соответствует ожидаемой строке, игнорируя пробельные символы и комментарии. */
  toMatchStringHTMLStripComments(received: unknown, expected: string) {
    return toMatchStringHTML(stripExpressionComments(received as string), expected)
  },
  /** Проверяет, что строка содержит ожидаемую строку, игнорируя пробельные символы и комментарии. */
  includeStringHTMLStripComments(received: unknown, expected: string) {
    const receivedString = stripWhitespace(stripExpressionComments(received as string))
    const expectedString = stripWhitespace(expected)
    const pass = receivedString.includes(expectedString)
    if (pass) {
      return {
        message: () => `expected ${received} not to include ${expected} ignoring whitespace`,
        pass: true,
      }
    } else {
      return {
        message: () => `not include:${divider}${receivedString}${divider}${expectedString}`,
        pass: false,
      }
    }
  },
  toPlainObjectEqual(received: unknown, schema: object, expected: object) {
    const plain = toPlainObject(received, schema)
    const pass = this.equals(plain, expected)
    if (pass) {
      return {
        message: () => `expected контекст не совпадать с plain-объектом по схеме`,
        pass: true,
      }
    } else {
      return {
        message: () =>
          `контекст не совпадает с plain-объектом по схеме\nОжидалось: ${JSON.stringify(
            expected,
            null,
            2
          )}\nПолучено: ${JSON.stringify(plain, null, 2)}`,
        pass: false,
      }
    }
  },
})

// Простой тест для проверки normalizeHTML
if (import.meta.main) {
  const testCases = [
    {
      input: `<div class="test" id="test" data-text="test">
        <img class="image test-image" src="test.jpg" visible="hidden" alt="test" /><br /><button
          class="button-test test-button"
          disabled="">
          test
        </button>
        <ul></ul>
      </div>`,
      expected: `<div class="test" id="test" data-text="test"><img class="image test-image" src="test.jpg" visible="hidden" alt="test"><br><button class="button-test test-button" disabled="">test</button><ul></ul></div>`,
    },
    {
      input: `<div>  Hello   World  </div>`,
      expected: `<div>Hello World</div>`,
    },
    {
      input: `<img src="test.jpg" />`,
      expected: `<img src="test.jpg">`,
    },
  ]

  for (const testCase of testCases) {
    const result = normalizeHTML(testCase.input)
    console.log(`Input: ${testCase.input}`)
    console.log(`Expected: ${testCase.expected}`)
    console.log(`Result: ${result}`)
    console.log(`Match: ${result === testCase.expected}`)
    console.log("---")
  }
}
