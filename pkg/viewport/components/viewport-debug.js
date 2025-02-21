const config = {
  external: {
    color: theme.rgba("--secondary-500"),
    font: "10px monospace",
  },
  internal: {
    color: theme.rgba("--primary-500", 0.44),
    font: "10px monospace",
  },
  cursor: {
    color: theme.rgba("--surface-900"),
    font: "10px monospace",
  },
  edge: {
    color: theme.rgba("--secondary-500"),
    width: 2,
  },
}
const html = String.raw
const ii = html`
  <span>
    <div></div>
  </span>
`
const i = html`
  <div>
    ${[1, 2, 4].map((num) => {
      const i = num
      return html` <span>${num}</span> `
    })}
  </div>
`
/** Модуль для отладочной визуализации viewport */
export class ViewportDebug {
  /** @type {CanvasRenderingContext2D} */ ctx
  /** @type {HTMLCanvasElement} */ canvas

  /**
   * @param {import("./viewport-canvas.js").ViewportCanvas} viewportCanvas
   */
  constructor(viewportCanvas) {
    this.ctx = /** @type {CanvasRenderingContext2D} */ (viewportCanvas.ctx)
    this.canvas = viewportCanvas.canvas
  }

  /**
   * Отрисовка сетки для отладки
   * @param {QViewportState} state
   */
  drawDebugGrid(state) {
    this.drawGlobalAxes(state)
    this.drawLocalAxes(state)
  }

  /**
   * Отрисовка локальных осей координат
   * @param {QViewportState} state Состояние viewport
   */
  drawLocalAxes(state) {
    if (!this.ctx) return

    const { width, height } = this.canvas
    const step = 100

    this.ctx.save()
    this.ctx.strokeStyle = config.external.color
    this.ctx.fillStyle = config.external.color
    this.ctx.font = config.external.font
    this.ctx.lineWidth = 1

    // Рисуем оси
    this.ctx.beginPath()
    this.ctx.moveTo(0, 0)
    this.ctx.lineTo(width, 0) // Ось X
    this.ctx.moveTo(0, 0)
    this.ctx.lineTo(0, height) // Ось Y
    this.ctx.stroke()

    // Вертикальные линии и значения
    for (let x = 0; x <= width; x += step) {
      if (x) {
        // Линия
        this.ctx.beginPath()
        this.ctx.moveTo(x, 0)
        this.ctx.lineTo(x, 12)
        this.ctx.stroke()

        // Значение
        this.ctx.textAlign = "left"
        this.ctx.textBaseline = "top"
        this.ctx.fillText(`${x}px`, x + 4, 2)
      } else {
        this.ctx.textAlign = "left"
        this.ctx.textBaseline = "top"
        this.ctx.fillText(`${x}px`, x + 2, 2)
      }
    }

    // Горизонтальные линии и значения
    for (let y = 0; y <= height; y += step) {
      if (y) {
        // Линия
        this.ctx.beginPath()
        this.ctx.moveTo(0, y)
        this.ctx.lineTo(10, y)
        this.ctx.stroke()

        // Отображение значения вертикально
        this.ctx.save()
        this.ctx.translate(4, y) // Позиция текста
        this.ctx.rotate(Math.PI / 2) // Поворот на 90 градусов против часовой стрелки
        this.ctx.textAlign = "left"
        this.ctx.textBaseline = "middle"
        this.ctx.fillText(`${y}px`, 2, 0) // Позиция текста после поворота
        this.ctx.restore()
      }
    }

    this.ctx.restore()
  }

  /**
   * Отрисовка глобальных осей координат
   * @param {QViewportState} state Состояние viewport
   */
  drawGlobalAxes(state) {
    if (!this.ctx) return

    const { width, height } = this.canvas
    const { translateX, translateY, scale } = state

    this.ctx.save()
    this.ctx.strokeStyle = config.internal.color
    this.ctx.fillStyle = config.internal.color
    this.ctx.font = `${10 * scale}px monospace`
    this.ctx.lineWidth = 1 * scale

    // Горизонтальная и вертикальная оси
    this.ctx.beginPath()
    this.ctx.moveTo(0, translateY)
    this.ctx.lineTo(width, translateY)
    this.ctx.moveTo(translateX, 0)
    this.ctx.lineTo(translateX, height)
    this.ctx.stroke()

    // Вычисляем диапазон для "бесконечной" шкалы
    const step = 100 * scale
    const startX = Math.floor(-translateX / step) * step
    const endX = Math.ceil((width - translateX) / step) * step
    const startY = Math.floor(-translateY / step) * step
    const endY = Math.ceil((height - translateY) / step) * step

    // Деления и значения на оси X
    for (let x = startX; x <= endX; x += step) {
      if (x) {
        const screenX = translateX + x
        if (screenX >= 0 && screenX <= width) {
          // Деление
          this.ctx.beginPath()
          this.ctx.moveTo(screenX, translateY - 5)
          this.ctx.lineTo(screenX, translateY + 5)
          this.ctx.stroke()

          // Значение
          this.ctx.textAlign = "center"
          this.ctx.textBaseline = "top"
          this.ctx.fillText(`${Math.round(x / scale)}`, screenX, translateY + 10)
        }
      }
    }

    // Деления и значения на оси Y
    for (let y = startY; y <= endY; y += step) {
      if (y) {
        const screenY = translateY + y
        if (screenY >= 0 && screenY <= height) {
          // Деление
          this.ctx.beginPath()
          this.ctx.moveTo(translateX - 5, screenY)
          this.ctx.lineTo(translateX + 5, screenY)
          this.ctx.stroke()

          // Значение
          this.ctx.textAlign = "right"
          this.ctx.textBaseline = "middle"
          this.ctx.fillText(`${Math.round(y / scale)}`, translateX + 30, screenY)
        }
      }
    }

    // Подписи осей
    this.ctx.textAlign = "left"
    this.ctx.textBaseline = "top"
    this.ctx.fillText(`Scale: ${scale.toFixed(2)}`, 10, height - 10)

    this.ctx.restore()
  }

  /**
   * Отрисовка курсора и координат
   * @param {number} mouseX - Позиция курсора X
   * @param {number} mouseY - Позиция курсора Y
   * @param {QViewportState} state - Состояние viewport
   */
  drawCursor(mouseX, mouseY, state) {
    if (!this.ctx) return

    const { scale, translateX, translateY } = state

    // Рисуем пересекающиеся оси курсора
    this.ctx.strokeStyle = config.cursor.color
    this.ctx.lineWidth = 1
    this.ctx.beginPath()

    // Горизонтальная ось
    this.ctx.moveTo(0, mouseY)
    this.ctx.lineTo(this.canvas.width, mouseY)

    // Вертикальная ось
    this.ctx.moveTo(mouseX, 0)
    this.ctx.lineTo(mouseX, this.canvas.height)
    this.ctx.stroke()

    // Вычисляем координаты в обеих системах
    const globalX = Math.round((mouseX - translateX) / scale)
    const globalY = Math.round((mouseY - translateY) / scale)

    // Отображаем координаты и масштаб
    this.ctx.fillStyle = config.internal.color
    this.ctx.textAlign = "left"
    this.ctx.fillText(`x: ${globalX}`, mouseX + 15, mouseY + 25)
    this.ctx.fillText(`y: ${globalY}`, mouseX + 15, mouseY + 45)
    this.ctx.fillText(`scale: ${scale.toFixed(2)}`, mouseX + 15, mouseY + 65)

    // Отображаем локальные координаты у зеленых осей
    this.ctx.fillStyle = config.external.color
    // X координата
    this.ctx.textAlign = "left"
    this.ctx.fillText(`${Math.round(mouseY)}`, 20, mouseY - 2)

    // Y координата
    this.ctx.save()
    this.ctx.translate(mouseX, 4) // Позиция текста
    this.ctx.rotate(Math.PI / 2) // Поворот на 90 градусов по часовой стрелке
    this.ctx.textAlign = "left"
    this.ctx.textBaseline = "middle"
    this.ctx.fillText(`${Math.round(mouseX)}`, 20, -10)
    this.ctx.restore()
  }

  /**
   * Отрисовка отладочной информации для соединения
   * @param {Edge} edge Параметры отрисовки
   */
  drawConnection({ source, target }) {
    if (!this.ctx) return

    this.#drawConnectionPoint(source, "source")
    this.#drawConnectionPoint(target, "target")
  }

  /**
   * Отрисовка точки соединения с координатами
   * @param {Object} point Точка соединения
   * @param {number} point.x Координата X
   * @param {number} point.y Координата Y
   * @param {'source'|'target'} type Тип точки
   */
  #drawConnectionPoint(point, type) {
    if (!this.ctx) return

    // Отрисовка координат
    this.ctx.font = config.internal.font
    this.ctx.fillStyle = config.internal.color
    this.ctx.fillText(`${type}: (${Math.round(point.x)}, ${Math.round(point.y)})`, point.x + 5, point.y - 5)

    // Отрисовка точки
    this.ctx.beginPath()
    this.ctx.fillStyle = config.edge.color
    this.ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI)
    this.ctx.fill()
  }
}
/**
 * @param {import("./viewport-canvas.js").ViewportCanvas} viewportCanvas
 */
export default function (viewportCanvas) {
  if (!viewportCanvas.ctx) return
  const rect = viewportCanvas.canvas.getBoundingClientRect()
  const { viewport, ctx } = viewportCanvas
  const debug = new ViewportDebug(viewportCanvas)
  debug.drawDebugGrid(viewportCanvas.viewport.state)

  let cursorX = 0
  let cursorY = 0
  /**
   * Обработчик движения мыши
   * @param {MouseEvent} e
   * @param {import("./viewport-debug.js").ViewportDebug} _debugger
   */
  const mouseMoveHandler = (e, _debugger) => {
    viewportCanvas.draw()
    cursorX = e.clientX - rect.left
    cursorY = e.clientY - rect.top
    _debugger.drawCursor(cursorX, cursorY, viewport.state)
  }
  // Переопределяем метод draw для отрисовки сетки
  const originalDraw = viewportCanvas.draw
  viewportCanvas.draw = () => {
    originalDraw.bind(viewportCanvas)()
    debug.drawDebugGrid(viewportCanvas.viewport.state)
    debug.drawCursor(cursorX, cursorY, viewportCanvas.viewport.state)
  }
  viewportCanvas.viewport.addEventListener("mousemove", (e) => mouseMoveHandler(e, debug))
  // Переопределяем метод drawElementConnection для отрисовки линий
  const originalDrawElementConnection = viewportCanvas.drawEdge
  viewportCanvas.drawEdge = (edge) => {
    originalDrawElementConnection.bind(viewportCanvas)(edge)
    debug.drawConnection(edge)
  }
  for (const edge of viewportCanvas.edges.values()) {
    debug.drawConnection(edge)
  }
  return debug
}
