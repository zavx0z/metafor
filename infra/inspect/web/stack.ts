import { EM } from "@metafor/atom"
import { type Impulse } from "@metafor/atom"
import { style } from "./stack.styled"

export class Stack extends HTMLElement {
  private ul: HTMLUListElement
  private resizeHandle: HTMLDivElement
  private controlPanel: HTMLDivElement
  private opacitySlider: HTMLInputElement
  private collapseBtn: HTMLButtonElement
  private playBtn: HTMLButtonElement
  private stepBtn: HTMLButtonElement
  private clearBtn: HTMLButtonElement
  private isCollapsed = false
  private isAnimating = false
  impulseSet = new Set<Impulse>()
  private displayedImpulses = new Map<Impulse, HTMLLIElement>() // Карта импульсов к DOM элементам
  private maxImpulses = 100 // Максимальное количество импульсов для отображения
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

    // Создаем панель управления
    this.controlPanel = document.createElement("div")
    this.controlPanel.className = "control-panel"

    // Создаем ползунок прозрачности
    this.opacitySlider = document.createElement("input")
    this.opacitySlider.type = "range"
    this.opacitySlider.min = "0.1"
    this.opacitySlider.max = "1"
    this.opacitySlider.step = "0.1"
    this.opacitySlider.value = "0.9"
    this.opacitySlider.className = "opacity-slider"
    this.opacitySlider.title = "Прозрачность панели"

    // Создаем кнопку свернуть
    this.collapseBtn = document.createElement("button")
    this.collapseBtn.className = "collapse-btn"
    this.collapseBtn.innerHTML = "▼"
    this.collapseBtn.title = "Свернуть/развернуть панель"

    // Создаем кнопки управления дебагом
    this.playBtn = document.createElement("button")
    this.playBtn.className = "debug-btn"
    this.playBtn.innerHTML = "▶"
    this.playBtn.title = "Пуск/Пауза"

    this.stepBtn = document.createElement("button")
    this.stepBtn.className = "debug-btn"
    this.stepBtn.innerHTML = "⏭"
    this.stepBtn.title = "Шаг вперёд"

    // Создаем кнопку очистки стека
    this.clearBtn = document.createElement("button")
    this.clearBtn.className = "clear-btn"
    this.clearBtn.innerHTML = "🗑"
    this.clearBtn.title = "Очистить стек"

    // Создаем левую группу (корзина + слайдер)
    const leftGroup = document.createElement("div")
    leftGroup.className = "left-group"
    leftGroup.appendChild(this.clearBtn)
    leftGroup.appendChild(this.opacitySlider)

    // Создаем центральную группу (кнопки дебага)
    const centerGroup = document.createElement("div")
    centerGroup.className = "center-group"
    centerGroup.appendChild(this.playBtn)
    centerGroup.appendChild(this.stepBtn)

    this.controlPanel.appendChild(leftGroup)
    this.controlPanel.appendChild(centerGroup)
    this.controlPanel.appendChild(this.collapseBtn)
    this.#shadow!.appendChild(this.controlPanel)

    const ul = document.createElement("ul")
    this.#shadow!.appendChild(ul)
    this.ul = ul

    // Создаем handle для изменения размера
    this.resizeHandle = document.createElement("div")
    this.resizeHandle.className = "resize-handle"
    this.#shadow!.appendChild(this.resizeHandle)

    // Загружаем сохраненные настройки
    this.loadHeight()
    this.loadOpacity()

    // Инициализируем CSS переменные
    this.style.setProperty("--panel-height", this.panelHeight.toString())
    this.style.setProperty("--panel-opacity", this.opacitySlider.value)

    this.setupResizeHandlers()
    this.setupControlHandlers()
    this.setupAnimationHandlers()

    // Инициализируем состояние кнопки "шаг вперёд"
    import("@metafor/atom").then(({ Atom }) => {
      this.stepBtn.disabled = !Atom.isLocked
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
          this.opacitySlider.value = opacity.toString()
        }
      }
    } catch (error) {
      console.warn("Failed to load stack opacity from localStorage:", error)
    }
  }

  private saveOpacity() {
    try {
      localStorage.setItem(this.OPACITY_KEY, this.opacitySlider.value)
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
    this.opacitySlider.addEventListener("input", () => {
      this.style.setProperty("--panel-opacity", this.opacitySlider.value)
      this.saveOpacity()
    })

    // Обработчик кнопки свернуть
    this.collapseBtn.addEventListener("click", () => {
      this.toggleCollapse()
    })

    // Обработчики кнопок управления дебагом
    this.playBtn.addEventListener("click", () => {
      this.handlePlayClick()
    })

    this.stepBtn.addEventListener("click", () => {
      this.handleStepClick()
    })

    // Обработчик кнопки очистки стека
    this.clearBtn.addEventListener("click", () => {
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

    if (this.isCollapsed) {
      this.collapseBtn.innerHTML = "▲"
      this.collapseBtn.title = "Развернуть панель"

      // Добавляем класс для оптимизации сворачивания
      this.classList.add("collapsing")

      // Скрываем содержимое сразу для быстрого сворачивания
      this.ul.style.display = "none"
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
        this.isAnimating = false
      }, 300)
    } else {
      this.collapseBtn.innerHTML = "▼"
      this.collapseBtn.title = "Свернуть панель"

      // Добавляем класс для оптимизации разворачивания
      this.classList.add("collapsing")

      // Показываем содержимое
      this.ul.style.display = "flex"
      this.resizeHandle.style.display = "block"

      // Плавно разворачиваем
      this.style.transition = "height 0.3s ease"
      this.style.setProperty("--panel-height", this.panelHeight.toString())

      // Сбрасываем флаг анимации и убираем класс после завершения разворачивания
      setTimeout(() => {
        this.classList.remove("collapsing")
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
        this.playBtn.innerHTML = "⏸"
        this.playBtn.title = "Пауза"
      } else {
        // @ts-expect-error
        Atom.pause()
        this.playBtn.innerHTML = "▶"
        this.playBtn.title = "Пуск"
      }
      // Обновляем состояние кнопки "шаг вперёд"
      this.stepBtn.disabled = !Atom.isLocked
    })
  }

  private handleStepClick() {
    EM.step()
  }

  private handleClearClick() {
    // Очищаем все данные
    this.impulseSet.clear()
    this.displayedImpulses.clear()
    this.ul.innerHTML = ""
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
    const currentStackSet = new Set(currentStack)

    // Добавляем новые импульсы
    currentStack.forEach((impulse: Impulse) => {
      if (!this.impulseSet.has(impulse)) {
        this.impulseSet.add(impulse)
        this.addImpulseElement(impulse, currentStackSet.has(impulse))
      }
    })

    // Обновляем статус существующих импульсов
    this.impulseSet.forEach((impulse) => {
      const isRemoved = !currentStackSet.has(impulse)
      const element = this.displayedImpulses.get(impulse)
      if (element) {
        this.updateImpulseElement(element, impulse, isRemoved)
      }
    })

    // Очищаем старые импульсы, если их слишком много
    if (this.impulseSet.size > this.maxImpulses) {
      const sortedImpulses = Array.from(this.impulseSet).sort((a, b) => a.timestamp - b.timestamp)
      const toRemove = sortedImpulses.slice(0, this.impulseSet.size - this.maxImpulses)
      toRemove.forEach((impulse) => {
        this.removeImpulseElement(impulse)
        this.impulseSet.delete(impulse)
      })
    }
  }

  private addImpulseElement(impulse: Impulse, isActive: boolean) {
    const li = document.createElement("li")
    li.className = isActive ? "" : "removed"
    li.style.opacity = "0"
    li.style.transform = "translateY(-10px)"
    li.style.transition = "opacity 0.3s ease, transform 0.3s ease"

    const minSecMilliseconds =
      new Date(impulse.timestamp).getMinutes().toString().padStart(2, "0") +
      ":" +
      new Date(impulse.timestamp).getSeconds().toString().padStart(2, "0") +
      ":" +
      new Date(impulse.timestamp).getMilliseconds().toString().padStart(3, "0")

    li.innerHTML = `
      <span>${minSecMilliseconds}</span>
            <span>${impulse.op}</span>
            <span>${impulse.path}</span>
            <span>${impulse.atom.split("-").pop()}</span>
            <span>${JSON.stringify(impulse.value)}</span>
    `

    // Вставляем в начало списка (новые элементы сверху)
    this.ul.insertBefore(li, this.ul.firstChild)
    this.displayedImpulses.set(impulse, li)

    // Плавное появление
    requestAnimationFrame(() => {
      li.style.opacity = "1"
      li.style.transform = "translateY(0)"
    })
  }

  private updateImpulseElement(element: HTMLLIElement, impulse: Impulse, isRemoved: boolean) {
    // Обновляем класс
    element.className = isRemoved ? "removed" : ""

    // Обновляем содержимое
    const minSecMilliseconds =
      new Date(impulse.timestamp).getMinutes().toString().padStart(2, "0") +
      ":" +
      new Date(impulse.timestamp).getSeconds().toString().padStart(2, "0") +
      ":" +
      new Date(impulse.timestamp).getMilliseconds().toString().padStart(3, "0")

    element.innerHTML = `
      <span>${minSecMilliseconds}</span>
      <span>${impulse.op}</span>
      <span>${impulse.path}</span>
      <span>${impulse.initiator}</span>
      <span>${impulse.atom.split("-").pop()}</span>
      <span>${JSON.stringify(impulse.value)}</span>
    `
  }

  private removeImpulseElement(impulse: Impulse) {
    const element = this.displayedImpulses.get(impulse)
    if (element) {
      // Плавное исчезновение
      element.style.opacity = "0"
      element.style.transform = "translateY(-10px)"

      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element)
        }
        this.displayedImpulses.delete(impulse)
      }, 300) // Ждем завершения анимации
    }
  }

  disconnectedCallback() {
    this.off?.()
  }
}

customElements.get("metafor-stack") ?? customElements.define("metafor-stack", Stack)
