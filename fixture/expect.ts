import { expect } from "bun:test"

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

const divider = "\n" + "-".repeat(20) + "\n"

const toMatchStringHTML = (received: unknown, expected: string) => {
  const normalizedReceived = stripWhitespace(received as string)
  const normalizedExpected = stripWhitespace(expected)
  const pass = normalizedReceived === normalizedExpected

  if (pass) {
    return {
      message: () => `expected ${received} not to match ${expected} ignoring whitespace`,
      pass: true,
    }
  } else {
    return {
      message: () => `not match:${divider}${normalizedReceived}${divider}${normalizedExpected}${divider}`,
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
