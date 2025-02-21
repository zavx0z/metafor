import ViewportDragHandler from "./handlers/drag.js"
import ViewportGestureHandler from "./handlers/gesture.js"
import ViewportTransformHandler from "./handlers/transform.js"
import {ViewportCanvas} from "./components/viewport-canvas.js"
import "./components/viewport-grid.js"
import {Atom} from "../machine/atom.js"
import {when} from "../html/directives/when.js"

/** @type {QViewportConfig} */
const DEFAULT_CONFIG = {
  debug: false,
  grid: {
    size: 50,
    color: "transparent",
    // color: "rgba(49, 49, 49, 0.325)",
    lineWidth: 1,
    mainColor: "transparent",
    // mainColor: "rgba(119, 118, 119, 0.1)",
    mainLineWidth: 2
  },
  handlers: {
    gesture: {
      scale: {
        min: 0.1,
        max: 20,
        step: 0.1,
        speed: 0.005
      },
      wheelZoomEnabled: true
    },
    drag: {
      enabled: true,
      middleButton: true,
      spaceKey: true,
      dragSelectors: true
    },
    transform: {
      resizeDebounce: 100,
      animationDuration: 500,
      animationEasing: "ease-out"
    }
  },
  animation: {
    duration: 500,
    easing: "ease-out"
  }
}

/**
 * Quantum Viewport - компонент для создания бесконечной области просмотра
 * @interface QViewportElement
 */
export class QuantumViewport extends HTMLElement {
  /** @type {QViewportState} */ #state = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    offset: {
      x: this.getBoundingClientRect().left,
      y: this.getBoundingClientRect().top
    }
  }
  /** @type {QViewportConfig} */ config
  grid
  /** @type {ViewportCanvas} */ canvas
  /** @type {ViewportDragHandler | null} */ dragHandler = null
  /** @type {ViewportGestureHandler | null} */ gestureHandler = null
  /** @type {ViewportTransformHandler} */ transformHandler
  /** @type {boolean} */ #debug = false
  /** @type {HTMLElement} */ content

  constructor() {
    super()
    this.config = DEFAULT_CONFIG
    const content = this.innerHTML
    html`
      <viewport-grid></viewport-grid>
      <div class="viewport-content">${content}</div>
      <viewport-canvas debug="${this.getAttribute("debug") || this.config.debug}"></viewport-canvas>
    `(this)
    this.grid = /** @type {any} */ (this.querySelector("viewport-grid"))
    this.canvas = /** @type {ViewportCanvas} */ (this.querySelector("viewport-canvas"))
    this.content = /** @type {HTMLElement} */ (this.querySelector(".viewport-content"))
    this.gestureHandler = new ViewportGestureHandler(this, this.config)
    this.dragHandler = new ViewportDragHandler(this, this.config)
    this.transformHandler = new ViewportTransformHandler(this, this.config, () => {
      this.grid.draw(this.#state)

      // Обновляем координаты для отрисовки всех edges с учетом текущего состояния viewport
      for (const [id, edge] of this.canvas.edges) {
        const [el1Id, el2Id] = id.split(" > ")
        const el1 = /** @type {HTMLElement} */ (document.getElementById(el1Id))
        const el2 = /** @type {HTMLElement} */ (document.getElementById(el2Id))

        // Получаем актуальные координаты элементов в системе viewport
        const rectEl1 = this.getViewportBB(el1)
        const rectEl2 = this.getViewportBB(el2)

        // Преобразуем координаты viewport в координаты canvas
        const canvasSource = this.viewportToCanvasBB({
          x: rectEl1.x + rectEl1.width / 2,
          y: rectEl1.y + rectEl1.height / 2,
          width: rectEl1.width,
          height: rectEl1.height,
          scale: this.#state.scale,
          center: {
            x: rectEl1.x + rectEl1.width / 2,
            y: rectEl1.y + rectEl1.height / 2
          }
        })

        const canvasTarget = this.viewportToCanvasBB({
          x: rectEl2.x + rectEl2.width / 2,
          y: rectEl2.y + rectEl2.height / 2,
          width: rectEl2.width,
          height: rectEl2.height,
          scale: this.#state.scale,
          center: {
            x: rectEl2.x + rectEl2.width / 2,
            y: rectEl2.y + rectEl2.height / 2
          }
        })

        // Обновляем координаты edge
        edge.source.x = canvasSource.x
        edge.source.y = canvasSource.y
        edge.target.x = canvasTarget.x
        edge.target.y = canvasTarget.y
      }
      console.log("🔄 Обновление координат edges")
      this.canvas.draw()
    })
  }

  async connectedCallback() {
    // Инициализируем обработчики
    this.grid.setOptions(this.config.grid)
    this.dragHandler?.init()
    this.gestureHandler?.init()
    this.transformHandler?.init()

    // Обновляем трансформацию и отрисовываем сетку
    this.transformHandler?.updateTransform()
    this.grid.resize() // Добавляем явный вызов resize
    this.grid.draw(this.#state)
    this.canvas.draw()
    this.style.opacity = "1"
  }

  disconnectedCallback() {
    this.dragHandler?.destroy()
    this.gestureHandler?.destroy()
    this.transformHandler?.destroy()
  }

  /** @returns {QViewportState} */
  get state() {
    return {...this.#state}
  }

  /** @param {Partial<QViewportState>} newState */
  set state(newState) {
    this.#state = {...this.#state, ...newState}
    this.transformHandler.updateTransform()
    this.grid.draw(this.#state)
  }

  /**
   * Устанавливает абсолютную позицию viewport
   * @param {number} x - Позиция по X
   * @param {number} y - Позиция по Y
   */
  setPosition = (x, y) => (this.state = {translateX: x, translateY: y})

  /**
   * Добавляет новый элемент в контент viewport
   * @param {HTMLElement|DocumentFragment} element - Элемент для добавления
   * @returns {HTMLElement} Добавленный элемент
   * @throws {Error} Если контент не найден
   */
  addElement(element) {
    if (!this.content) throw new Error("Контент viewport не найден")
    return /** @type {HTMLElement} */ (this.content.appendChild(element))
  }

  /**
   * Получает размер в пикселях
   * @param {number} viewportSize - Размер viewport
   * @param {SizeValue} [value] - Значение размера
   * @returns {number} Размер в пикселях
   */
  #getSizeInPixels(viewportSize, value) {
    if (typeof value === "number") return value
    if (typeof value === "string") {
      const stringValue = /**@type {string} */ (value)
      if (stringValue.endsWith("%")) {
        const percentage = parseFloat(stringValue)
        return (viewportSize * percentage) / 100
      }
    }
    return 0
  }

  /**
   * Анимирует переход состояния
   * @param {QViewportState} startState - Начальное состояние
   * @param {QViewportState} endState - Конечное состояние
   * @param {number} duration - Длительность анимации
   * @param {string} [easing='ease-out'] - Функция плавности
   * @returns {Promise<void>}
   */
  async #animateState(startState, endState, duration, easing = "ease-out") {
    const startTime = performance.now()

    /**
     * Вычисляет прогресс анимации
     * @param {number} currentTime - Текущее время
     * @returns {number} Прогресс
     */
    const getProgress = currentTime => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Применяем функцию плавности
      switch (easing) {
        case "ease-out":
          return 1 - Math.pow(1 - progress, 2)
        case "ease-in":
          return progress * progress
        case "ease-in-out":
          return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
        default:
          return progress
      }
    }

    return new Promise(resolve => {
      /**
       * Функция для анимации
       * @param {number} currentTime - Текущее время
       */
      const animate = currentTime => {
        const progress = getProgress(currentTime)

        if (progress < 1) {
          // Интерполируем все значения состояния
          const scale = startState.scale + (endState.scale - startState.scale) * progress
          const translateX = startState.translateX + (endState.translateX - startState.translateX) * progress
          const translateY = startState.translateY + (endState.translateY - startState.translateY) * progress
          this.state = {scale, translateX, translateY}
          requestAnimationFrame(animate)
        } else {
          // Устанавливаем конечное состояние
          this.state = endState
          resolve()
        }
      }
      requestAnimationFrame(animate)
    })
  }

  /**
   * Центрирует viewport на указанном элементе с анимацией
   * @param {HTMLElement|Element} element - Элемент для центрирования
   * @param {QViewportCenterOptions} [options] - Опции центрирования
   * @returns {Promise<void>}
   */
  async centerOnElement(element, options = {}) {
    if (this.currentAnimation) {
      console.log("⏳ Предыдущая анимация в процессе, пропуск...")
      return
    }
    const {
      duration = DEFAULT_CONFIG.animation.duration,
      easing = DEFAULT_CONFIG.animation.easing,
      maxWidth,
      maxHeight,
      minWidth,
      minHeight
    } = options
    if (!element || !element.isConnected) {
      console.log("❌ Элемент не найден или не подключен")
      return
    }

    if (!this.content) throw new Error("Контент viewport не найден")

    const {scale, translateX, translateY, offset} = this.state

    const viewportRect = this.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()

    // Получаем текущую матрицу трансформации
    const contentStyle = window.getComputedStyle(this.content)
    const matrix = new DOMMatrix(contentStyle.transform)

    // Вычисляем реальные размеры элемента
    const elementRealWidth = elementRect.width / scale
    const elementRealHeight = elementRect.height / scale

    // Получаем координаты элемента относительно viewport
    const viewportX = elementRect.left - viewportRect.left
    const viewportY = elementRect.top - viewportRect.top

    // Используем метод класса напрямую
    const transformedPoint = this.transformPoint(viewportX, viewportY, matrix.inverse())
    const relativeX = transformedPoint.x
    const relativeY = transformedPoint.y

    // Вычисляем новый масштаб
    let newScale = scale
    const scaleFactors = []

    // Преобразуем все размеры в пиксели
    const maxWidthPx = this.#getSizeInPixels(viewportRect.width, maxWidth)
    const maxHeightPx = this.#getSizeInPixels(viewportRect.height, maxHeight)
    const minWidthPx = this.#getSizeInPixels(viewportRect.width, minWidth)
    const minHeightPx = this.#getSizeInPixels(viewportRect.height, minHeight)

    // Вычисляем масштаб на основе реальных размеров элемента
    if (maxWidthPx) scaleFactors.push(maxWidthPx / elementRealWidth)
    if (maxHeightPx) scaleFactors.push(maxHeightPx / elementRealHeight)
    if (minWidthPx) {
      const minScale = minWidthPx / elementRealWidth
      scaleFactors.push(Math.max(minScale, scale))
    }
    if (minHeightPx) {
      const minScale = minHeightPx / elementRealHeight
      scaleFactors.push(Math.max(minScale, scale))
    }

    // Если есть ограничения, применяем их
    if (scaleFactors.length > 0) {
      newScale = Math.min(...scaleFactors)
    } else {
      // Если нет ограничений, используем масштаб, который вписывает элемент в viewport
      const scaleX = (viewportRect.width * 0.8) / elementRealWidth // 80% от ширины viewport
      const scaleY = (viewportRect.height * 0.8) / elementRealHeight // 80% от высоты viewport
      newScale = Math.min(scaleX, scaleY)
    }
    // Вычисляем центр элемента
    const elementCenterX = relativeX + elementRealWidth / 2
    const elementCenterY = relativeY + elementRealHeight / 2

    // Вычисляем целевое смещение для центрирования
    const targetX = -(elementCenterX * newScale) + viewportRect.width / 2
    const targetY = -(elementCenterY * newScale) + viewportRect.height / 2

    const endState = {
      scale: newScale,
      translateX: targetX,
      translateY: targetY,
      offset: offset
    }
    // Сохраняем промис текущей анимации
    this.currentAnimation = this.#animateState({scale, translateX, translateY, offset}, endState, duration, easing)

    try {
      if (DEFAULT_CONFIG.debug) console.log("▶️ Запуск анимации")
      await this.currentAnimation
      if (DEFAULT_CONFIG.debug) console.log("✅ Анимация завершена")
    } finally {
      // Очищаем ссылку только если это та же анимация
      if (this.currentAnimation === this.currentAnimation) {
        this.currentAnimation = null
        if (DEFAULT_CONFIG.debug) console.log("🧹 Очистка ссылки на анимацию")
      }
    }
  }

  static get observedAttributes() {
    return ["debug"]
  }

  /**@type {(name: string, oldValue: string, newValue: string) => void} */
  attributeChangedCallback(name, _, newValue) {
    if (name === "debug") {
      this.debug = newValue === "true"
    }
  }

  get debug() {
    return this.#debug
  }

  set debug(value) {
    this.#debug = value
    this.canvas.debug = value
  }

  /**
   * Преобразует точку с использованием матрицы трансформации
   * @param {number} x - Координата X
   * @param {number} y - Координата Y
   * @param {DOMMatrix} matrix - Матрица трансформации
   * @returns {{ x: number, y: number }} Трансформированные координаты
   */
  transformPoint(x, y, matrix) {
    const point = new DOMPoint(x, y)
    const transformedPoint = point.matrixTransform(matrix)
    return {
      x: transformedPoint.x,
      y: transformedPoint.y
    }
  }

  /**
   * Получает координаты холста элемента
   * @param {HTMLElement} element - Элемент для получения координат
   * @param {"left" | "top" | "right" | "bottom" | "center"} [position="center"] - Край элемента
   * @returns {import('./types.ts').CanvasBB} Координаты холста элемента
   */
  getCanvasBB(element, position = "center") {
    if (!element || !element.isConnected) throw new Error("Элемент не найден или не подключен к DOM")
    const elementRect = element.getBoundingClientRect()
    const viewportRect = this.getBoundingClientRect()
    let x, y
    switch (position) {
      case "left":
        x = elementRect.left - viewportRect.left
        y = elementRect.top - viewportRect.top
        break
      case "top":
        x = elementRect.left - viewportRect.left
        y = elementRect.top - viewportRect.top
        break
      case "right":
        x = elementRect.right - viewportRect.right
        y = elementRect.top - viewportRect.top
        break
      case "bottom":
        x = elementRect.right - viewportRect.right
        y = elementRect.bottom - viewportRect.bottom
        break
      case "center":
        x = elementRect.left + elementRect.width / 2 - viewportRect.left
        y = elementRect.top + elementRect.height / 2 - viewportRect.top
        break
    }
    return {x, y, width: elementRect.width, height: elementRect.height}
  }

  /**
   * Получает координаты вьюпорта элемента
   * @param {HTMLElement} element - Элемент для получения координат
   * @returns {import('./types.ts').ViewportBB} Координаты вьюпорта элемента
   */
  getViewportBB(element) {
    if (!element || !element.isConnected) throw new Error("Элемент не найден или не подключен к DOM")

    const viewportRect = this.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()

    // Позиция элемента относительно viewport
    const viewportX = elementRect.left - viewportRect.left
    const viewportY = elementRect.top - viewportRect.top

    // Преобразуем в локальные координаты с учетом масштаба и смещения
    const x = (viewportX - this.#state.translateX) / this.#state.scale
    const y = (viewportY - this.#state.translateY) / this.#state.scale
    const width = elementRect.width / this.#state.scale
    const height = elementRect.height / this.#state.scale

    return {
      x,
      y,
      width,
      height,
      center: {
        x: x + width / 2,
        y: y + height / 2
      },
      scale: this.#state.scale
    }
  }

  /**
   * Преобразует координаты вьюпорта в координаты холста
   * @param {import('./types.ts').ViewportBB} viewportBB - Координаты вьюпорта
   * @returns {import('./types.ts').CanvasBB} Координаты холста
   */
  viewportToCanvasBB(viewportBB) {
    const viewportRect = this.getBoundingClientRect()

    const globalX = viewportBB.x * this.#state.scale + this.#state.translateX + viewportRect.left
    const globalY = viewportBB.y * this.#state.scale + this.#state.translateY + viewportRect.top
    const globalWidth = viewportBB.width * this.#state.scale
    const globalHeight = viewportBB.height * this.#state.scale

    return {
      x: globalX,
      y: globalY,
      width: globalWidth,
      height: globalHeight
    }
  }

  /**
   * Преобразует координаты холста в координаты вьюпорта
   * @param {import('./types.ts').CanvasBB} canvasBB - Координаты холста
   * @returns {import('./types.ts').ViewportBB} Координаты вьюпорта
   */
  canvasToViewportBB(canvasBB) {
    const viewportX = (canvasBB.x - this.#state.translateX) / this.#state.scale
    const viewportY = (canvasBB.y - this.#state.translateY) / this.#state.scale
    const viewportWidth = canvasBB.width / this.#state.scale
    const viewportHeight = canvasBB.height / this.#state.scale

    return {
      x: viewportX,
      y: viewportY,
      width: viewportWidth,
      height: viewportHeight,
      center: {
        x: viewportX + viewportWidth / 2,
        y: viewportY + viewportHeight / 2
      },
      scale: this.#state.scale
    }
  }
}

customElements.define("quantum-viewport", QuantumViewport)

Atom("q-viewport")
  .states("IDLE")
  .context(t => ({
    grid: t.boolean({title: "Показывать сетку", default: true})
  }))
  .collapses([])
  .core()
  .actions({})
  .view({
    mount: ({component}) => {
      console.log("mount", component)
    },
    render: ({html, context, update}) => html`
      <button @click=${() => update({grid: !context.grid})}>${context.grid ? "hide" : "show"} grid</button>
      <q-content></q-content>
      ${when(context.grid, () => html`<quantum-grid></quantum-grid>`)}
      <style>
        :host {
          --viewport-grid-size: 50;
          --viewport-grid-color: rgba(49, 49, 49, 0.325);
          --viewport-grid-line-width: 1;
          --viewport-grid-main-color: rgba(119, 118, 119, 0.1);
          --viewport-grid-main-line-width: 2;
        }
      </style>
    `, //prettier-ignore
    style: ({css}) => css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
        user-select: none;
        touch-action: none;
        -webkit-touch-callout: none;
        opacity: 1;
        transition: opacity 0.22s ease;
        overscroll-behavior: none;
        -webkit-overscroll-behavior: none;

        *,
        .viewport-content {
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }
      }
    `
  })
  .create({
    state: "IDLE"
  })
