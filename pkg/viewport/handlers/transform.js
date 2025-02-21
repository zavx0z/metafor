/** Обработчик трансформаций viewport */
export default class ViewportTransformHandler {
  /**
   * @param {import('../viewport.js').QuantumViewport} viewport - Экземпляр viewport
   * @param {QViewportConfig} config - Конфигурация viewport
   * @param {() => void} onTransform - Callback для обработки трансформации
   */
  constructor(viewport, config, onTransform) {
    this.viewport = viewport
    this.config = config
    this.onTransform = onTransform
    this.previousWidth = 0
    this.previousHeight = 0
    this.transformRequest = undefined
    this.handleResize = this.handleResize.bind(this)
    this.debounce = this.debounce.bind(this)

    this.init()
  }

  init() {
    const rect = this.viewport.getBoundingClientRect()
    this.previousWidth = rect.width
    this.previousHeight = rect.height

    window.addEventListener("resize", /** @type {EventListener} */ (this.debounce(this.handleResize, 100)))
  }

  /** Обновляет трансформацию с использованием requestAnimationFrame */
  updateTransform() {
    if (this.transformRequest) cancelAnimationFrame(this.transformRequest)
    this.transformRequest = requestAnimationFrame(() => {
      this.viewport.content.style.transform = `
          translate(${this.viewport.state.translateX}px, ${this.viewport.state.translateY}px) 
          scale(${this.viewport.state.scale})
        `
      this.onTransform()
    })
  }

  /**
   * Установка масштаба с центрированием
   * @param {number} scale - Новый масштаб
   * @param {number} centerX - Координата X центра масштабирования
   * @param {number} centerY - Координата Y центра масштабирования
   */
  setScale(scale, centerX, centerY) {
    const state = this.viewport.state
    const contentX = (centerX - state.translateX) / state.scale
    const contentY = (centerY - state.translateY) / state.scale

    this.viewport.state = {
      scale,
      translateX: centerX - contentX * scale,
      translateY: centerY - contentY * scale
    }
  }

  /** Обработчик изменения размера окна */
  handleResize() {
    const rect = this.viewport.getBoundingClientRect()
    const newWidth = rect.width
    const newHeight = rect.height

    const deltaWidth = newWidth - this.previousWidth
    const deltaHeight = newHeight - this.previousHeight
    const {translateX, translateY} = this.viewport.state
    this.viewport.state = {
      translateX: translateX + deltaWidth / 2,
      translateY: translateY + deltaHeight / 2
    }

    this.previousWidth = newWidth
    this.previousHeight = newHeight

    if (this.viewport.grid) {
      this.viewport.grid.resize()
      this.viewport.grid.draw(this.viewport.state)
    }
  }

  /**
   * Отложенный вызов функции
   * @param {EventListener} func - Функция обратного вызова
   * @param {number} wait - Задержка в миллисекундах
   * @returns {EventListener}
   */
  debounce(func, wait) {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timeout
    return event => {
      if (timeout !== undefined) clearTimeout(timeout)
      timeout = setTimeout(() => func(event), wait)
    }
  }

  destroy() {
    window.removeEventListener("resize", /** @type {EventListener} */ (this.debounce(this.handleResize, 100)))
  }
}
