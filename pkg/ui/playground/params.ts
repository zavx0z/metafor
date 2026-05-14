/**
 * ParamsPanel — shadcn-style docs для параметров компонента.
 *
 * Каждый параметр рендерится как «prop card»: имя (mono), тип, значение по
 * умолчанию, описание на русском и контрол для интерактивной правки. Группы
 * параметров образуют разделы со своим заголовком; на правой панели
 * собирается TOC (table of contents) со ссылками-якорями на каждый prop.
 *
 * Использование demo'шкой:
 *   params.reset({
 *     title: "Card",
 *     description: "Базовый контейнер...",
 *     category: "Layout",
 *   })
 *   const fontPx = params.number("fontPx", {
 *     label: "fontPx",
 *     type: "number",
 *     description: "Размер шрифта в logical-px.",
 *     default: 13, min: 8, max: 40,
 *   })
 *   params.onChange(() => canvas.relayout())
 */

export type NumberOpts = {
  label: string
  type?: string
  description: string
  default: number
  min: number
  max: number
  step?: number
  unit?: string
}

export type SelectOpts<T extends string> = {
  label: string
  type?: string
  description: string
  default: T
  options: readonly T[]
}

export type BooleanOpts = {
  label: string
  type?: string
  description: string
  default: boolean
}

export type TextOpts = {
  label: string
  type?: string
  description: string
  default: string
  multiline?: boolean
  placeholder?: string
}

export type ColorOpts = {
  label: string
  type?: string
  description: string
  /** Hex like "#6fd3ff". */
  default: string
}

export type GroupOpts = {
  title: string
  description?: string
}

export type ResetOpts = {
  title: string
  description: string
  breadcrumb?: string
}

type ParamRecord =
  | {kind: "number"; opts: NumberOpts; value: number}
  | {kind: "select"; opts: SelectOpts<string>; value: string}
  | {kind: "boolean"; opts: BooleanOpts; value: boolean}
  | {kind: "text"; opts: TextOpts; value: string}
  | {kind: "color"; opts: ColorOpts; value: string}

export class ParamsPanel {
  readonly #body: HTMLElement
  readonly #titleEl: HTMLElement
  readonly #ledeEl: HTMLElement
  readonly #breadcrumbEl: HTMLElement
  readonly #tocEl: HTMLElement
  readonly #records = new Map<string, ParamRecord>()
  readonly #listeners: Array<() => void> = []
  /** Активная группа: новые контролы добавляются сюда вместо корневого body. */
  #activeGroup: HTMLElement | null = null

  constructor(opts: {
    body: HTMLElement
    titleEl: HTMLElement
    ledeEl: HTMLElement
    breadcrumbEl: HTMLElement
    tocEl: HTMLElement
  }) {
    this.#body = opts.body
    this.#titleEl = opts.titleEl
    this.#ledeEl = opts.ledeEl
    this.#breadcrumbEl = opts.breadcrumbEl
    this.#tocEl = opts.tocEl
  }

  /** Полный сброс панели — новый demo получает чистый list. */
  reset(opts: ResetOpts): void {
    this.#body.replaceChildren()
    this.#tocEl.replaceChildren()
    this.#titleEl.textContent = opts.title
    this.#ledeEl.textContent = opts.description
    this.#breadcrumbEl.textContent = opts.breadcrumb ?? "Components"
    this.#records.clear()
    this.#listeners.length = 0
    this.#activeGroup = null
  }

  /** Подписка на любое изменение значения параметра. */
  onChange(cb: () => void): void {
    this.#listeners.push(cb)
  }

  /** Группирующий раздел. Все последующие register'ы попадут внутрь. */
  group(opts: GroupOpts): void {
    const div = document.createElement("section")
    div.className = "prop-group"
    const id = `group-${slugify(opts.title)}`
    const heading = document.createElement("h3")
    heading.className = "prop-group-title"
    heading.id = id
    heading.textContent = opts.title
    div.append(heading)
    if (opts.description !== undefined) {
      const p = document.createElement("p")
      p.className = "section-lede"
      p.textContent = opts.description
      div.append(p)
    }
    this.#body.append(div)
    this.#activeGroup = div

    const a = document.createElement("a")
    a.href = `#${id}`
    a.textContent = opts.title
    a.className = "toc-group"
    a.addEventListener("click", (e) => this.#onTocClick(e, id))
    const li = document.createElement("li")
    li.append(a)
    this.#tocEl.append(li)
  }

  /** Завершить текущую группу — последующие prop'ы пойдут в корень. */
  endGroup(): void {
    this.#activeGroup = null
  }

  number(key: string, opts: NumberOpts): () => number {
    this.#assertNewKey(key)
    const record: ParamRecord = {kind: "number", opts, value: opts.default}
    this.#records.set(key, record)

    const wrap = this.#makeProp(key, opts.label, opts.type ?? "number", `${opts.default}${opts.unit ?? ""}`, opts.description)
    const valueEl = document.createElement("span")
    valueEl.className = "prop-control-value"
    valueEl.textContent = `${opts.default}${opts.unit ?? ""}`
    const input = document.createElement("input")
    input.type = "range"
    input.min = String(opts.min)
    input.max = String(opts.max)
    input.step = String(opts.step ?? 1)
    input.value = String(opts.default)
    input.addEventListener("input", () => {
      const v = Number(input.value)
      record.value = v
      const txt = `${v}${opts.unit ?? ""}`
      valueEl.textContent = txt
      wrap.defaultEl.textContent = txt
      this.#emit()
    })
    const ctl = document.createElement("div")
    ctl.className = "prop-control"
    ctl.append(input, valueEl)
    wrap.box.append(ctl)
    return () => record.value
  }

  select<T extends string>(key: string, opts: SelectOpts<T>): () => T {
    this.#assertNewKey(key)
    const record: ParamRecord = {kind: "select", opts: opts as SelectOpts<string>, value: opts.default}
    this.#records.set(key, record)

    const type = opts.type ?? opts.options.map((o) => `"${o}"`).join(" | ")
    const wrap = this.#makeProp(key, opts.label, type, `"${opts.default}"`, opts.description)
    const ctl = document.createElement("div")
    ctl.className = "prop-control"
    if (opts.options.length <= 5) {
      const seg = document.createElement("div")
      seg.className = "prop-segment"
      const btns = opts.options.map((value) => {
        const b = document.createElement("button")
        b.textContent = value
        b.type = "button"
        if (value === opts.default) b.classList.add("active")
        b.addEventListener("click", () => {
          record.value = value
          wrap.defaultEl.textContent = `"${value}"`
          for (const other of btns) other.classList.toggle("active", other === b)
          this.#emit()
        })
        seg.append(b)
        return b
      })
      ctl.append(seg)
    } else {
      const sel = document.createElement("select")
      for (const o of opts.options) {
        const opt = document.createElement("option")
        opt.value = o
        opt.textContent = o
        if (o === opts.default) opt.selected = true
        sel.append(opt)
      }
      sel.addEventListener("change", () => {
        record.value = sel.value
        wrap.defaultEl.textContent = `"${sel.value}"`
        this.#emit()
      })
      ctl.append(sel)
    }
    wrap.box.append(ctl)
    return () => record.value as T
  }

  boolean(key: string, opts: BooleanOpts): () => boolean {
    this.#assertNewKey(key)
    const record: ParamRecord = {kind: "boolean", opts, value: opts.default}
    this.#records.set(key, record)

    const wrap = this.#makeProp(key, opts.label, opts.type ?? "boolean", String(opts.default), opts.description)
    const ctl = document.createElement("label")
    ctl.className = "prop-checkbox"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.checked = opts.default
    input.addEventListener("change", () => {
      record.value = input.checked
      wrap.defaultEl.textContent = String(input.checked)
      this.#emit()
    })
    const span = document.createElement("span")
    span.textContent = "Enabled"
    ctl.append(input, span)
    wrap.box.append(ctl)
    return () => record.value
  }

  text(key: string, opts: TextOpts): () => string {
    this.#assertNewKey(key)
    const record: ParamRecord = {kind: "text", opts, value: opts.default}
    this.#records.set(key, record)

    const defLabel = opts.default.length > 24 ? `"${opts.default.slice(0, 24)}…"` : `"${opts.default}"`
    const wrap = this.#makeProp(key, opts.label, opts.type ?? "string", defLabel, opts.description)
    let input: HTMLInputElement | HTMLTextAreaElement
    if (opts.multiline === true) {
      input = document.createElement("textarea")
    } else {
      input = document.createElement("input")
      input.type = "text"
    }
    input.value = opts.default
    if (opts.placeholder !== undefined) input.placeholder = opts.placeholder
    input.addEventListener("input", () => {
      record.value = input.value
      this.#emit()
    })
    const ctl = document.createElement("div")
    ctl.className = "prop-control"
    ctl.append(input)
    wrap.box.append(ctl)
    return () => record.value
  }

  color(key: string, opts: ColorOpts): () => string {
    this.#assertNewKey(key)
    const record: ParamRecord = {kind: "color", opts, value: opts.default}
    this.#records.set(key, record)

    const wrap = this.#makeProp(key, opts.label, opts.type ?? "color", opts.default, opts.description)
    const input = document.createElement("input")
    input.type = "color"
    input.value = opts.default
    const valueEl = document.createElement("span")
    valueEl.className = "prop-control-value"
    valueEl.textContent = opts.default
    input.addEventListener("input", () => {
      record.value = input.value
      valueEl.textContent = input.value
      wrap.defaultEl.textContent = input.value
      this.#emit()
    })
    const ctl = document.createElement("div")
    ctl.className = "prop-control"
    ctl.append(input, valueEl)
    wrap.box.append(ctl)
    return () => record.value
  }

  // ────────────────── internals ──────────────────

  #assertNewKey(key: string): void {
    if (this.#records.has(key)) throw new Error(`ParamsPanel: duplicate key "${key}"`)
  }

  #makeProp(
    key: string,
    label: string,
    type: string,
    defaultText: string,
    description: string,
  ): {box: HTMLElement; defaultEl: HTMLElement} {
    const box = document.createElement("article")
    box.className = "prop"
    const id = `prop-${slugify(key)}`
    box.id = id

    const head = document.createElement("div")
    head.className = "prop-head"
    const nameEl = document.createElement("span")
    nameEl.className = "prop-name"
    nameEl.textContent = label
    const typeEl = document.createElement("span")
    typeEl.className = "prop-type"
    typeEl.textContent = type
    const defaultWrap = document.createElement("span")
    defaultWrap.className = "prop-default"
    const defaultLabel = document.createElement("span")
    defaultLabel.className = "prop-default-label"
    defaultLabel.textContent = "default:"
    const defaultEl = document.createElement("span")
    defaultEl.textContent = defaultText
    defaultWrap.append(defaultLabel, defaultEl)
    head.append(nameEl, typeEl, defaultWrap)

    const desc = document.createElement("p")
    desc.className = "prop-description"
    desc.textContent = description

    box.append(head, desc)
    this.#mount(box)
    this.#addToc(id, label)
    return {box, defaultEl}
  }

  #mount(box: HTMLElement): void {
    const parent = this.#activeGroup ?? this.#body
    parent.append(box)
  }

  #addToc(id: string, label: string): void {
    const li = document.createElement("li")
    const a = document.createElement("a")
    a.href = `#${id}`
    a.textContent = label
    a.addEventListener("click", (e) => this.#onTocClick(e, id))
    li.append(a)
    this.#tocEl.append(li)
  }

  /** Прокрутка внутри .doc-props (overflow:auto) — нативный href="#id" не
   *  работает, потому что target находится не на window-уровне. */
  #onTocClick(e: MouseEvent, id: string): void {
    e.preventDefault()
    const target = document.getElementById(id)
    if (target === null) return
    target.scrollIntoView({behavior: "smooth", block: "start"})
  }

  #emit(): void {
    for (const cb of this.#listeners) cb()
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Hex like "#6fd3ff" → RGB-компоненты в 0..1. */
export function hexToRgb(hex: string): {r: number; g: number; b: number} {
  const clean = hex.replace(/^#/, "")
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16)
  return {r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255}
}
