import { Window } from "happy-dom"

// Создаём экземпляр happy-dom
export const window = new Window({
  innerWidth: 1024,
  innerHeight: 768,
  url: "http://localhost:8080",
})
;(globalThis as any).document = window.document
;(globalThis as any).HTMLElement = window.HTMLElement
;(globalThis as any).ShadowRoot = window.ShadowRoot
;(globalThis as any).CSSStyleSheet = window.CSSStyleSheet
;(globalThis as any).customElements = window.customElements
;(globalThis as any).requestAnimationFrame = (callback: Function) => {
  // Серверная реализация requestAnimationFrame
  setTimeout(callback, 0)
}
