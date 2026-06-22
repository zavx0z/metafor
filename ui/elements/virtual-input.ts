/**
 * VirtualInput — невидимый DOM-textarea рядом с canvas, нужный исключительно
 * для того, чтобы macOS показывал нативные «инструменты ввода»:
 *   • emoji-панель (Cmd+Ctrl+Space или Touch Bar),
 *   • IME-окна для китайского / японского / голосового ввода,
 *   • системный autocorrect / dictation.
 *
 * Сам canvas — не текстовое поле в смысле DOM, поэтому macOS не предлагает
 * для него ничего из перечисленного. Решение — поставить рядом 1×1
 * `<textarea>` с `opacity:0`, держать на нём фокус, перехватывать ввод и
 * отдавать вверх через колбэки. Это чистый proxy: текст никогда не остаётся
 * в textarea, он сразу же стирается; источником правды остаётся EditorPane.
 *
 * API:
 *   • focus() / blur() — управление фокусом proxy.
 *   • setCaretViewport(x, y) — координаты курсора (viewport, logical px).
 *     macOS показывает emoji panel / IME рядом с активным input — нам это
 *     нужно, чтобы окно всплывало рядом с курсором в редакторе.
 *   • onKey(fn) — keydown с textarea (после preventDefault на нашей стороне).
 *   • onText(fn) — text-input, который пришёл НЕ через keydown: emoji-вставка,
 *     IME composition (комплектно), dictation, paste-from-panel.
 */

export type VirtualInputSoftKeyboardMode = "none" | "text"

export type VirtualInputFocusOpts = {
  softKeyboard?: boolean
}

type NativeSoftKeyboardBridge = {
  show?: () => void
  hide?: () => void
}

export function requestNativeSoftKeyboard(): void {
  const bridge = (globalThis as {MetaForKeyboard?: NativeSoftKeyboardBridge}).MetaForKeyboard
  try {
    bridge?.show?.()
  } catch {
    // The bridge is best-effort and only exists in Android WebView shells.
  }
  const virtualKeyboard = (navigator as Navigator & {virtualKeyboard?: {show?: () => void}}).virtualKeyboard
  try {
    virtualKeyboard?.show?.()
  } catch {
    // Chrome can reject this outside a trusted input gesture.
  }
}

export function hideNativeSoftKeyboard(): void {
  const bridge = (globalThis as {MetaForKeyboard?: NativeSoftKeyboardBridge}).MetaForKeyboard
  try {
    bridge?.hide?.()
  } catch {
    // The bridge is best-effort and only exists in Android WebView shells.
  }
  const virtualKeyboard = (navigator as Navigator & {virtualKeyboard?: {hide?: () => void}}).virtualKeyboard
  try {
    virtualKeyboard?.hide?.()
  } catch {
    // Chrome can reject this outside a trusted input gesture.
  }
}

export class VirtualInput {
  readonly textarea: HTMLTextAreaElement
  #onKey: (e: KeyboardEvent) => void = () => {}
  #onText: (text: string) => void = () => {}
  #disposed = false
  #composing = false
  #compositionTextDelivered = false
  #inputHandledBeforeInput = false
  #softKeyboardMode: VirtualInputSoftKeyboardMode = "none"
  #textKeyFallbackTimer: number | null = null
  #textKeyFallbackText = ""

  constructor(parent: HTMLElement) {
    const ta = document.createElement("textarea")
    Object.assign(ta.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "24px",
      height: "24px",
      opacity: "0.01",
      padding: "0",
      margin: "0",
      border: "0",
      outline: "none",
      resize: "none",
      fontSize: "16px",
      lineHeight: "16px",
      // visible для accessibility, но не мешает кликам:
      pointerEvents: "none",
      zIndex: "9999",
      background: "transparent",
      color: "transparent",
      caretColor: "transparent",
      // не должен скроллить страницу:
      overflow: "hidden",
    } satisfies Partial<CSSStyleDeclaration>)
    ta.setAttribute("autocomplete", "off")
    ta.setAttribute("autocapitalize", "off")
    ta.setAttribute("autocorrect", "on") // на macOS включает Touch Bar emoji
    ta.setAttribute("inputmode", this.#softKeyboardMode)
    ta.setAttribute("spellcheck", "false")
    ta.tabIndex = 0
    parent.appendChild(ta)
    this.textarea = ta

    ta.addEventListener("keydown", (e) => {
      // Композиция (IME) — даём macOS обработать самостоятельно.
      if (this.#composing) return
      if (this.#softKeyboardMode === "text" && isPlainTextKey(e)) {
        e.preventDefault()
        this.#scheduleTextKeyFallback(e.key)
        return
      }
      this.#onKey(e)
    })

    // beforeinput — единственный канал, через который приходят НЕ-клавиатурные
    // вставки: emoji-panel, autocorrect-replace, IME-композиция (через
    // compositionend ниже). Android soft keyboard тоже приходит сюда как
    // одиночный insertText, потому что нормального keydown для букв может не быть.
    ta.addEventListener("beforeinput", (e) => {
      const ie = e as InputEvent
      const data = ie.data ?? ""
      const t = ie.inputType
      this.#clearTextKeyFallback()
      this.#inputHandledBeforeInput = false
      let handled = false
      const fromSoftKeyboard = this.#softKeyboardMode === "text" && t === "insertText"
      const fromNonKeyboard =
        t === "insertReplacementText" || // autocorrect / Touch Bar suggestion
        t === "insertFromComposition" || // финал IME
        (t === "insertText" && data.length > 1) // emoji / multi-char paste
      if ((fromSoftKeyboard || fromNonKeyboard) && data.length > 0) {
        e.preventDefault()
        this.#inputHandledBeforeInput = true
        if (this.#composing) this.#compositionTextDelivered = true
        this.#onText(data)
        handled = true
      } else if (this.#softKeyboardMode === "text" && (t === "deleteContentBackward" || t === "deleteContentForward")) {
        e.preventDefault()
        this.#inputHandledBeforeInput = true
        this.#onKey(new KeyboardEvent("keydown", {
          key: t === "deleteContentBackward" ? "Backspace" : "Delete",
          bubbles: true,
          cancelable: true,
        }))
        handled = true
      } else if (this.#softKeyboardMode === "text" && (t === "insertLineBreak" || t === "insertParagraph")) {
        e.preventDefault()
        this.#inputHandledBeforeInput = true
        this.#onKey(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
        handled = true
      }
      // Сбрасываем буфер, чтобы он не накапливался и не плодил «недоведённые»
      // символы в скрытом textarea.
      if (handled) {
        requestAnimationFrame(() => {
          if (!this.#disposed) ta.value = ""
        })
      }
    })

    ta.addEventListener("compositionstart", () => {
      this.#clearTextKeyFallback()
      this.#composing = true
      this.#compositionTextDelivered = false
    })
    ta.addEventListener("compositionend", (e) => {
      this.#composing = false
      const eventText = (e as CompositionEvent).data
      const text = eventText !== undefined && eventText !== null && eventText.length > 0 ? eventText : ta.value
      if (!this.#compositionTextDelivered && text.length > 0) this.#onText(text)
      this.#compositionTextDelivered = false
      requestAnimationFrame(() => {
        if (!this.#disposed) ta.value = ""
      })
    })

    // Запрещаем браузеру вставлять стандартные ответы (autocomplete suggestions).
    ta.addEventListener("input", (e) => {
      this.#clearTextKeyFallback()
      const value = ta.value
      if (this.#softKeyboardMode === "text" && !this.#inputHandledBeforeInput && value.length > 0) {
        const data = (e as InputEvent).data
        this.#onText(data !== null && data !== undefined && data.length > 0 ? data : value)
        if (this.#composing) this.#compositionTextDelivered = true
      }
      this.#inputHandledBeforeInput = false
      if (!this.#composing || this.#softKeyboardMode === "text") ta.value = ""
    })
  }

  focus(opts: VirtualInputFocusOpts = {}): void {
    if (this.#disposed) return
    const softKeyboardEnvironment = shouldUseSoftKeyboardInputMode()
    const mode: VirtualInputSoftKeyboardMode = opts.softKeyboard === true && softKeyboardEnvironment ? "text" : "none"
    if (softKeyboardEnvironment && mode === "none") {
      this.#setSoftKeyboardMode("none")
      if (this.isFocused()) {
        this.textarea.blur()
        hideNativeSoftKeyboard()
      }
      return
    }
    const wasFocused = this.isFocused()
    const changed = this.#setSoftKeyboardMode(mode)
    if (wasFocused && changed) this.textarea.blur()
    this.textarea.focus({preventScroll: true})
    if (mode === "text") requestNativeSoftKeyboard()
  }

  blur(): void {
    if (this.#disposed) return
    this.textarea.blur()
    hideNativeSoftKeyboard()
  }

  isFocused(): boolean {
    return document.activeElement === this.textarea
  }

  softKeyboardActive(): boolean {
    return !this.#disposed && this.#softKeyboardMode === "text"
  }

  #setSoftKeyboardMode(mode: VirtualInputSoftKeyboardMode): boolean {
    if (this.#softKeyboardMode === mode) return false
    this.#softKeyboardMode = mode
    this.textarea.inputMode = mode
    this.textarea.setAttribute("inputmode", mode)
    return true
  }

  /**
   * Куда в viewport «приклеить» 1×1 textarea — туда macOS будет всплывать
   * emoji-panel / IME. Координаты — logical px относительно viewport.
   */
  setCaretViewport(x: number, y: number): void {
    if (this.#disposed) return
    this.textarea.style.left = `${Math.round(x)}px`
    this.textarea.style.top = `${Math.round(y)}px`
  }

  onKey(fn: (e: KeyboardEvent) => void): void {
    this.#onKey = fn
  }

  onText(fn: (text: string) => void): void {
    this.#onText = fn
  }

  dispose(): void {
    this.#disposed = true
    this.#clearTextKeyFallback()
    this.textarea.remove()
  }

  #scheduleTextKeyFallback(text: string): void {
    this.#clearTextKeyFallback()
    this.#textKeyFallbackText = text
    this.#textKeyFallbackTimer = window.setTimeout(() => {
      const fallback = this.#textKeyFallbackText
      this.#textKeyFallbackTimer = null
      this.#textKeyFallbackText = ""
      if (!this.#disposed && this.#softKeyboardMode === "text" && fallback.length > 0) this.#onText(fallback)
    }, 120)
  }

  #clearTextKeyFallback(): void {
    if (this.#textKeyFallbackTimer !== null) {
      window.clearTimeout(this.#textKeyFallbackTimer)
      this.#textKeyFallbackTimer = null
    }
    this.#textKeyFallbackText = ""
  }
}

function isPlainTextKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1
}

function shouldUseSoftKeyboardInputMode(): boolean {
  const nav = navigator as Navigator & {userAgentData?: {platform?: string}}
  if (/android|mobile/i.test(`${nav.userAgent} ${nav.userAgentData?.platform ?? ""}`)) return true
  if (navigator.maxTouchPoints > 0) return true
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
}
