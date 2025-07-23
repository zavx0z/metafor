declare module "bun:test" {
  interface Matchers<T> {
    /** Проверяет, что строка соответствует ожидаемой строке, игнорируя пробельные символы. */
    toMatchStringHTML(expected: string): R
    /** Проверяет, что строка соответствует ожидаемой строке, игнорируя пробельные символы и комментарии. */
    toMatchStringHTMLStripComments(expected: string): R
    /** Проверяет, что строка соответствует ожидаемой строке, игнорируя пробельные символы и маркеры выражений. */
    toMatchStringHTMLStripMarkers(expected: string): R
    /** Проверяет, что строка соответствует одной из ожидаемых строк, игнорируя пробельные символы и маркеры выражений. */
    oneOfMatchStringHTMLStripMarkers(expected: string[]): R
    /** Проверяет, что строка содержит ожидаемую строку, игнорируя пробельные символы и комментарии. */
    includeStringHTMLStripComments(expected: string): R
    /** Проверяет, что строка соответствует одной из ожидаемых строк, игнорируя пробельные символы и комментарии. */
    oneOfMatchStringHTMLStripComments(expected: string[]): R
    /** Проверяет, что Proxy-контекст эквивалентен plain-объекту по схеме */
    toPlainObjectEqual(schema: object, value: object): R
  }
}
