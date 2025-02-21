import {Atom} from "../../machine/atom.js"
import {getUniqueSelector} from "../../core/utils/selectors.js"

Atom("viewport-drag-handler")
  .states("ОЖИДАНИЕ", "ПЕРЕТАСКИВАНИЕ")
  .context(t => ({
    mouseButton: t.enum("left", "middle", "right", "back", "forward")({title: "Нажатая кнопка мыши", nullable: true}),
    target: t.string({title: "Селектор целевого элемента", nullable: true})
  }))
  .collapses([
    {
      from: "ОЖИДАНИЕ",
      action: "addEventListeners",
      to: [{state: "ПЕРЕТАСКИВАНИЕ", trigger: {mouseButton: "left"}}]
    },
    {
      from: "ПЕРЕТАСКИВАНИЕ",
      to: [{state: "ОЖИДАНИЕ", trigger: {mouseButton: {isNull: true}}}]
    }
  ])
  .core(({update}) => ({
    handleMouseDown(/** @type {MouseEvent} */ e) {
      let /** @type {"left" | "middle" | "right" | "back" | "forward" | null} */ mouseButton = null
      if (e.button === 0) mouseButton = "left"
      else if (e.button === 1) mouseButton = "middle"
      else if (e.button === 2) mouseButton = "right"
      else if (e.button === 3) mouseButton = "back"
      else if (e.button === 4) mouseButton = "forward"
      const target = getUniqueSelector(/** @type {Element} */ (e.target), this.viewport)
      update({mouseButton, target})
    },
    handleMouseUp: () => update({mouseButton: null, target: null}),
    viewport: document.querySelector("quantum-viewport")
  }))
  .actions({
    addEventListeners({core, update}) {
      document.addEventListener("mousedown", core.handleMouseDown)
      document.addEventListener("mouseup", core.handleMouseUp)
    }
  })
  .reactions([])
  .create({
    state: "ОЖИДАНИЕ",
    onCollapse: (oldState, newState, atom) => {
      console.log(atom.id, oldState, "->", newState, atom.context)
    }
  })

/** Обработчик перетаскивания для viewport */
export default class ViewportDragHandler {
  /**
   * @param {import('../viewport.js').QuantumViewport} viewport - Экземпляр viewport
   * @param {QViewportConfig} config - Конфигурация viewport
   */
  constructor(viewport, config) {
    this.viewport = viewport
    this.config = config

    /** @type {boolean} */ this.isSpacePressed = false
    /** @type {boolean} */ this.isDragging = false
    /** @type {boolean} */ this.isViewportClick = false
    /** @type {number} */ this.lastX = 0
    /** @type {number} */ this.lastY = 0

    /** @type {QViewportDragState} */
    this.dragState = {
      element: null,
      startX: 0,
      startY: 0,
      elementX: 0,
      elementY: 0
    }

    // Привязываем методы
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleMouseDown = this.handleMouseDown.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleMouseUp = this.handleMouseUp.bind(this)
    this.handleDragStart = this.handleDragStart.bind(this)
    this.handleDragMove = this.handleDragMove.bind(this)
    this.handleDragEnd = this.handleDragEnd.bind(this)
  }

  /**
   * Обработчик нажатия клавиш
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    if (e.code === "Space" && !this.isSpacePressed) {
      e.preventDefault()
      this.isSpacePressed = true
      this.viewport.style.cursor = "grab"
    }
  }

  /**
   * Обработчик отпускания клавиш
   * @param {KeyboardEvent} e
   */
  handleKeyUp(e) {
    if (e.code === "Space") {
      this.isSpacePressed = false
      this.viewport.style.cursor = "default"
    }
  }

  /**
   * Обработчик нажатия мыши
   * @param {MouseEvent} e
   */
  handleMouseDown(e) {
    const target = /** @type {Element} */ (e.target)
    this.isViewportClick =
      target instanceof HTMLElement && (target === this.viewport || target.classList.contains("grid"))

    if (this.isViewportClick) {
      if (this.isSpacePressed || e.button === 1 || e.button === 0) {
        e.preventDefault()
        this.isDragging = true
        this.lastX = e.clientX
        this.lastY = e.clientY
        this.viewport.style.cursor = "grabbing"
        document.body.classList.add("viewport-dragging")
      }
    }
  }

  /**
   * Обработчик движения мыши
   * @param {MouseEvent} e
   */
  handleMouseMove(e) {
    if (!this.isDragging || !this.isViewportClick) return
    this.viewport.state = {
      translateX: this.viewport.state.translateX + /**@type {number} - 𝚫x */ (e.clientX - this.lastX),
      translateY: this.viewport.state.translateY + /**@type {number} - 𝚫y */ (e.clientY - this.lastY)
    }
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.viewport.transformHandler.updateTransform()
  }

  /** Обработчик отпускания мыши */
  handleMouseUp() {
    if (this.isDragging && this.isViewportClick) {
      this.isDragging = false
      this.isViewportClick = false
      this.viewport.style.cursor = this.isSpacePressed ? "grab" : "default"
      document.body.classList.remove("viewport-dragging")
    }
  }

  /**
   * Обработчик начала перетаскивания
   * @param {MouseEvent} e
   */
  handleDragStart(e) {
    e.stopPropagation()
    const target = /** @type {Element} */ (e.target)
    const dragHandle = target.closest("[data-drag-selector]")
    if (!(dragHandle instanceof HTMLElement)) return

    const selector = dragHandle.dataset.dragSelector
    if (!selector) return

    const element = dragHandle.closest(selector)
    if (!element) return

    // Получаем текущую трансформацию
    const transform = getComputedStyle(element).transform
    const matrix = new DOMMatrix(transform)
    this.dragState = {
      element: /** @type {HTMLElement} */ (element),
      startX: e.clientX,
      startY: e.clientY,
      elementX: matrix.m41, // Текущее смещение по X
      elementY: matrix.m42 // Текущее смещение по Y
    }

    document.addEventListener("mousemove", this.handleDragMove)
    document.addEventListener("mouseup", this.handleDragEnd)
  }

  /**
   * Обработчик перемещения при перетаскивании
   * @param {MouseEvent} e
   */
  handleDragMove(e) {
    if (!this.dragState.element) return
    const scale = this.viewport.state.scale
    // Вычисляем дельту с учетом начальной позиции
    const deltaX = (e.clientX - this.dragState.startX) / scale
    const deltaY = (e.clientY - this.dragState.startY) / scale
    // Применяем смещение к текущей позиции
    const x = this.dragState.elementX + deltaX
    const y = this.dragState.elementY + deltaY
    this.dragState.element.style.transform = `translate(${x}px, ${y}px)`
  }

  /** Обработчик окончания перетаскивания */
  handleDragEnd() {
    if (this.dragState.element) {
      document.removeEventListener("mousemove", this.handleDragMove)
      document.removeEventListener("mouseup", this.handleDragEnd)
      this.dragState.element = null
    }
  }

  /** Очистка обработчика перетаскивания */
  destroy() {
    // Удаляем все слушатели событий
    this.viewport.removeEventListener("mousedown", this.handleMouseDown)
    this.viewport.removeEventListener("mousemove", this.handleMouseMove)
    this.viewport.removeEventListener("mouseup", this.handleMouseUp)
    this.viewport.removeEventListener("mouseleave", this.handleMouseUp)
    document.removeEventListener("keydown", this.handleKeyDown)
    document.removeEventListener("keyup", this.handleKeyUp)
  }

  /** Инициализация обработчиков событий */
  init() {
    // Слушаем mousedown на viewport для всех элементов
    this.viewport.addEventListener("mousedown", e => {
      const target = /** @type {Element} */ (e.target)
      const dragHandle = target.closest("[data-drag-selector]")
      dragHandle ? this.handleDragStart(e) : this.handleMouseDown(e)
    })

    document.addEventListener("mousemove", this.handleMouseMove)
    document.addEventListener("mouseup", this.handleMouseUp)
    document.addEventListener("mouseleave", this.handleMouseUp)
    document.addEventListener("keydown", this.handleKeyDown)
    document.addEventListener("keyup", this.handleKeyUp)
  }
}
