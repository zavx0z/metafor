import { Atom } from "@metafor/atom"
import type { Stack } from "./stack"
import "./stack"
const css = String.raw
const html = String.raw

class Debugger extends HTMLElement {
  private playBtn: HTMLButtonElement | null = null
  private stepBtn: HTMLButtonElement | null = null
  private reloadBtn: HTMLButtonElement | null = null
  private stack: Stack | null = null

  #shadow: ShadowRoot | null = null
  constructor() {
    super()
    if (this.hasAttribute("brk")) Atom.break()

    this.#shadow = this.attachShadow({ mode: "open" })
    this.#shadow.innerHTML = html`
      <style>
        ${style}
      </style>
      <div class="toolbar" part="toolbar">
        <button id="reload" title="Перезагрузить страницу">↻</button>
        <button id="play" title="Пуск/Пауза">▶</button>
        <button id="step" title="Шаг вперёд">⏭</button>
      </div>
      <metafor-stack></metafor-stack>
    `
  }

  connectedCallback(): void {
    this.stack = this.#shadow?.querySelector("metafor-stack") as Stack
    this.playBtn = this.#shadow?.querySelector("#play")!
    this.stepBtn = this.#shadow?.querySelector("#step")!
    this.reloadBtn = this.#shadow?.querySelector("#reload")!

    if (!this.playBtn || !this.stepBtn || !this.reloadBtn) return

    this.updatePlayButton()

    // Анимация появления toolbar
    const toolbar = this.#shadow?.querySelector(".toolbar") as HTMLElement
    if (toolbar) {
      toolbar.style.opacity = "0"
      toolbar.style.transition = "opacity 0.4s ease"

      requestAnimationFrame(() => {
        toolbar.style.opacity = "1"
      })
    }

    // Анимация появления кнопок toolbar
    setTimeout(() => {
      const buttons = this.#shadow?.querySelectorAll(".toolbar button") as NodeListOf<HTMLElement>
      buttons?.forEach((button, index) => {
        setTimeout(() => {
          button.style.opacity = "1"
        }, index * 100) // Задержка для каскадного эффекта
      })
    }, 200)

    this.playBtn.addEventListener("click", this.handlePlayClick.bind(this))
    this.stepBtn.addEventListener("click", this.handleStepClick.bind(this))
    this.reloadBtn.addEventListener("click", this.handleReloadClick.bind(this))
  }

  disconnectedCallback(): void {
    // Cleanup event listeners if needed
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

const style = css`
  :host {
    display: flex;
    z-index: 110;
    color: #e6e6e6;
    font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  }

  .toolbar {
    width: max-content;
    position: fixed;
    left: 50%;
    top: 10px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 8px;
    background: #1f1f1f;
    border: 1px solid #2a2a2a;
    border-bottom: none;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    width: max-content;
  }

  .toolbar button {
    background: #2b2b2b;
    color: #e6e6e6;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    padding: 0;
    width: 40px;
    height: 28px;
    line-height: 1;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.06s ease, box-shadow 0.15s ease, opacity 0.3s ease;
    opacity: 0;
  }

  .toolbar button:hover {
    background: #343434;
    box-shadow: 0 0 0 1px #3f3f3f inset;
  }

  .toolbar button:active {
    transform: translateY(1px) scale(0.98);
    background: #272727;
  }

  .toolbar button:focus-visible {
    outline: 2px solid #4b7fff;
    outline-offset: 2px;
  }

  .toolbar button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

if (!customElements.get("meta-inspect")) {
  customElements.define("meta-inspect", Debugger)
}
export default Debugger
