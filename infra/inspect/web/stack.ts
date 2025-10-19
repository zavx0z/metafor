import { EM } from "@metafor/atom"
import { type Impulse } from "@metafor/atom"

const html = String.raw
const css = String.raw

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

  constructor() {
    super()
    this.innerHTML = html`
      <style>
        ${style}
      </style>
    `

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
    this.collapseBtn.innerHTML = "−"
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
    this.appendChild(this.controlPanel)

    const ul = document.createElement("ul")
    this.appendChild(ul)
    this.ul = ul

    // Создаем handle для изменения размера
    this.resizeHandle = document.createElement("div")
    this.resizeHandle.className = "resize-handle"
    this.appendChild(this.resizeHandle)

    // Загружаем сохраненные настройки
    this.loadHeight()
    this.loadOpacity()

    // Инициализируем CSS переменные
    this.style.setProperty("--panel-height", this.panelHeight.toString())
    this.style.setProperty("--panel-opacity", this.opacitySlider.value)

    this.setupResizeHandlers()
    this.setupControlHandlers()
    const off = EM.onChangeStack((stack) => this.render(stack))
    this.off = off
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
    // @ts-expect-error
    setTimeout(() => this.render(EM.stack), 200)
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

  private toggleCollapse() {
    this.isCollapsed = !this.isCollapsed

    if (this.isCollapsed) {
      this.collapseBtn.innerHTML = "+"
      this.collapseBtn.title = "Развернуть панель"
      // Плавно сворачиваем
      this.style.transition = "height 0.3s ease"
      this.style.setProperty("--panel-height", "32px")

      // Скрываем содержимое после анимации
      setTimeout(() => {
        this.ul.style.display = "none"
        this.resizeHandle.style.display = "none"
      }, 300)
    } else {
      this.collapseBtn.innerHTML = "−"
      this.collapseBtn.title = "Свернуть панель"
      // Показываем содержимое
      this.ul.style.display = "flex"
      this.resizeHandle.style.display = "block"

      // Плавно разворачиваем
      this.style.transition = "height 0.3s ease"
      this.style.setProperty("--panel-height", this.panelHeight.toString())
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

    // Восстанавливаем transition для плавных анимаций
    this.style.transition = "opacity 0.3s ease, transform 0.3s ease, height 0.2s ease"

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
      <span>${impulse.src}</span>
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
const style = css`
  metafor-stack {
    --panel-height: 300;
    --panel-opacity: 0.9;
    display: flex;
    flex-direction: column;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background-color: rgba(37, 37, 37, var(--panel-opacity));
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
    height: calc(var(--panel-height) * 1px);
    max-width: 100vw;
    overflow: hidden;
    margin: 0;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  /* Панель управления */
  metafor-stack .control-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
    margin: 3px 0px;
    min-height: 20px;
    position: relative;
  }

  /* Левая группа (корзина + слайдер) */
  metafor-stack .left-group {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
  }

  /* Центральная группа (кнопки дебага) */
  metafor-stack .center-group {
    display: flex;
    align-items: center;
    gap: 4px;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    height: 100%;
  }

  metafor-stack .opacity-slider {
    width: 60px;
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  metafor-stack .opacity-slider::-webkit-slider-thumb {
    appearance: none;
    width: 10px;
    height: 10px;
    background: #4caf50;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
  }

  metafor-stack .opacity-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    background: #4caf50;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
  }

  metafor-stack .collapse-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #e6e6e6;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    transition: background 0.2s ease, transform 0.1s ease;
    align-self: center;
  }

  metafor-stack .collapse-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  metafor-stack .collapse-btn:active {
    transform: scale(0.95);
  }

  /* Кнопки управления дебагом */
  metafor-stack .debug-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #e6e6e6;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: background 0.2s ease, transform 0.1s ease;
  }

  metafor-stack .debug-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  metafor-stack .debug-btn:active {
    transform: scale(0.95);
  }

  /* Кнопка очистки стека */
  metafor-stack .clear-btn {
    background: rgba(244, 67, 54, 0.2);
    color: #ff5252;
    border: 1px solid rgba(244, 67, 54, 0.3);
    border-radius: 2px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: background 0.2s ease, transform 0.1s ease;
  }

  metafor-stack .clear-btn:hover {
    background: rgba(244, 67, 54, 0.3);
    transform: scale(1.05);
  }

  metafor-stack .clear-btn:active {
    transform: scale(0.95);
  }

  metafor-stack ul {
    list-style: none;
    padding: 0 4px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  metafor-stack li {
    padding: 8px 12px;
    display: grid;
    grid-template-columns: 80px 60px 80px 30px 100px 1fr;
    gap: 8px;
    background-color: rgba(24, 24, 24, 0.87);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    transition: background-color 0.2s ease;
  }

  metafor-stack li:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  metafor-stack li span {
    padding: 4px 6px;
    background-color: rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  metafor-stack li span:first-child {
    color: #888;
    font-weight: 500;
  }

  metafor-stack li span:nth-child(2) {
    color: #4caf50;
    font-weight: 600;
    text-transform: uppercase;
  }

  metafor-stack li span:nth-child(3) {
    color: #2196f3;
    font-family: monospace;
  }

  metafor-stack li span:nth-child(4) {
    color: #ff9800;
    font-weight: 500;
  }

  metafor-stack li span:last-child {
    color: #e91e63;
    font-family: monospace;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Стили для удаленных импульсов */
  metafor-stack li.removed {
    opacity: 0.4;
    background-color: rgba(20, 20, 20, 0.59);
    border-color: rgba(255, 255, 255, 0.05);
    transition: opacity 0.3s ease;
  }

  metafor-stack li.removed span {
    color: #666;
    background-color: rgba(31, 31, 31, 0.6);
  }

  metafor-stack li.removed span:first-child {
    color: #444;
  }

  metafor-stack li.removed span:nth-child(2) {
    color: #2e7d32;
  }

  metafor-stack li.removed span:nth-child(3) {
    color: #1565c0;
  }

  metafor-stack li.removed span:nth-child(4) {
    color: #ef6c00;
  }

  metafor-stack li.removed span:last-child {
    color: #ad1457;
  }

  /* Handle для изменения размера */
  metafor-stack .resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
    cursor: ns-resize;
    z-index: 1001;
    transition: background 0.2s ease;
  }

  metafor-stack .resize-handle:hover {
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%);
  }

  metafor-stack .resize-handle:active {
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.8) 50%, transparent 100%);
  }
`
customElements.get("metafor-stack") ?? customElements.define("metafor-stack", Stack)
