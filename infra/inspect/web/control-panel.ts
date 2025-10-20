import { style } from "./control-panel.styled"

export class ControlPanel extends HTMLElement {
  private opacitySlider!: HTMLInputElement
  private positionSelect!: HTMLSelectElement
  private collapseBtn!: HTMLButtonElement
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

    // Создаем ползунок прозрачности
    this.opacitySlider = document.createElement("input")
    this.opacitySlider.type = "range"
    this.opacitySlider.min = "0.1"
    this.opacitySlider.max = "1"
    this.opacitySlider.step = "0.1"
    this.opacitySlider.value = "0.9"
    this.opacitySlider.className = "opacity-slider"
    this.opacitySlider.title = "Прозрачность панели"

    // Создаем селект позиции
    this.positionSelect = document.createElement("select")
    this.positionSelect.className = "position-select"
    this.positionSelect.title = "Позиция панели"

    const positions = [
      { value: "bottom", text: "Снизу" },
      { value: "top", text: "Сверху" },
      { value: "left", text: "Слева" },
      { value: "right", text: "Справа" },
    ]

    positions.forEach((pos) => {
      const option = document.createElement("option")
      option.value = pos.value
      option.textContent = pos.text
      this.positionSelect.appendChild(option)
    })

    this.positionSelect.value = "bottom"

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

    // Создаем левую группу (корзина + слайдер + позиция)
    const leftGroup = document.createElement("div")
    leftGroup.className = "left-group"
    leftGroup.appendChild(this.clearBtn)
    leftGroup.appendChild(this.opacitySlider)
    leftGroup.appendChild(this.positionSelect)

    // Создаем центральную группу (кнопки дебага)
    const centerGroup = document.createElement("div")
    centerGroup.className = "center-group"
    centerGroup.appendChild(this.playBtn)
    centerGroup.appendChild(this.stepBtn)

    controlPanel.appendChild(leftGroup)
    controlPanel.appendChild(centerGroup)
    controlPanel.appendChild(this.collapseBtn)
    this.#shadow!.appendChild(controlPanel)
  }

  private setupEventHandlers() {
    // Обработчик ползунка прозрачности
    this.opacitySlider.addEventListener("input", () => {
      this.dispatchEvent(
        new CustomEvent("opacity-change", {
          detail: { value: this.opacitySlider.value },
        })
      )
    })

    // Обработчик селекта позиции
    this.positionSelect.addEventListener("change", () => {
      this.dispatchEvent(
        new CustomEvent("position-change", {
          detail: { value: this.positionSelect.value },
        })
      )
    })

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
    this.positionSelect.value = position
  }
}

customElements.get("control-panel") ?? customElements.define("control-panel", ControlPanel)
