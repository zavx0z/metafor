Object.defineProperty(window, "theme", {
  value: {
    /**
     * Получает RGB значения из CSS переменной
     * @param {CSSColorsVariables} variable - Имя CSS переменной (например, '--color-secondary-50')
     * @returns {{r: number, g: number, b: number}} RGB значения
     */
    getRGBFromVar(variable) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
      const [r, g, b] = value.split(" ").map(Number)
      return {r, g, b}
    },
    /**
     * Создает строку цвета с нужной прозрачностью
     * @param {CSSColorsVariables} variable - Имя CSS переменной
     * @param {number} [alpha=1] - Прозрачность (0-1)
     * @returns {string} Строка цвета в формате rgba()
     */
    rgba(variable, alpha = 1) {
      const {r, g, b} = this.getRGBFromVar(variable)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  },
  writable: false,
  configurable: false
})
Object.defineProperty(window, "css", {
  /**
   * @param {TemplateStringsArray} strings
   * @param {...any} values
   * @returns {(target?: Document|ShadowRoot) => CSSStyleSheet}
   */
  value: (strings, ...values) => (target = document) => {
    const sheet = new CSSStyleSheet()
    const result = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "")
    sheet.replaceSync(result)
    target.adoptedStyleSheets.push(sheet)
    return sheet
  },
  writable: false,
  configurable: false
})
