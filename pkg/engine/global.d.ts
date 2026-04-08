declare module "*.wgsl" {
  const value: string
  export default value
}
/**
 * Расширяет стандартный интерфейс ImportMeta, добавляя поддержку
 * для API горячей замены модулей (HMR), предоставляемого Bun.
 */
interface ImportMeta {
  /**
   * API для горячей замены модулей. Позволяет принимать обновления
   * без полной перезагрузки страницы.
   */
  hot?: {
    /**
     * Принимает обновления для текущего модуля.
     * @param callback Функция, которая будет вызвана при обновлении.
     */
    accept(callback?: () => void): void
  }
}
