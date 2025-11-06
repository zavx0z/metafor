import { Atom } from "@metafor/atom"
import type { Stack } from "./stack"
import "./stack"
import { style } from "./debugger.styled"
const html = String.raw

class Debugger extends HTMLElement {
  private playBtn: HTMLButtonElement | null = null
  private stepBtn: HTMLButtonElement | null = null
  private reloadBtn: HTMLButtonElement | null = null
  private stack: Stack | null = null
  private toolbar: HTMLElement | null = null
  #toolbarClickHandler: ((e: Event) => void) | null = null

  #shadow: ShadowRoot | null = null
  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "open" })
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync(style)
    this.#shadow.adoptedStyleSheets = [styleSheet]
    if (this.hasAttribute("brk")) {
      Atom.break()
      this.render()
    } else {
      this.updateVisibility()
    }
  }
  render() {
    if (!this.hasAttribute("brk")) return
    this.#shadow!.innerHTML = html`
      <div class="toolbar" part="toolbar">
        <button id="reload" title="Перезагрузить страницу">↻</button>
        <button id="play" title="Пуск/Пауза">▶</button>
        <button id="step" title="Шаг вперёд">⏭</button>
      </div>
      <metafor-stack></metafor-stack>
    `
    this.initializeElements()
  }
  private updateVisibility(): void {
    if (this.hasAttribute("brk")) {
      this.style.display = ""
      if (!this.#shadow?.innerHTML) {
        this.render()
      } else {
        this.initializeElements()
      }
    } else {
      this.style.display = "none"
    }
  }
  private initializeElements(): void {
    if (!this.#shadow) return
    this.stack = this.#shadow.querySelector("metafor-stack") as Stack
    this.playBtn = this.#shadow.querySelector("#play")
    this.stepBtn = this.#shadow.querySelector("#step")
    this.reloadBtn = this.#shadow.querySelector("#reload")
    this.toolbar = this.#shadow.querySelector(".toolbar") as HTMLElement

    if (!this.playBtn || !this.stepBtn || !this.reloadBtn || !this.toolbar) return

    // Удаляем старый обработчик, если был
    if (this.#toolbarClickHandler) {
      this.toolbar.removeEventListener("click", this.#toolbarClickHandler)
    }

    // Делегирование событий на toolbar
    this.#toolbarClickHandler = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.id === "play") {
        this.handlePlayClick()
      } else if (target.id === "step") {
        this.handleStepClick()
      } else if (target.id === "reload") {
        this.handleReloadClick()
      }
    }
    this.toolbar.addEventListener("click", this.#toolbarClickHandler)

    this.updatePlayButton()

    // Анимация появления toolbar
    this.toolbar.style.opacity = "0"
    this.toolbar.style.transition = "opacity 0.4s ease"

    requestAnimationFrame(() => {
      if (this.toolbar) {
        this.toolbar.style.opacity = "1"
      }
    })

    // Анимация появления кнопок toolbar
    setTimeout(() => {
      const buttons = this.#shadow?.querySelectorAll(".toolbar button") as NodeListOf<HTMLElement>
      buttons?.forEach((button, index) => {
        setTimeout(() => {
          button.style.opacity = "1"
        }, index * 100) // Задержка для каскадного эффекта
      })
    }, 200)
  }
  connectedCallback(): void {
    if (this.hasAttribute("brk")) {
      this.initializeElements()
    }
  }

  disconnectedCallback(): void {
    if (this.toolbar && this.#toolbarClickHandler) {
      this.toolbar.removeEventListener("click", this.#toolbarClickHandler)
      this.#toolbarClickHandler = null
    }
  }

  static get observedAttributes(): string[] {
    return ["brk"]
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name !== "brk") return
    // presence attribute: set => newValue is "" (empty string) or some value; remove => null
    const shouldBreak = newValue !== null
    if (shouldBreak && !Atom.isLocked) Atom.break()
    else if (!shouldBreak && Atom.isLocked) Atom.resume()
    this.updateVisibility()
    this.updatePlayButton()
  }

  private updatePlayButton(): void {
    if (!this.playBtn || !this.stepBtn) return
    // UX: показываем действие, которое произойдёт при клике
    // locked (paused) → показываем ▶ (Resume)
    // running → показываем ⏸ (Pause)
    this.playBtn.textContent = Atom.isLocked ? "▶" : "⏸"

    // Блокируем кнопку "шаг вперёд" когда Atom не заблокирован
    this.stepBtn.disabled = !Atom.isLocked
  }

  private handlePlayClick(): void {
    if (!Atom.isLocked) {
      Atom.break()
    } else {
      Atom.resume()
    }
    this.updatePlayButton()
  }

  private handleStepClick(): void {
    Atom.step()
  }

  private handleReloadClick(): void {
    window.location.reload()
  }
}

if (!customElements.get("meta-inspect")) {
  customElements.define("meta-inspect", Debugger)
}
export default Debugger
