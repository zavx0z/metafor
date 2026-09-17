import { ref } from "../../html/directives/ref.js"
import { MetaFor } from "../../metafor.js"

MetaFor("grid")
  .states("Инициализация", "Без осей", "С осями")
  .context(({ number, string, boolean }) => ({
    showAxis: boolean({ title: "Показывать оси", default: false }),
    scale: number({ title: "Масштаб сетки", default: 1 }),
    size: number({ title: "Размер сетки", default: 100 }),
    translateX: number({ title: "Смещение по X", default: 100 }),
    translateY: number({ title: "Смещение по Y", default: 100 }),
    color: string({ title: "Цвет сетки", default: "rgb(228, 33, 33)" }),
    lineWidth: number({ title: "Толщина сетки", default: 1 }),
    width: number({ title: "Ширина", nullable: true }),
    height: number({ title: "Высота", nullable: true }),
  }))
  .transitions([
    {
      from: "Инициализация",
      to: [
        { state: "Без осей", trigger: { showAxis: false } },
        { state: "С осями", trigger: { showAxis: true } },
      ],
    },
    {
      from: "Без осей",
      action: "removeAxis",
      to: [{ state: "С осями", trigger: { showAxis: true } }],
    },
    {
      from: "С осями",
      action: "addAxis",
      to: [{ state: "Без осей", trigger: { showAxis: false } }],
    },
  ])
  .core(({ context, self }) => {
    let width = 0
    let height = 0
    return {
      axisColor: context.color,
      ctx: /** @type {CanvasRenderingContext2D | null} */ null,
      /** @param {HTMLCanvasElement} canvas */
      set2DContext(canvas) {
        if (!canvas) return
        self.ctx = canvas.getContext("2d")
        width = canvas.width / (window.devicePixelRatio || 1)
        height = canvas.height / (window.devicePixelRatio || 1)
      },
      /** Обновление размеров canvas
       * @param {HTMLElement} component */
      resize(component) {
        const rect = component.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const canvas = component.shadowRoot?.querySelector("canvas")
        if (!canvas) {
          console.error("Canvas not found")
          return
        }
        width = rect.width * dpr
        height = rect.height * dpr
        canvas.width = width
        canvas.height = height
        if (self.ctx) {
          self.ctx.scale(dpr, dpr)
        }
      },
      draw() {
        console.log("draw", width, height)
        if (!self.ctx) return
        self.ctx.clearRect(0, 0, width, height)

        const scale = context.scale
        const translateX = context.translateX
        const translateY = context.translateY

        const xStart = (0 - translateX) / scale
        const xEnd = (width - translateX) / scale
        const yStart = (0 - translateY) / scale
        const yEnd = (height - translateY) / scale

        const startX = Math.floor(xStart / context.size) * context.size
        const startY = Math.floor(yStart / context.size) * context.size

        // Рисуем обычные линии
        self.ctx.strokeStyle = context.color
        self.ctx.lineWidth = context.lineWidth
        self.ctx.beginPath()

        for (let x = startX; x <= xEnd; x += context.size) {
          if (Math.abs(x) < 1e-6) continue
          const xCanvas = x * scale + translateX + 0.5
          self.ctx.moveTo(xCanvas, 0)
          self.ctx.lineTo(xCanvas, height)
        }

        for (let y = startY; y <= yEnd; y += context.size) {
          if (Math.abs(y) < 1e-6) continue
          const yCanvas = y * scale + translateY + 0.5
          self.ctx.moveTo(0, yCanvas)
          self.ctx.lineTo(width, yCanvas)
        }
        self.ctx.stroke()

        // Рисуем центральные линии
        self.ctx.strokeStyle = this.axisColor
        self.ctx.lineWidth = context.lineWidth
        self.ctx.beginPath()

        self.ctx.moveTo(translateX + 0.5, 0)
        self.ctx.lineTo(translateX + 0.5, height)

        self.ctx.moveTo(0, translateY + 0.5)
        self.ctx.lineTo(width, translateY + 0.5)

        self.ctx.stroke()
      },
    }
  })
  .actions({
    removeAxis({ core }) {
      core.axisColor = "rgb(228, 33, 33)"
      core.draw()
    },
    addAxis({ core }) {
      core.axisColor = "rgb(164, 147, 147)"
      core.draw()
    },
  })
  .view({
    onMount: ({ component, core }) => {
      core.resize(component)
      core.draw()
      console.log("mount", component)
    },
    render: ({ html, core }) => html`<canvas ${ref(core.set2DContext)} />`,
    style: ({ css }) => css`
      :host {
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
    `,
  })
  .create({
    state: "Инициализация",
    onUpdate: (values) => {
      console.log("onUpdate", values)
    },
    onTransition: (oldState, newState) => {
      console.log("onTransition", oldState, newState)
    },
  })
