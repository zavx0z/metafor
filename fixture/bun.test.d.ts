declare module "bun:test" {
  interface Matchers<T> {
    /** Проверяет, что Proxy-контекст эквивалентен plain-объекту по схеме */
    toPlainObjectEqual(schema: object, value: object): Matchers<T>
  }
}
