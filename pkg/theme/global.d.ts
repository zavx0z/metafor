declare global {
  var css: (strings: TemplateStringsArray, ...values: any[]) => (target?: Document|ShadowRoot) => CSSStyleSheet
  /**
   * Шаблонизатор для создания HTML элементов
   * @param strings - Литеральная строка
   * @returns Функция рендеринга, которая:
   * - Если передан component: добавляет элементы в него и возвращает первый добавленный элемент
   * - Если component не передан: возвращает строку с HTML разметкой
   * - Если в шаблоне несколько корневых элементов: возвращает массив элементов
   */
  const theme: {
    /**
     * Получает RGB значения из CSS переменной
     * @param {CSSColorsVariables} variable - Имя CSS переменной (например, '--color-secondary-50')
     * @returns {{r: number, g: number, b: number}} RGB значения
     */
    getRGBFromVar: (variable: CSSColorsVariables) => {r: number; g: number; b: number}
    /**
     * Создает строку цвета с нужной прозрачностью
     * @param {CSSColorsVariables} variable - Имя CSS переменной
     * @param {number} [alpha=1] - Прозрачность (0-1)
     * @returns {string} Строка цвета в формате rgba()
     */
    rgba: (variable: CSSColorsVariables, alpha?: number) => string
  }
  /** Переменные CSS цветов */

  type CSSColorsVariables =
    | "--primary-50"
    | "--primary-100"
    | "--primary-200"
    | "--primary-300"
    | "--primary-400"
    | "--primary-500"
    | "--primary-600"
    | "--primary-700"
    | "--primary-800"
    | "--primary-900"
    | "--secondary-50"
    | "--secondary-100"
    | "--secondary-200"
    | "--secondary-300"
    | "--secondary-400"
    | "--secondary-500"
    | "--secondary-600"
    | "--secondary-700"
    | "--secondary-800"
    | "--secondary-900"
    | "--tertiary-50"
    | "--tertiary-100"
    | "--tertiary-200"
    | "--tertiary-300"
    | "--tertiary-400"
    | "--tertiary-500"
    | "--tertiary-600"
    | "--tertiary-700"
    | "--tertiary-800"
    | "--tertiary-900"
    | "--success-50"
    | "--success-100"
    | "--success-200"
    | "--success-300"
    | "--success-400"
    | "--success-500"
    | "--success-600"
    | "--success-700"
    | "--success-800"
    | "--success-900"
    | "--warning-50"
    | "--warning-100"
    | "--warning-200"
    | "--warning-300"
    | "--warning-400"
    | "--warning-500"
    | "--warning-600"
    | "--warning-700"
    | "--warning-800"
    | "--warning-900"
    | "--error-50"
    | "--error-100"
    | "--error-200"
    | "--error-300"
    | "--error-400"
    | "--error-500"
    | "--error-600"
    | "--error-700"
    | "--error-800"
    | "--error-900"
    | "--surface-50"
    | "--surface-100"
    | "--surface-200"
    | "--surface-300"
    | "--surface-400"
    | "--surface-500"
    | "--surface-600"
    | "--surface-700"
    | "--surface-800"
    | "--surface-900"
}
export {}
