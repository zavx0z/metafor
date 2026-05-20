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

export class VirtualInput {
  readonly textarea: HTMLTextAreaElement
  #onKey: (e: KeyboardEvent) => void = () => {}
  #onText: (text: string) => void = () => {}
  #disposed = false
  #composing = false

  constructor(parent: HTMLElement) {
    const ta = document.createElement("textarea")
    Object.assign(ta.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "1px",
      height: "1px",
      opacity: "0",
      padding: "0",
      margin: "0",
      border: "0",
      outline: "none",
      resize: "none",
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
    ta.setAttribute("spellcheck", "false")
    ta.tabIndex = 0
    parent.appendChild(ta)
    this.textarea = ta

    ta.addEventListener("keydown", (e) => {
      // Композиция (IME) — даём macOS обработать самостоятельно.
      if (this.#composing) return
      this.#onKey(e)
    })

    // beforeinput — единственный канал, через который приходят НЕ-клавиатурные
    // вставки: emoji-panel, autocorrect-replace, IME-композиция (через
    // compositionend ниже). Чтобы не дублировать обычную клавиатуру
    // (keydown уже доставил её в pane), правило: пропускаем сквозь только
    // multi-character data или явно «не-keydown» inputType.
    ta.addEventListener("beforeinput", (e) => {
      const ie = e as InputEvent
      const data = ie.data ?? ""
      const t = ie.inputType
      const fromNonKeyboard =
        t === "insertReplacementText" || // autocorrect / Touch Bar suggestion
        t === "insertFromComposition" || // финал IME
        (t === "insertText" && data.length > 1) // emoji / multi-char paste
      if (fromNonKeyboard && data.length > 0) {
        e.preventDefault()
        this.#onText(data)
      }
      // Сбрасываем буфер, чтобы он не накапливался и не плодил «недоведённые»
      // символы в скрытом textarea.
      requestAnimationFrame(() => {
        if (!this.#disposed) ta.value = ""
      })
    })

    ta.addEventListener("compositionstart", () => {
      this.#composing = true
    })
    ta.addEventListener("compositionend", (e) => {
      this.#composing = false
      const text = (e as CompositionEvent).data
      if (text !== undefined && text !== null && text.length > 0) this.#onText(text)
      requestAnimationFrame(() => {
        if (!this.#disposed) ta.value = ""
      })
    })

    // Запрещаем браузеру вставлять стандартные ответы (autocomplete suggestions).
    ta.addEventListener("input", () => {
      if (!this.#composing) ta.value = ""
    })
  }

  focus(): void {
    if (this.#disposed) return
    this.textarea.focus({preventScroll: true})
  }

  blur(): void {
    if (this.#disposed) return
    this.textarea.blur()
  }

  isFocused(): boolean {
    return document.activeElement === this.textarea
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
    this.textarea.remove()
  }
}
