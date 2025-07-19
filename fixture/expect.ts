import { expect } from "bun:test"

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
