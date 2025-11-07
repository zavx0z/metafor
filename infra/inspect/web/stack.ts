import { EM } from "@metafor/atom"

import { style } from "./stack.styled"
import "./control-panel"
import "./stack-table"
import type { ControlPanel } from "./control-panel.t"
import type { StackTable } from "./stack-table.t"
import type { Impulse } from "@metafor/atom"

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
  private currentPosition = "bottom"
  private readonly STORAGE_KEY = "metafor-stack-height"
  private readonly OPACITY_KEY = "metafor-stack-opacity"
  private readonly POSITION_KEY = "metafor-stack-position"
  private readonly STEP_DELAY_KEY = "metafor-step-delay"
  private stepDelay = 0
  private stepIntervalId: ReturnType<typeof setInterval> | null = null
  private off: () => void
  #shadow: ShadowRoot | null = null

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "open" })
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync(style)
    this.#shadow.adoptedStyleSheets = [styleSheet]
    // EM.lock = true
    const off = EM.onChangeStack((stack: Impulse[]) => this.render(stack))
    this.off = off

    // Создаем компоненты
    this.controlPanel = document.createElement("control-panel") as ControlPanel
    this.stackTable = document.createElement("stack-table") as StackTable

    // Создаем handle для изменения размера
    this.resizeHandle = document.createElement("div")
    this.resizeHandle.className = "resize-handle"
    this.resizeHandle.style.position = "absolute"
    this.resizeHandle.style.zIndex = "1001"
    // this.resizeHandle.style.backgroundColor = "rgba(255, 255, 255, 0.3)"
    this.resizeHandle.style.cursor = "ns-resize"

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

    // Загружаем позицию (если есть сохраненная) или устанавливаем по умолчанию
    this.loadPosition()

    // Загружаем таймаут замедления
    this.loadStepDelay()

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
          this.stackTable.style.setProperty("--panel-opacity", opacity.toString())
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

  private loadPosition() {
    try {
      const savedPosition = localStorage.getItem(this.POSITION_KEY)
      const position = savedPosition || "bottom"
      this.controlPanel.setPosition(position)
      this.setPosition(position)
    } catch (error) {
      console.warn("Failed to load stack position from localStorage:", error)
      // Устанавливаем позицию по умолчанию в случае ошибки
      this.controlPanel.setPosition("bottom")
      this.setPosition("bottom")
    }
  }

  private savePosition(position: string) {
    try {
      localStorage.setItem(this.POSITION_KEY, position)
    } catch (error) {
      console.warn("Failed to save stack position to localStorage:", error)
    }
  }

  private loadStepDelay() {
    try {
      const savedDelay = localStorage.getItem(this.STEP_DELAY_KEY)
      if (savedDelay) {
        const delay = parseInt(savedDelay, 10)
        if (delay >= 0 && delay <= 5000) {
          this.stepDelay = delay
          // Обновляем значение в control-panel
          const stepDelaySlider = this.controlPanel.shadowRoot?.querySelector(
            ".step-delay-slider"
          ) as HTMLInputElement
          const stepDelayValue = this.controlPanel.shadowRoot?.querySelector(
            ".step-delay-value"
          ) as HTMLElement
          if (stepDelaySlider) {
            stepDelaySlider.value = delay.toString()
          }
          if (stepDelayValue) {
            stepDelayValue.textContent = delay === 0 ? "0 мс" : `${delay} мс`
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load step delay from localStorage:", error)
    }
  }

  private saveStepDelay(delay: number) {
    try {
      localStorage.setItem(this.STEP_DELAY_KEY, delay.toString())
    } catch (error) {
      console.warn("Failed to save step delay to localStorage:", error)
    }
  }

  private startAutoStep() {
    // Останавливаем предыдущий интервал, если он был запущен
    this.stopAutoStep()

    // Запускаем автоматический step с задержкой
    this.stepIntervalId = setInterval(() => {
      // Проверяем, что система заблокирована и замедление включено
      import("@metafor/atom").then(({ Atom }) => {
        if (Atom.isLocked && this.stepDelay > 0) {
          EM.step()
        } else {
          // Если система разблокирована или замедление отключено, останавливаем
          this.stopAutoStep()
          // Если система разблокирована, обновляем состояние кнопки
          if (!Atom.isLocked) {
            this.controlPanel.setPlayState(true)
          }
        }
      })
    }, this.stepDelay)
  }

  private stopAutoStep() {
    if (this.stepIntervalId !== null) {
      clearInterval(this.stepIntervalId)
      this.stepIntervalId = null
    }
  }

  private setPosition(position: string) {
    // Сохраняем текущую позицию
    this.currentPosition = position

    // Удаляем все классы позиции
    this.classList.remove("position-bottom", "position-top", "position-left", "position-right")

    // Добавляем новый класс позиции
    this.classList.add(`position-${position}`)

    // Применяем стили напрямую через inline стили
    this.applyPositionStyles(position)
  }

  private applyPositionStyles(position: string) {
    // Сбрасываем все позиционные стили
    this.style.top = ""
    this.style.bottom = ""
    this.style.left = ""
    this.style.right = ""
    this.style.width = ""
    this.style.height = ""
    this.style.flexDirection = ""

    switch (position) {
      case "top":
        this.style.top = "0"
        this.style.bottom = "auto"
        this.style.left = "0"
        this.style.right = "0"
        this.style.height = `${this.panelHeight}px`
        this.style.width = "auto"
        this.style.flexDirection = "column"
        this.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.3)"
        // Настраиваем resize handle для верхней позиции (снизу от панели)
        this.resizeHandle.style.top = "auto"
        this.resizeHandle.style.left = "0"
        this.resizeHandle.style.right = "0"
        this.resizeHandle.style.bottom = "0"
        this.resizeHandle.style.width = "auto"
        this.resizeHandle.style.height = "4px"
        this.resizeHandle.style.cursor = "ns-resize"
        // this.resizeHandle.style.backgroundColor = "rgba(255, 255, 255, 0.3)"
        // Адаптируем ControlPanel для горизонтального layout
        this.controlPanel.setAttribute("data-layout", "horizontal")
        // Адаптируем StackTable для вертикального layout
        this.stackTable.setAttribute("data-layout", "vertical")
        break
      case "left":
        this.style.left = "0"
        this.style.right = "auto"
        this.style.top = "0"
        this.style.bottom = "0"
        this.style.width = `${this.panelHeight}px`
        this.style.height = "auto"
        this.style.flexDirection = "column"
        this.style.boxShadow = "4px 0 20px rgba(0, 0, 0, 0.3)"
        // Настраиваем resize handle для левой позиции (справа от панели)
        this.resizeHandle.style.top = "0"
        this.resizeHandle.style.right = "0"
        this.resizeHandle.style.left = "auto"
        this.resizeHandle.style.bottom = "0"
        this.resizeHandle.style.width = "4px"
        this.resizeHandle.style.height = "auto"
        this.resizeHandle.style.cursor = "ew-resize"
        // this.resizeHandle.style.backgroundColor = "rgba(255, 255, 255, 0.3)"
        // Адаптируем ControlPanel для вертикального layout
        this.controlPanel.setAttribute("data-layout", "vertical")
        // Адаптируем StackTable для вертикального layout
        this.stackTable.setAttribute("data-layout", "vertical")
        break
      case "right":
        this.style.right = "0"
        this.style.left = "auto"
        this.style.top = "0"
        this.style.bottom = "0"
        this.style.width = `${this.panelHeight}px`
        this.style.height = "auto"
        this.style.flexDirection = "column"
        this.style.boxShadow = "-4px 0 20px rgba(0, 0, 0, 0.3)"
        // Настраиваем resize handle для правой позиции (слева от панели)
        this.resizeHandle.style.top = "0"
        this.resizeHandle.style.left = "0"
        this.resizeHandle.style.right = "auto"
        this.resizeHandle.style.bottom = "0"
        this.resizeHandle.style.width = "4px"
        this.resizeHandle.style.height = "auto"
        this.resizeHandle.style.cursor = "ew-resize"
        // this.resizeHandle.style.backgroundColor = "rgba(255, 255, 255, 0.3)"
        // Адаптируем ControlPanel для вертикального layout
        this.controlPanel.setAttribute("data-layout", "vertical")
        // Адаптируем StackTable для вертикального layout
        this.stackTable.setAttribute("data-layout", "vertical")
        break
      case "bottom":
      default:
        this.style.bottom = "0"
        this.style.top = "auto"
        this.style.left = "0"
        this.style.right = "0"
        this.style.height = `${this.panelHeight}px`
        this.style.width = "auto"
        this.style.flexDirection = "column"
        this.style.boxShadow = "0 -4px 20px rgba(0, 0, 0, 0.3)"
        // Настраиваем resize handle для нижней позиции (сверху от панели)
        this.resizeHandle.style.top = "0"
        this.resizeHandle.style.left = "0"
        this.resizeHandle.style.right = "0"
        this.resizeHandle.style.bottom = "auto"
        this.resizeHandle.style.width = "auto"
        this.resizeHandle.style.height = "4px"
        this.resizeHandle.style.cursor = "ns-resize"
        // this.resizeHandle.style.backgroundColor = "rgba(255, 255, 255, 0.3)"
        // Адаптируем ControlPanel для горизонтального layout
        this.controlPanel.setAttribute("data-layout", "horizontal")
        // Адаптируем StackTable для вертикального layout
        this.stackTable.setAttribute("data-layout", "vertical")
        break
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
      this.stackTable.style.setProperty("--panel-opacity", customEvent.detail.value)
      this.saveOpacity(customEvent.detail.value)
    })

    // Обработчик изменения позиции
    this.controlPanel.addEventListener("position-change", (e: Event) => {
      const customEvent = e as CustomEvent
      this.setPosition(customEvent.detail.value)
      this.savePosition(customEvent.detail.value)
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

    // Обработчик изменения таймаута замедления
    this.controlPanel.addEventListener("step-delay-change", (e: Event) => {
      const customEvent = e as CustomEvent
      this.stepDelay = customEvent.detail.value
      this.saveStepDelay(this.stepDelay)
      // Если замедление отключено, останавливаем автоматический step
      if (this.stepDelay === 0) {
        this.stopAutoStep()
      } else if (this.stepIntervalId !== null) {
        // Если автоматический step уже запущен, перезапускаем с новым таймаутом
        this.startAutoStep()
      }
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

    // console.log("Toggle collapse:", this.isCollapsed, "Position:", this.currentPosition)

    // Обновляем состояние панели управления
    this.controlPanel.setCollapsed(this.isCollapsed)

    // Сворачивание работает только для верхних и нижних позиций
    if (this.currentPosition === "left" || this.currentPosition === "right") {
      // console.log("Collapse not supported for side positions")
      this.isAnimating = false
      return
    }

    if (this.isCollapsed) {
      // Добавляем класс для сворачивания
      this.classList.add("collapsed")
      // console.log("Added collapsed class, classes:", this.className)

      // Принудительно устанавливаем размер для сворачивания
      this.style.height = "32px"
      this.style.width = "100vw"

      // Скрываем содержимое
      this.stackTable.style.display = "none"
      this.resizeHandle.style.display = "none"
    } else {
      // Убираем класс сворачивания
      this.classList.remove("collapsed")
      // console.log("Removed collapsed class, classes:", this.className)

      // Восстанавливаем размер панели
      this.style.setProperty("--panel-height", this.panelHeight.toString())

      // Принудительно восстанавливаем размер
      this.style.height = `${this.panelHeight}px`
      this.style.width = "100vw"

      // Показываем содержимое
      this.stackTable.style.display = "block"
      this.resizeHandle.style.display = "block"
    }

    // Сбрасываем флаг анимации после завершения анимации
    setTimeout(() => {
      this.isAnimating = false
    }, 300)
  }

  private handlePlayClick() {
    // Импортируем Atom динамически, чтобы избежать циклических зависимостей
    import("@metafor/atom").then(({ Atom }) => {
      if (Atom.isLocked) {
        // Если установлен таймаут замедления, запускаем автоматический step
        // Система остается заблокированной, но автоматически выполняет шаги
        if (this.stepDelay > 0) {
          this.startAutoStep()
          this.controlPanel.setPlayState(true)
        } else {
          // Если замедление не установлено, возобновляем выполнение нормально
          EM.resume()
          this.controlPanel.setPlayState(true)
        }
      } else {
        // Ставим на паузу
        EM.break()
        this.controlPanel.setPlayState(false)
        // Останавливаем автоматический step
        this.stopAutoStep()
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

    // Получаем текущую позицию для правильного курсора
    if (this.currentPosition === "left" || this.currentPosition === "right") {
      this.startY = e.clientX // Для боковых позиций используем clientX
      this.resizeHandle.style.cursor = "ew-resize"
      document.body.style.cursor = "ew-resize"
    } else {
      this.startY = e.clientY // Для вертикальных позиций используем clientY
      this.resizeHandle.style.cursor = "ns-resize"
      document.body.style.cursor = "ns-resize"
    }

    this.startHeight = this.panelHeight
    e.preventDefault()
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isResizing) return

    // Получаем текущую позицию
    if (this.currentPosition === "left" || this.currentPosition === "right") {
      // Для боковых позиций изменяем ширину
      const deltaX = e.clientX - this.startY // startY теперь содержит clientX
      const maxWidth = window.innerWidth * 0.9 // 90% от ширины экрана

      let newWidth
      if (this.currentPosition === "left") {
        // Для левой позиции: тянем вправо = увеличиваем ширину
        newWidth = Math.max(100, Math.min(maxWidth, this.startHeight + deltaX))
      } else {
        // Для правой позиции: тянем влево = увеличиваем ширину (инвертируем)
        newWidth = Math.max(100, Math.min(maxWidth, this.startHeight - deltaX))
      }

      this.panelHeight = newWidth
      this.style.setProperty("--panel-height", newWidth.toString())

      // Обновляем ширину напрямую для боковых позиций
      this.style.width = `${newWidth}px`
    } else {
      // Для верхней и нижней позиций изменяем высоту
      const deltaY = e.clientY - this.startY // startY теперь содержит clientY
      const maxHeight = window.innerHeight * 0.9 // 90% от высоты экрана

      let newHeight
      if (this.currentPosition === "top") {
        // Для верхней позиции: тянем вниз = увеличиваем высоту
        newHeight = Math.max(100, Math.min(maxHeight, this.startHeight + deltaY))
      } else {
        // Для нижней позиции: тянем вверх = увеличиваем высоту (инвертируем)
        newHeight = Math.max(100, Math.min(maxHeight, this.startHeight - deltaY))
      }

      this.panelHeight = newHeight
      this.style.setProperty("--panel-height", newHeight.toString())

      // Обновляем высоту напрямую для верхних/нижних позиций
      this.style.height = `${newHeight}px`
    }

    // Плавная анимация изменения размера
    this.style.transition = "none" // Отключаем transition во время перетаскивания
  }

  private handleMouseUp() {
    this.isResizing = false

    // Получаем текущую позицию для правильного курсора
    if (this.currentPosition === "left" || this.currentPosition === "right") {
      this.resizeHandle.style.cursor = "ew-resize"
    } else {
      this.resizeHandle.style.cursor = "ns-resize"
    }

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
    this.stopAutoStep()
  }
}

customElements.get("metafor-stack") ?? customElements.define("metafor-stack", Stack)
