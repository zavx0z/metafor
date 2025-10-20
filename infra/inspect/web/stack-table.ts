import { type Impulse } from "@metafor/atom"
import { style } from "./stack-table.styled"
import { shortUUID } from "."

export class StackTable extends HTMLElement {
  private ul!: HTMLUListElement
  private impulseSet = new Set<Impulse>()
  private displayedImpulses = new Map<Impulse, HTMLLIElement>()
  private maxImpulses = 100
  #shadow: ShadowRoot | null = null

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "open" })
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync(style)
    this.#shadow.adoptedStyleSheets = [styleSheet]

    this.createElements()
  }

  private createElements() {
    this.ul = document.createElement("ul")
    this.#shadow!.appendChild(this.ul)
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
      <span>${shortUUID(impulse.atom)}</span>
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
      <span>${shortUUID(impulse.atom)}</span>
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

  public clear() {
    this.impulseSet.clear()
    this.displayedImpulses.clear()
    this.ul.innerHTML = ""
  }

  public setVisible(visible: boolean) {
    this.ul.style.display = visible ? "flex" : "none"
  }
}

customElements.get("stack-table") ?? customElements.define("stack-table", StackTable)
