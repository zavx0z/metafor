/**
 * Глобальные типы MetaFor
 *
 * Этот файл делает доступными типы MetaFor глобально без необходимости импорта.
 * Для runtime-доступа к MetaFor всё ещё требуется import "@metafor/meta" в файле.
 *
 * @example
 * ```ts
 * // В tsconfig.json добавьте:
 * // "compilerOptions": {
 * //   "types": ["@metafor/meta/global"]
 * // }
 *
 * // Теперь MetaFor доступен глобально:
 * export default MetaFor("my-component")
 *   .fields((field) => ({ name: field.string.required("") }))
 *   // ...
 * ```
 */
import type { MetaFor as MetaForType } from "./metafor.t"

// Глобальное объявление MetaFor
declare global {
  /**
   * Глобальный флаг режима разработки
   */
  var DEV: boolean

  /**
   * MetaFor — фабрика для создания web-компонента-атома конечного автомата
   * @param name - имя атома (используется для создания тега `meta-${name}`)
   * @returns chain API: fields() -> superposition() -> mass() -> processes() -> reactions() -> bulk()
   */
  var MetaFor: MetaForType

  interface Window {
    /**
     * MetaFor конструктор в window для доступа из браузера
     */
    MetaFor: MetaForType
  }
}
