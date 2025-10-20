import { EM } from "@metafor/atom"
import { type Impulse } from "@metafor/atom"
import { style } from "./stack.styled"
import "./control-panel"
import "./stack-table"
import type { ControlPanel } from "./control-panel.t"
import type { StackTable } from "./stack-table.t"

export class Stack extends HTMLElement {
  private controlPanel: ControlPanel
  private stackTable: StackTable
  private resizeHandle: HTMLDivElement
  private isCollapsed = false
  private isAnimating = false
  private panelHeight = 300
  private isResizing = false
  private startY = 0
  private startHeight = 0
  private readonly STORAGE_KEY = "metafor-stack-height"
  private readonly OPACITY_KEY = "metafor-stack-opacity"
  private off: () => void
  #shadow: ShadowRoot | null = null

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "open" })
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync(style)
    this.#shadow.adoptedStyleSheets = [styleSheet]

    const off = EM.onChangeStack((stack) => this.render(stack))
    this.off = off

    // Создаем компоненты
    this.controlPanel = document.createElement("control-panel") as ControlPanel
    this.stackTable = document.createElement("stack-table") as StackTable

    // Создаем handle для изменения размера
    this.resizeHandle = document.createElement("div")
    this.resizeHandle.className = "resize-handle"

    // Добавляем элементы в shadow root
    this.#shadow!.appendChild(this.controlPanel)
    this.#shadow!.appendChild(this.stackTable)
    this.#shadow!.appendChild(this.resizeHandle)

    // Загружаем сохраненные настройки
    this.loadHeight()
    this.loadOpacity()

    // Инициализируем CSS переменные
    this.style.setProperty("--panel-height", this.panelHeight.toString())
    // Прозрачность будет установлена в loadOpacity() если есть сохраненное значение
    if (!localStorage.getItem(this.OPACITY_KEY)) {
      this.style.setProperty("--panel-opacity", "0.9")
    }

    this.setupResizeHandlers()
    this.setupControlHandlers()
    this.setupAnimationHandlers()

    // Инициализируем состояние кнопки "шаг вперёд"
    import("@metafor/atom").then(({ Atom }) => {
      this.controlPanel.setStepDisabled(!Atom.isLocked)
    })
  }
  connectedCallback() {
    // Плавное появление панели
    this.style.opacity = "0"
    this.style.transform = "translateY(20px)"
    this.style.transition = "opacity 0.3s ease, transform 0.3s ease"

    // Запускаем анимацию появления
    requestAnimationFrame(() => {
      this.style.opacity = "1"
      this.style.transform = "translateY(0)"
    })
  }

  private loadHeight() {
    try {
      const savedHeight = localStorage.getItem(this.STORAGE_KEY)
      if (savedHeight) {
        const height = parseInt(savedHeight, 10)
        const maxHeight = window.innerHeight * 0.9
        const minHeight = 100

        // Проверяем, что сохраненная высота в допустимых пределах
        if (height >= minHeight && height <= maxHeight) {
          this.panelHeight = height
        }
      }
    } catch (error) {
      console.warn("Failed to load stack height from localStorage:", error)
    }
  }

  private saveHeight() {
    try {
      localStorage.setItem(this.STORAGE_KEY, this.panelHeight.toString())
    } catch (error) {
      console.warn("Failed to save stack height to localStorage:", error)
    }
  }

  private loadOpacity() {
    try {
      const savedOpacity = localStorage.getItem(this.OPACITY_KEY)
      if (savedOpacity) {
        const opacity = parseFloat(savedOpacity)
        if (opacity >= 0.1 && opacity <= 1) {
          this.controlPanel.setOpacity(opacity.toString())
          this.style.setProperty("--panel-opacity", opacity.toString())
        }
      }
    } catch (error) {
      console.warn("Failed to load stack opacity from localStorage:", error)
    }
  }

  private saveOpacity(opacity: string) {
    try {
      localStorage.setItem(this.OPACITY_KEY, opacity)
    } catch (error) {
      console.warn("Failed to save stack opacity to localStorage:", error)
    }
  }

  private setupResizeHandlers() {
    this.resizeHandle.addEventListener("mousedown", this.handleMouseDown.bind(this))
    this.resizeHandle.addEventListener("dblclick", this.handleDoubleClick.bind(this))
    document.addEventListener("mousemove", this.handleMouseMove.bind(this))
    document.addEventListener("mouseup", this.handleMouseUp.bind(this))
    window.addEventListener("resize", this.handleWindowResize.bind(this))
  }

  private setupControlHandlers() {
    // Обработчик ползунка прозрачности
    this.controlPanel.addEventListener("opacity-change", (e: Event) => {
      const customEvent = e as CustomEvent
      this.style.setProperty("--panel-opacity", customEvent.detail.value)
      this.saveOpacity(customEvent.detail.value)
    })

    // Обработчик кнопки свернуть
    this.controlPanel.addEventListener("collapse-toggle", () => {
      this.toggleCollapse()
    })

    // Обработчики кнопок управления дебагом
    this.controlPanel.addEventListener("play-toggle", () => {
      this.handlePlayClick()
    })

    this.controlPanel.addEventListener("step", () => {
      this.handleStepClick()
    })

    // Обработчик кнопки очистки стека
    this.controlPanel.addEventListener("clear", () => {
      this.handleClearClick()
    })
  }

  private setupAnimationHandlers() {
    // Обработчик завершения анимации
    this.addEventListener("transitionend", (e) => {
      if (e.propertyName === "height") {
        // Восстанавливаем стандартные transition после завершения анимации высоты
        this.style.transition = "opacity 0.3s ease, transform 0.3s ease"
      }
    })
  }

  private toggleCollapse() {
    // Предотвращаем множественные клики во время анимации
    if (this.isAnimating) return

    this.isAnimating = true
    this.isCollapsed = !this.isCollapsed

    // Обновляем состояние панели управления
    this.controlPanel.setCollapsed(this.isCollapsed)

    if (this.isCollapsed) {
      // Добавляем класс для оптимизации сворачивания
      this.classList.add("collapsing")
      this.stackTable.classList.add("collapsing")

      // Скрываем содержимое сразу для быстрого сворачивания
      this.stackTable.setVisible(false)
      // Скрываем resize handle только если панель полностью сворачивается
      if (this.panelHeight <= 32) {
        this.resizeHandle.style.display = "none"
      }

      // Плавно сворачиваем
      this.style.transition = "height 0.3s ease"
      this.style.setProperty("--panel-height", "32px")

      // Сбрасываем флаг анимации и убираем класс после завершения
      setTimeout(() => {
        this.classList.remove("collapsing")
        this.stackTable.classList.remove("collapsing")
        this.isAnimating = false
      }, 300)
    } else {
      // Добавляем класс для оптимизации разворачивания
      this.classList.add("collapsing")
      this.stackTable.classList.add("collapsing")

      // Показываем содержимое
      this.stackTable.setVisible(true)
      this.resizeHandle.style.display = "block"

      // Плавно разворачиваем
      this.style.transition = "height 0.3s ease"
      this.style.setProperty("--panel-height", this.panelHeight.toString())

      // Сбрасываем флаг анимации и убираем класс после завершения разворачивания
      setTimeout(() => {
        this.classList.remove("collapsing")
        this.stackTable.classList.remove("collapsing")
        this.isAnimating = false
      }, 300)
    }
  }

  private handlePlayClick() {
    // Импортируем Atom динамически, чтобы избежать циклических зависимостей
    import("@metafor/atom").then(({ Atom }) => {
      if (Atom.isLocked) {
        // @ts-expect-error
        Atom.play()
        this.controlPanel.setPlayState(true)
      } else {
        // @ts-expect-error
        Atom.pause()
        this.controlPanel.setPlayState(false)
      }
      // Обновляем состояние кнопки "шаг вперёд"
      this.controlPanel.setStepDisabled(!Atom.isLocked)
    })
  }

  private handleStepClick() {
    EM.step()
  }

  private handleClearClick() {
    // Очищаем все данные
    this.stackTable.clear()
  }

  private handleDoubleClick() {
    // Переключаем между минимальной и максимальной высотой
    const maxHeight = window.innerHeight * 0.9
    if (this.panelHeight < maxHeight * 0.5) {
      this.panelHeight = maxHeight
    } else {
      this.panelHeight = 300
    }

    // Плавная анимация изменения размера
    this.style.transition = "height 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
    this.style.setProperty("--panel-height", this.panelHeight.toString())

    // Сохраняем новую высоту
    this.saveHeight()
  }

  private handleWindowResize() {
    // Проверяем, не превышает ли текущая высота новый лимит
    const maxHeight = window.innerHeight * 0.9
    if (this.panelHeight > maxHeight) {
      this.panelHeight = maxHeight

      // Плавная анимация корректировки размера
      this.style.transition = "height 0.3s ease"
      this.style.setProperty("--panel-height", this.panelHeight.toString())

      // Сохраняем скорректированную высоту
      this.saveHeight()
    }
  }

  private handleMouseDown(e: MouseEvent) {
    this.isResizing = true
    this.startY = e.clientY
    this.startHeight = this.panelHeight
    this.resizeHandle.style.cursor = "ns-resize"
    document.body.style.cursor = "ns-resize"
    e.preventDefault()
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isResizing) return

    const deltaY = this.startY - e.clientY // Инвертируем для интуитивного поведения
    const maxHeight = window.innerHeight * 0.9 // 90% от высоты экрана
    const newHeight = Math.max(100, Math.min(maxHeight, this.startHeight + deltaY))

    this.panelHeight = newHeight
    this.style.setProperty("--panel-height", newHeight.toString())

    // Плавная анимация изменения размера
    this.style.transition = "none" // Отключаем transition во время перетаскивания
  }

  private handleMouseUp() {
    this.isResizing = false
    this.resizeHandle.style.cursor = "ns-resize"
    document.body.style.cursor = ""

    // Восстанавливаем transition для плавных анимаций только если панель не анимируется
    if (!this.isAnimating) {
      this.style.transition = "opacity 0.3s ease, transform 0.3s ease, height 0.2s ease"
    }

    // Сохраняем высоту после завершения перетаскивания
    this.saveHeight()
  }
  public render(currentStack: Impulse[]) {
    this.stackTable.render(currentStack)
  }

  disconnectedCallback() {
    this.off?.()
  }
}

customElements.get("metafor-stack") ?? customElements.define("metafor-stack", Stack)
