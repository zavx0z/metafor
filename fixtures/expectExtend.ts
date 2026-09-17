import {expect} from "bun:test"
import {render} from "html"

/** Удаляет комментарии выражений из предоставленной html-строки. */
export const stripExpressionComments = (html: string) => html.replace(/<!--\?atom\$[0-9]+\$-->|<!--\??-->/g, "")
/** Удаляет маркеры выражений из предоставленной html-строки. */
export const stripExpressionMarkers = (html: string) =>
  html.replace(/<!--\?atom\$[0-9]+\$-->|<!--\??-->|atom\$[0-9]+\$/g, "")

/** Удаляет все пробельные символы */
export const stripWhitespace = (str: unknown) => {
  const normalized = typeof str === "string" ? str.replace(/[\s\n]+/g, "") : String(str).replace(/[\s\n]+/g, "")
  return normalized.trim()
}

export const makeExpectRender = (getContainer: () => HTMLElement) => (value: unknown, expected: string) => {
  const container = getContainer()
  render(value, container)
  return expect(stripWhitespace(stripExpressionComments(container.innerHTML))).toBe(expected)
}
const divider = "\n" + "-".repeat(20) + "\n"

const toMatchStringHTML = (received: unknown, expected: string) => {
  const normalizedReceived = stripWhitespace(received as string)
  const normalizedExpected = stripWhitespace(expected)
  const pass = normalizedReceived === normalizedExpected

  if (pass) {
    return {
      message: () => `expected ${received} not to match ${expected} ignoring whitespace`,
      pass: true
    }
  } else {
    return {
      message: () => `not match:${divider}${normalizedReceived}${divider}${normalizedExpected}${divider}`,
      pass: false
    }
  }
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
    const expectedStrings = expected.map(e => stripWhitespace(stripExpressionMarkers(e)))
    const pass = expectedStrings.includes(receivedString)
    if (pass) {
      return {
        message: () => `expected ${received} not to match ${expected} ignoring whitespace`,
        pass: true
      }
    } else {
      return {
        message: () => `not match:${divider}${receivedString}${divider}${expectedStrings.join("\n")}`,
        pass: false
      }
    }
  },
  /** Проверяет, что строка соответствует одной из ожидаемых строк, игнорируя пробельные символы и комментарии. */
  oneOfMatchStringHTMLStripComments(received: unknown, expected: string[]) {
    const receivedString = stripWhitespace(stripExpressionComments(received as string))
    const expectedStrings = expected.map(e => stripWhitespace(stripExpressionComments(e)))
    const pass = expectedStrings.includes(receivedString)
    if (pass) {
      return {
        message: () => `expected ${received} not to match ${expected} ignoring whitespace`,
        pass: true
      }
    } else {
      return {
        message: () => `not match:${divider}${receivedString}${divider}${expectedStrings.join("\n")}`,
        pass: false
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
        pass: true
      }
    } else {
      return {
        message: () => `not include:${divider}${receivedString}${divider}${expectedString}`,
        pass: false
      }
    }
  }
})
