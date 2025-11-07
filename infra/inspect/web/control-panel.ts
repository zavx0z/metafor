import { style } from "./control-panel.styled"

type DockKey = "left" | "bottom" | "right" | "top"

export class ControlPanel extends HTMLElement {
  private opacitySlider!: HTMLInputElement
  private stepDelaySlider!: HTMLInputElement
  private dockBtns!: Record<DockKey, HTMLButtonElement>
  private collapseBtn!: HTMLButtonElement
  private menuBtn!: HTMLButtonElement
  private menu!: HTMLDivElement
  private playBtn!: HTMLButtonElement
  private stepBtn!: HTMLButtonElement
  private clearBtn!: HTMLButtonElement
  #shadow: ShadowRoot | null = null

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "open" })
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync(style)
    this.#shadow.adoptedStyleSheets = [styleSheet]

    this.createElements()
    this.setupEventHandlers()

    // Инициализируем CSS переменную прозрачности
    this.dispatchEvent(
      new CustomEvent("opacity-change", {
        detail: { value: this.opacitySlider.value },
      })
    )
  }

  private createElements() {
    // Создаем панель управления
    const controlPanel = document.createElement("div")
    controlPanel.className = "control-panel"

    // Кнопка меню (три точки)
    this.menuBtn = document.createElement("button")
    this.menuBtn.className = "menu-btn"
    this.menuBtn.innerHTML = "⋮"
    this.menuBtn.title = "Меню настроек"

    // Меню
    this.menu = document.createElement("div")
    this.menu.className = "menu hidden"

    // Блок Dock side
    const dockBlock = document.createElement("div")
    dockBlock.className = "menu-section dock"
    const dockTitle = document.createElement("div")
    dockTitle.className = "menu-title"
    dockTitle.textContent = "Dock side"
    const dockGrid = document.createElement("div")
    dockGrid.className = "dock-grid"
    this.dockBtns = {
      left: document.createElement("button"),
      bottom: document.createElement("button"),
      right: document.createElement("button"),
      top: document.createElement("button"),
    }
    this.dockBtns.left.className = "dock-btn left"
    this.dockBtns.left.title = "Слева"
    this.dockBtns.left.innerHTML = "▌"
    this.dockBtns.bottom.className = "dock-btn bottom"
    this.dockBtns.bottom.title = "Снизу"
    this.dockBtns.bottom.innerHTML = "▁"
    this.dockBtns.right.className = "dock-btn right"
    this.dockBtns.right.title = "Справа"
    this.dockBtns.right.innerHTML = "▐"
    this.dockBtns.top.className = "dock-btn top"
    this.dockBtns.top.title = "Сверху"
    this.dockBtns.top.innerHTML = "▔"
    dockGrid.append(this.dockBtns.left, this.dockBtns.bottom, this.dockBtns.right, this.dockBtns.top)
    dockBlock.append(dockTitle, dockGrid)

    // Блок прозрачности
    const opacityBlock = document.createElement("div")
    opacityBlock.className = "menu-section opacity"
    const opacityLabel = document.createElement("div")
    opacityLabel.className = "menu-title"
    opacityLabel.textContent = "Opacity"
    this.opacitySlider = document.createElement("input")
    this.opacitySlider.type = "range"
    this.opacitySlider.min = "0.1"
    this.opacitySlider.max = "1"
    this.opacitySlider.step = "0.1"
    this.opacitySlider.value = "0.9"
    this.opacitySlider.className = "opacity-slider"
    opacityBlock.append(opacityLabel, this.opacitySlider)

    this.menu.append(dockBlock, opacityBlock)

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

    // Создаем слайдер замедления выполнения
    this.stepDelaySlider = document.createElement("input")
    this.stepDelaySlider.type = "range"
    this.stepDelaySlider.min = "0"
    this.stepDelaySlider.max = "5000"
    this.stepDelaySlider.step = "10"
    this.stepDelaySlider.value = "0"
    this.stepDelaySlider.className = "step-delay-slider"
    this.stepDelaySlider.title = "Замедление выполнения (мс)"
    const stepDelayValue = document.createElement("span")
    stepDelayValue.className = "step-delay-value"
    stepDelayValue.textContent = "0 мс"

    // Создаем кнопку очистки стека
    this.clearBtn = document.createElement("button")
    this.clearBtn.className = "clear-btn"
    this.clearBtn.innerHTML = "🗑"
    this.clearBtn.title = "Очистить стек"

    // Создаем левую группу
    const leftGroup = document.createElement("div")
    leftGroup.className = "left-group"
    leftGroup.appendChild(this.clearBtn)
    leftGroup.appendChild(this.menuBtn)

    // Создаем центральную группу (кнопки дебага и слайдер замедления)
    const centerGroup = document.createElement("div")
    centerGroup.className = "center-group"
    centerGroup.appendChild(this.playBtn)
    centerGroup.appendChild(this.stepBtn)
    const stepDelayContainer = document.createElement("div")
    stepDelayContainer.className = "step-delay-container"
    stepDelayContainer.appendChild(this.stepDelaySlider)
    stepDelayContainer.appendChild(stepDelayValue)
    centerGroup.appendChild(stepDelayContainer)

    controlPanel.appendChild(leftGroup)
    controlPanel.appendChild(centerGroup)
    controlPanel.appendChild(this.collapseBtn)
    this.#shadow!.appendChild(controlPanel)
    this.#shadow!.appendChild(this.menu)
  }

  private setupEventHandlers() {
    // Обработчик открытия/закрытия меню
    const toggleMenu = () => {
      if (this.menu.classList.contains("hidden")) {
        this.menu.classList.remove("hidden")
      } else {
        this.menu.classList.add("hidden")
      }
    }
    this.menuBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation()
      toggleMenu()
    })
    document.addEventListener("click", () => {
      this.menu.classList.add("hidden")
    })

    // Обработчик ползунка прозрачности (внутри меню)
    this.opacitySlider.oninput = () => {
      const evt = new window.CustomEvent("opacity-change", {
        detail: { value: this.opacitySlider.value },
      })
      this.dispatchEvent(evt)
    }

    // Обработчик ползунка замедления выполнения
    this.stepDelaySlider.oninput = () => {
      const value = parseInt(this.stepDelaySlider.value, 10)
      const stepDelayValue = this.#shadow?.querySelector(".step-delay-value")
      if (stepDelayValue) {
        stepDelayValue.textContent = value === 0 ? "0 мс" : `${value} мс`
      }
      const evt = new window.CustomEvent("step-delay-change", {
        detail: { value },
      })
      this.dispatchEvent(evt)
    }

    // Обработчики кнопок дока
    ;(Object.entries(this.dockBtns) as [DockKey, HTMLButtonElement][]).forEach(
      ([pos, btn]: [DockKey, HTMLButtonElement]) => {
        btn.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation()
          this.dispatchEvent(
            new CustomEvent("position-change", {
              detail: { value: pos },
            })
          )
          this.menu.classList.add("hidden")
        })
      }
    )

    // Обработчик кнопки свернуть
    this.collapseBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("collapse-toggle"))
    })

    // Обработчики кнопок управления дебагом
    this.playBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("play-toggle"))
    })

    this.stepBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("step"))
    })

    // Обработчик кнопки очистки стека
    this.clearBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("clear"))
    })
  }

  // Публичные методы для управления состоянием
  setCollapsed(collapsed: boolean) {
    this.collapseBtn.innerHTML = collapsed ? "▲" : "▼"
    this.collapseBtn.title = collapsed ? "Развернуть панель" : "Свернуть панель"
  }

  setOpacity(value: string) {
    this.opacitySlider.value = value
    // Также обновляем CSS переменную при программном изменении
    this.dispatchEvent(
      new CustomEvent("opacity-change", {
        detail: { value: value },
      })
    )
  }

  setPlayState(isPlaying: boolean) {
    this.playBtn.innerHTML = isPlaying ? "⏸" : "▶"
    this.playBtn.title = isPlaying ? "Пауза" : "Пуск"
  }

  setStepDisabled(disabled: boolean) {
    this.stepBtn.disabled = disabled
  }

  setPosition(position: string) {
    Object.values(this.dockBtns).forEach((b) => b.classList.remove("active"))
    const btn = this.dockBtns[position as DockKey]
    if (btn) btn.classList.add("active")

    // Скрываем кнопку сворачивания для боковых позиций
    if (position === "left" || position === "right") {
      this.collapseBtn.style.display = "none"
    } else {
      this.collapseBtn.style.display = "block"
    }
  }
}

customElements.get("control-panel") ?? customElements.define("control-panel", ControlPanel)
