/** Обработчик жестов для viewport */
export default class ViewportGestureHandler {
  /**
   * @param {import('../viewport.js').QuantumViewport} viewport - Экземпляр viewport
   * @param {QViewportConfig} config - Конфигурация viewport
   */
  constructor(viewport, config) {
    this.viewport = viewport
    this.config = config

    this.gestureStartScale = 1
    this.gestureStartTranslateX = 0
    this.gestureStartTranslateY = 0
    this.gestureStartX = 0
    this.gestureStartY = 0

    this.handleWheel = this.handleWheel.bind(this)
    this.handleGestureStart = this.handleGestureStart.bind(this)
    this.handleGestureChange = this.handleGestureChange.bind(this)
    this.handleGestureEnd = this.handleGestureEnd.bind(this)

    this.init()
  }

  /**
   * Инициализирует обработчики жестов и колесика мыши
   */
  init() {
    this.viewport.addEventListener("gesturestart", this.handleGestureStart, {passive: false})
    this.viewport.addEventListener("gesturechange", this.handleGestureChange, {passive: false})
    this.viewport.addEventListener("gestureend", this.handleGestureEnd, {passive: false})
    this.viewport.addEventListener("wheel", this.handleWheel, {passive: false})
  }

  /**
   * Обработчик начала жеста
   * @param {GestureEvent} e - Событие жеста
   */
  handleGestureStart(e) {
    e.preventDefault()
    const {scale, translateX, translateY} = this.viewport.state
    this.gestureStartScale = scale
    this.gestureStartTranslateX = translateX
    this.gestureStartTranslateY = translateY

    const rect = this.viewport.getBoundingClientRect()
    this.gestureStartX = e.clientX - rect.left
    this.gestureStartY = e.clientY - rect.top
  }

  /**
   * Обработчик изменения жеста
   * @param {GestureEvent} e - Событие жест
   */
  handleGestureChange(e) {
    const scale = this.gestureStartScale * e.scale
    const scaleConfig = this.config.handlers.gesture.scale
    if (scale >= scaleConfig.min && scale <= scaleConfig.max) {
      const contentX = (this.gestureStartX - this.gestureStartTranslateX) / this.gestureStartScale
      const contentY = (this.gestureStartY - this.gestureStartTranslateY) / this.gestureStartScale
      const translateX = this.gestureStartX - contentX * scale
      const translateY = this.gestureStartY - contentY * scale
      this.viewport.state = {scale, translateX, translateY}
    }
  }

  /** @param {GestureEvent} e - Событие жеста */
  handleGestureEnd = e => e.preventDefault()

  /**
   * Обработчик колесика мыши для масштабирования и перемещения
   * @param {WheelEvent} e - Событие колесика мыши
   */
  handleWheel(e) {
    const isZoomGesture = e.ctrlKey || e.metaKey || e.deltaY % 1 !== 0

    if (this.config.debug) {
      console.log("Wheel Debug:", {
        event: {
          deltaY: e.deltaY,
          deltaX: e.deltaX,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          isZoomGesture
        },
        viewport: {
          hasState: Boolean(this.viewport.state),
          state: this.viewport.state
        },
        handler: {
          context: this,
          hasViewport: Boolean(this.viewport)
        }
      })
    }

    const {scale, translateX, translateY} = this.viewport.state
    const scaleConfig = this.config.handlers.gesture.scale

    if (isZoomGesture) {
      if (!this.config.handlers.gesture.wheelZoomEnabled) return

      e.preventDefault()
      const delta = -e.deltaY * scaleConfig.speed
      const newScale = Math.min(Math.max(scale * (1 + delta), scaleConfig.min), scaleConfig.max)

      if (newScale === scale) return

      const rect = this.viewport.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const contentX = (mouseX - translateX) / scale
      const contentY = (mouseY - translateY) / scale

      if (this.config.debug) {
        console.log("Position Debug:", {
          mouse: {x: mouseX, y: mouseY},
          content: {x: contentX, y: contentY},
          translate: {
            old: {x: translateX, y: translateY},
            new: {
              x: mouseX - contentX * newScale,
              y: mouseY - contentY * newScale
            }
          }
        })
      }

      this.viewport.state = {
        scale: newScale,
        translateX: mouseX - contentX * newScale,
        translateY: mouseY - contentY * newScale,
        offset: {
          x: this.viewport.content.getBoundingClientRect().left,
          y: this.viewport.content.getBoundingClientRect().top
        }
      }
    } else {
      this.viewport.state = {
        translateX: translateX - e.deltaX,
        translateY: translateY - e.deltaY,
        offset: {
          x: this.viewport.content.getBoundingClientRect().left,
          y: this.viewport.content.getBoundingClientRect().top
        }
      }
    }
  }

  /**
   * Удаляет обработчики жестов и колесика мыши
   */
  destroy() {
    this.viewport.removeEventListener("gesturestart", this.handleGestureStart)
    this.viewport.removeEventListener("gesturechange", this.handleGestureChange)
    this.viewport.removeEventListener("gestureend", this.handleGestureEnd)
    this.viewport.removeEventListener("wheel", this.handleWheel)
  }
}
