/**
 * Минимальная эмуляция DOM API для веб-воркеров
 *
 * Эмулирует только необходимые для MetaFor функции:
 * - CustomElementRegistry
 * - HTMLElement с атрибутами и shadow DOM
 * - ShadowRoot
 * - CSSStyleSheet
 */

// Эмуляция атрибутов элемента
class AttributeMap {
  private attributes = new Map<string, string>()

  get(name: string): string | null {
    return this.attributes.get(name) || null
  }

  set(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  has(name: string): boolean {
    return this.attributes.has(name)
  }

  remove(name: string): void {
    this.attributes.delete(name)
  }

  keys(): IterableIterator<string> {
    return this.attributes.keys()
  }
}

// Эмуляция CSSStyleSheet
class EmulatedCSSStyleSheet {
  private rules: string = ""

  replaceSync(text: string): void {
    this.rules = text
  }

  get cssText(): string {
    return this.rules
  }
}

// Эмуляция ShadowRoot
class EmulatedShadowRoot {
  public adoptedStyleSheets: EmulatedCSSStyleSheet[] = []
  public innerHTML: string = ""
  private children: EmulatedHTMLElement[] = []

  appendChild(element: EmulatedHTMLElement): EmulatedHTMLElement {
    this.children.push(element)
    return element
  }

  querySelector(selector: string): EmulatedHTMLElement | null {
    // Простая эмуляция - возвращаем первый элемент если он есть
    return this.children[0] || null
  }

  querySelectorAll(selector: string): EmulatedHTMLElement[] {
    return [...this.children]
  }
}

// Базовый эмулированный HTMLElement
class EmulatedHTMLElement {
  private attributes = new AttributeMap()
  private shadowRoot: EmulatedShadowRoot | null = null
  private children: EmulatedHTMLElement[] = []

  // Callbacks для lifecycle
  connectedCallback?(): void
  disconnectedCallback?(): void

  constructor() {
    // Эмуляция асинхронного подключения элемента
    setTimeout(() => {
      this.connectedCallback?.()
    }, 0)
  }

  // Атрибуты
  getAttribute(name: string): string | null {
    return this.attributes.get(name)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  removeAttribute(name: string): void {
    this.attributes.remove(name)
  }

  // Shadow DOM
  attachShadow(options: { mode: "open" | "closed" }): EmulatedShadowRoot {
    this.shadowRoot = new EmulatedShadowRoot()
    return this.shadowRoot
  }

  getShadowRoot(): EmulatedShadowRoot | null {
    return this.shadowRoot
  }

  // DOM Methods
  appendChild(element: EmulatedHTMLElement): EmulatedHTMLElement {
    this.children.push(element)
    return element
  }

  querySelector(selector: string): EmulatedHTMLElement | null {
    return this.children[0] || null
  }

  querySelectorAll(selector: string): EmulatedHTMLElement[] {
    return [...this.children]
  }
}

// Эмуляция CustomElementRegistry
class EmulatedCustomElementRegistry {
  private registry = new Map<string, CustomElementConstructor>()

  define(name: string, constructor: CustomElementConstructor): void {
    this.registry.set(name, constructor)
  }

  get(name: string): CustomElementConstructor | undefined {
    return this.registry.get(name)
  }

  whenDefined(name: string): Promise<CustomElementConstructor> {
    return new Promise((resolve) => {
      const constructor = this.get(name)
      if (constructor) {
        resolve(constructor)
      } else {
        // В реальной реализации здесь был бы observer
        setTimeout(() => {
          const delayed = this.get(name)
          if (delayed) resolve(delayed)
        }, 0)
      }
    })
  }
}

// Функция инициализации эмуляции DOM
export function initDOMEmulation(): void {
  // Проверяем, что мы в воркере
  if (typeof window !== "undefined") {
    console.warn("DOM эмуляция предназначена только для веб-воркеров")
    return
  }

  // Создаем глобальные объекты для воркера
  const globalScope = globalThis as any

  // CustomElementRegistry
  globalScope.customElements = new EmulatedCustomElementRegistry()

  // HTMLElement
  globalScope.HTMLElement = EmulatedHTMLElement

  // CSSStyleSheet
  globalScope.CSSStyleSheet = EmulatedCSSStyleSheet

  // ShadowRoot
  globalScope.ShadowRoot = EmulatedShadowRoot

  // Добавляем минимальную эмуляцию document для совместимости
  globalScope.document = {
    createElement: (tagName: string) => {
      // Если создается кастомный элемент, используем зарегистрированный конструктор
      if (tagName.includes("-")) {
        const constructor = globalScope.customElements?.get(tagName)
        if (constructor) {
          return new constructor()
        }
      }
      return new EmulatedHTMLElement()
    },
    body: new EmulatedHTMLElement(),
  }

  // URL API уже есть в воркерах, но добавим для совместимости
  if (!globalScope.URL.createObjectURL) {
    globalScope.URL.createObjectURL = (blob: Blob) => {
      // Простая эмуляция - возвращаем data URL
      return `data:${blob.type};base64,${btoa("emulated")}`
    }
    globalScope.URL.revokeObjectURL = (url: string) => {
      // Ничего не делаем в эмуляции
    }
  }
}

// Экспортируем типы для использования
export type {
  EmulatedHTMLElement as HTMLElement,
  EmulatedShadowRoot as ShadowRoot,
  EmulatedCSSStyleSheet as CSSStyleSheet,
  EmulatedCustomElementRegistry as CustomElementRegistry,
}
