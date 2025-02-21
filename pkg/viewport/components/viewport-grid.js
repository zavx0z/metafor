import {ref} from "../../html/directives/ref.js"
import {Atom} from "../../machine/atom.js"

Atom("quantum-grid")
  .states("IDLE")
  .context(t => ({
    scale: t.number({title: "Масштаб сетки", default: 1}),
    size: t.number({title: "Размер сетки", default: 100}),
    translateX: t.number({title: "Смещение по X", default: 100}),
    translateY: t.number({title: "Смещение по Y", default: 100}),
    color: t.string({title: "Цвет сетки", default: "rgb(228, 33, 33)"}),
    mainColor: t.string({title: "Цвет центральных линий", default: "rgb(164, 147, 147)"}),
    lineWidth: t.number({title: "Толщина сетки", default: 1}),
    mainLineWidth: t.number({title: "Толщина центральных линий", default: 2})
  }))
  .collapses([])
  .core(({context, self}) => {
    let width = 0
    let height = 0
    return {
      ctx: /** @type {CanvasRenderingContext2D | null} */ (null),
      /** @param {HTMLCanvasElement} canvas */
      set2DContext(canvas) {
        console.log("set2DContext", canvas)
        if (!canvas) return
        self.ctx = canvas.getContext("2d")
        width = canvas.width / (window.devicePixelRatio || 1)
        height = canvas.height / (window.devicePixelRatio || 1)
      },
      /** Обновление размеров canvas
       * @param {HTMLElement} component
       */
      resize(component) {
        console.log("resize", component)
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
        self.ctx.strokeStyle = context.mainColor
        self.ctx.lineWidth = context.mainLineWidth
        self.ctx.beginPath()

        self.ctx.moveTo(translateX + 0.5, 0)
        self.ctx.lineTo(translateX + 0.5, height)

        self.ctx.moveTo(0, translateY + 0.5)
        self.ctx.lineTo(width, translateY + 0.5)

        self.ctx.stroke()
      }
    }
  })
  .actions({})
  .view({
    mount: ({component, core}) => {
      console.log("mount", component)
      core.resize(component)
      core.draw()
    },
    render: ({html, core}) => html`
      <canvas ${ref(core.set2DContext)} />
    `,
    style: ({css}) => css`
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
    `
  })
  .create({
    state: "IDLE",
    context: {},
    onUpdate: values => {
      console.log("onUpdate", values)
    }
  })
