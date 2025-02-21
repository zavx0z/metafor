// language=CSS
css`
  viewport-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;

    & canvas {
      width: 100%;
      height: 100%;
    }
  }
`
/**
 * Обновляет объект рекурсивно
 * @template T
 * @param {T} obj - Исходный объект
 * @param {Partial<T>} patch - Патч для применения
 * @returns {void}
 */
function updateObjectRecursive(obj, patch) {
  for (const key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const patchValue = patch[key]
      const objValue = obj[key]
      if (patchValue !== null && typeof patchValue === "object" && objValue !== null && typeof objValue === "object") updateObjectRecursive(objValue, patchValue)
      // @ts-ignore
      else obj[key] = patchValue
    }
  }
}
/** Компонент для отрисовки соединений внутри viewport */

export class ViewportCanvas extends HTMLElement {
  /** @type {CanvasRenderingContext2D|null} */ ctx
  /** @type {HTMLCanvasElement} */ canvas
  /** @type {Map<string, Edge>} */ edges = new Map()
  /** @type {boolean} */ #debug = false

  constructor() {
    super()

    this.canvas = document.createElement("canvas")
    this.viewport = /** @type {QViewport & HTMLElement} */ (this.closest("quantum-viewport"))
    this.ctx = this.canvas.getContext("2d")
    this.appendChild(this.canvas)
    this.#updateCanvasSize()
  }

  static get observedAttributes() {
    return ["debug"]
  }

  /**@type {(name: string, oldValue: string, newValue: string) => void} */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "debug") {
      this.debug = newValue === "true"
    }
  }
  set debug(value) {
    this.#debug = value
    if (!value) return
    import("./viewport-debug.js").then(module => module.default(this))
  }
  get debug() {
    return this.#debug
  }
  /**
   * Применяет патч к canvas
   * @param {PatchEdge} patch
   */
  applyPatch(patch) {
    switch (patch.op) {
      case "add":
        this.edges.set(patch.path, /** @type {Edge} */ (patch.value))
        break
      case "remove":
        this.edges.delete(patch.path)
        this.draw()
        break
      case "replace":
        const edge = /** @type {Edge} */ (this.edges.get(patch.path))
        updateObjectRecursive(edge, patch.value)
        this.draw()
        break
    }
  }
  draw() {
    this.clear()
    for (const edge of this.edges.values()) this.drawEdge(edge)
  }

  /** Обновляет размеры canvas */
  #updateCanvasSize() {
    const rect = this.getBoundingClientRect()
    const scale = window.devicePixelRatio

    this.canvas.width = rect.width * scale
    this.canvas.height = rect.height * scale

    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0)
      this.ctx.scale(scale, scale)
    }
  }
  /** Очищает canvas */
  clear() {
    if (!this.ctx) return
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
  /**
   * Рисует кривую Безье для связей между элементами
   * @param {Edge} edge Параметры отрисовки
   */
  drawEdge(edge) {
    if (!this.ctx) return
    const {source, target} = edge
    const midX = (source.x + target.x) / 2
    this.ctx.beginPath()
    this.ctx.strokeStyle = edge.color || theme.rgba("--secondary-500")
    this.ctx.lineWidth = edge.width || 1
    this.ctx.moveTo(source.x, source.y)
    this.ctx.bezierCurveTo(midX, source.y, midX, target.y, target.x, target.y)
    this.ctx.stroke()
  }
}

customElements.define("viewport-canvas", ViewportCanvas)
