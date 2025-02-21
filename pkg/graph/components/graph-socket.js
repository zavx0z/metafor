import {parseContextPortId} from "../id.js"
import "./q-node.js"

customElements.define(
  "graph-socket",
  class extends HTMLElement {
    /** @type {QViewport & HTMLElement} */ viewport

    constructor() {
      super()
      this.viewport = /** @type {QViewport & HTMLElement} */ (this.closest("quantum-viewport"))
      this.atom = /** @type {QGraphAtom & HTMLElement} */ (this.closest("graph-atom"))
    }

    #openMenu() {
      import("../../ui/components/menu.js").then(() => {
        const menu = /** @type {import("../../ui/components/menu.js").QUIMenu} */ (document.createElement("q-ui-menu"))
        menu.items = [
          {
            label: "Создать связь",
            action: () => this.startConnection(this.id)
          },
          {
            label: "Копировать ID",
            action: async () => {
              await navigator.clipboard.writeText(this.id)
            }
          },
          {
            label: "Отладка",
            action: () => this.showDebugInfo(this.id)
          }
        ]
        this.appendChild(menu)
      })
    }

    #closeMenu() {
      const menu = this.querySelector("q-ui-menu")
      if (menu) {
        menu.remove()
      }
    }

    /**
     * Создает соединение с новой сервисной нодой
     * @param {string} socketId - ID исходного сокета
     */
    startConnection(socketId) {
      const socket = document.getElementById(socketId)
      const rect = socket?.getBoundingClientRect()
      if (!rect) {
        console.error("Socket not found")
        return
      }

      // Создаем сервисную ноду
      const serviceNode = document.createElement("q-node")
      serviceNode.id = `service-node-${Date.now()}`
      serviceNode.style.position = "absolute"

      // Получаем позицию в масштабе viewport
      const viewportRect = this.viewport.getBoundingClientRect()
      const contentStyle = window.getComputedStyle(this.viewport.content)
      const matrix = new DOMMatrix(contentStyle.transform)

      // Вычисляем позицию ноды относительно viewport content
      const x = (rect.right - viewportRect.left) / matrix.a
      const y = (rect.top - viewportRect.top) / matrix.d

      serviceNode.style.left = `${x + 100}px`
      serviceNode.style.top = `${y}px`
      this.viewport.content.appendChild(serviceNode)

      // Создаем соединение через viewport canvas
      this.viewport.canvas.applyPatch(
        /** @type {PatchEdge} */ ({
          op: "add",
          path: `${socketId} > ${serviceNode.id}/input`,
          value: {
            source: {
              x: x,
              y: y + rect.height / 2
            },
            target: {
              x: x + 100,
              y: y + rect.height / 2
            },
            color: "#666",
            width: 2
          }
        })
      )
    }

    /**
     * Показывает отладочную информацию
     * @param {string} socketId - ID сокета
     */
    showDebugInfo(socketId) {
      const socket = document.getElementById(socketId)
      if (!socket) {
        console.error("Socket not found")
        return
      }
      const rect = socket.getBoundingClientRect()

      const debugNode = document.createElement("q-node")
      debugNode.id = `debug-node-${Date.now()}`
      debugNode.style.position = "absolute"
      debugNode.style.left = `${rect.right + 100}px`
      debugNode.style.top = `${rect.top}px`

      const addedNode = /** @type {import("./q-node.js").QNode} */ (this.viewport.content.appendChild(debugNode))

      addedNode.setDebugInfo({
        id: socketId,
        direction: parseContextPortId(socketId).direction,
        connected: socket.hasAttribute("connected")
      })

      // Создаем соединение через viewport canvas
      this.viewport.canvas.applyPatch(
        /** @type {PatchEdge} */ ({
          op: "add",
          path: `${socketId} > ${debugNode.id}/input`,
          value: {
            source: this.position,
            target: {
              x: this.position.x + 100,
              y: this.position.y
            },
            color: "#666",
            width: 2
          }
        })
      )
    }

    connectedCallback() {
      const {direction} = parseContextPortId(this.id)
      if (direction === "output") {
        this.addEventListener("mouseenter", this.#openMenu.bind(this))
        this.addEventListener("mouseleave", this.#closeMenu.bind(this))
      }
    }

    disconnectedCallback() {
      this.removeEventListener("mouseenter", this.#openMenu.bind(this))
      this.removeEventListener("mouseleave", this.#closeMenu.bind(this))
    }

    /**
     * Вычисляет абсолютную позицию сокета относительно viewport
     * @returns {{x: number, y: number}} Координаты центра сокета
     */
    get position() {
      // Получаем размеры и позицию сокета
      const socketRect = this.getBoundingClientRect()
      const viewportRect = this.viewport.getBoundingClientRect()

      // Получаем точку относительно viewport
      const viewportX = socketRect.left - viewportRect.left + socketRect.width / 2
      const viewportY = socketRect.top - viewportRect.top + socketRect.height / 2

      // Получаем матрицу трансформации viewport
      const contentStyle = window.getComputedStyle(this.viewport.content)
      const matrix = new DOMMatrix(contentStyle.transform)

      // Инвертируем матрицу и трансформируем точку
      const invMatrix = matrix.inverse()
      const point = new DOMPoint(viewportX, viewportY)
      const transformedPoint = point.matrixTransform(invMatrix)

      return {
        x: transformedPoint.x,
        y: transformedPoint.y
      }
    }
  }
)
const socketSize = 12
css`
  graph-socket {
    --socket-size: 12;
    --background-color: rgb(var(--secondary-500));

    position: absolute;
    opacity: 1;
    width: ${socketSize}px;
    height: ${socketSize}px;
    border-radius: 50%;
    box-sizing: border-box;
    border: 1px solid var(--background-color);
    background-color: var(--background-color);
    cursor: pointer;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
    transition: transform 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease;

    &[id$="input"] {
      left: -14px;
    }

    &[id$="output"] {
      right: -14px;
    }

    &::before {
      content: "";
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background-color: inherit;
      transform: scale(1);
      transition: transform 0.3s ease;
    }

    &:not(.connected) {
      filter: contrast(0.5) brightness(0.5);
      transition: all 0.3s ease;
      &::before {
        filter: contrast(0.5) brightness(0.5);
        transition: all 0.3s ease;
      }
    }

    &.connected {
      transition: all 0.3s ease;

      &::before {
        transform: scale(0.5);
      }
    }
  }
`()
