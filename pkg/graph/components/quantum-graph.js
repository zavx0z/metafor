import "./atom/graph-atom.js"
import "../../viewport/viewport.js"
import {generate} from "../../layout/template/hierarchy.js"
import ID, {atomId, parseStateId, stateId} from "../id.js"
import {collectTriggerParameters, collectTriggerPositions} from "../../layout/triggers.js"
import {collectEdges, collectNodePositions} from "../../layout/collect.js"
import ELK from "elkjs"
import {getSimpleRoundedPath} from "../edge/rounded.js"

const socketSize = 12
css`
  quantum-graph {
    color: rgb(var(--surface-50));
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }
`()

/** @type {QGraph} */
class QuantumGraph extends HTMLElement {
  /** Канал для коммуникации между компонентами */
  channel = new BroadcastChannel("graph")
  /** Worker для расчета layout графа */
  #elk = new ELK()

  /** * Инициализирует компонент и настраивает слушатели событий */
  constructor() {
    super()
    html`
      <quantum-viewport></quantum-viewport>
    `(this)

    const viewport = /**@type {QViewport} */ (this.querySelector("quantum-viewport"))
    if (!viewport) throw new Error("Viewport not found")
    this.viewport = viewport

    this.channel.addEventListener("message", event => console.log("Channel received:", event.data))
    this.channel.onmessage = async event => {
      if (!event.data.patch && !event.data.meta) return
      await this.handlePatch(event.data.patch)
    }
  }

  /**
   * Добавляет новый атом в граф
   * @param {QMachineSnapshot} snapshot - Снимок состояния атома
   * @returns {Promise<HTMLElement>}
   */
  async addAtom(snapshot) {
    const newAtom = /** @type {QGraphAtom & HTMLElement} */ (
      html`
        <graph-atom
          id="${ID.atomId({atom: snapshot.id})}"
          name="${snapshot.title || snapshot.id}"
        ></graph-atom>
      `(this.viewport.content, {atom: snapshot})
    )

    const graph = generate(snapshot, {
      triggers: (await this.measureTriggers(newAtom)) ?? {portSpacing: 0, sizes: {}},
      nodes: await this.measureNodes(newAtom),
      socketSize: 12
    })
    const layout = await this.#elk.layout(graph)

    this.positionElements(layout)
    this.orderTriggerParameters(layout)
    this.renderConnections(newAtom, layout)

    newAtom.style.setProperty("--width", String(layout.width))
    newAtom.style.setProperty("--height", String(layout.height))
    const currentStateId = stateId({atom: snapshot.id, state: snapshot.state})
    const currentState = /** @type {QGraphState} */ (document.getElementById(currentStateId))
    currentState.activate()
    requestAnimationFrame(() => {
      newAtom.style.opacity = "1"
    })
    return newAtom
  }

  /**
   * Позиционирует элементы графа согласно рассчитанному layout
   * @param {QGraphElkNode} layout - Рассчитанный layout графа
   */
  positionElements(layout) {
    for (const {id, x, y} of [...collectTriggerPositions(layout), ...collectNodePositions(layout)]) {
      const element = /** @type {HTMLElement} */ (document.getElementById(id))
      if (element) element.style.transform = `translate(${x}px, ${y}px)`
    }
  }

  /**
   * Упорядочивает параметры триггеров
   * @param {import('elkjs').ElkNode} layout - Рассчитанный layout графа
   */
  orderTriggerParameters(layout) {
    const triggerParams = collectTriggerParameters(layout)
    triggerParams.forEach((params, triggerId) => {
      const triggerNode = document.getElementById(triggerId)
      if (!triggerNode) return
      params.forEach(param => {
        const paramElement = document.getElementById(param.id)
        if (paramElement) paramElement.style.order = param.position.toString()
      })
    })
  }

  /**
   * Отрисовывает соединения между элементам графа
   * @param {HTMLElement} atom - DOM элемент атома
   * @param {import('elkjs').ElkNode} layout - Рассчитанный layout графа
   */
  renderConnections(atom, layout) {
    const edges = collectEdges(layout)
    const connections = atom.querySelector("svg.connections")
    if (connections) connections.innerHTML += this.renderEdges(edges)
  }

  /**
   * @typedef {object} Options
   * @prop {any} Options.meta
   * @prop {Patch} Options.patch
   * @param {Options} options
   * @returns {Promise<void>}
   */
  async handlePatch({meta, patch}) {
    const atom = /** @type {QGraphAtom & HTMLElement} */ (document.getElementById(atomId({atom: meta.atom})))

    switch (patch.op) {
      case "add":
        if (atom) atom.remove()
        console.log("ADD")
        await this.addAtom(patch.value)
        break

      case "remove":
        console.log("REMOVE")
        atom?.remove()
        break

      case "replace":
        if (!atom) return
        switch (patch.path) {
          case "/context":
            console.log("REPLACE-context")
            atom.updateContext(patch.value)
            break
          case "/state":
            console.log("REPLACE-state")
            atom.updateState(patch.value)
            break
          default:
            break
        }
        break

      default:
        return
    }
  }

  /**
   * Рендерит SVG пути для соединений графа
   * @param {QGraphEdge[]} edges - Массив ребер графа
   * @returns {string} SVG разметка
   */
  renderEdges = edges => {
    // Помечаем подключенные сокеты
    edges.forEach(edge => {
      const [fromId, toId] = edge.id.split(" -> ")
      const fromSocket = document.getElementById(fromId)
      const toSocket = document.getElementById(toId)
      if (fromSocket) fromSocket.classList.add("connected")
      if (toSocket) toSocket.classList.add("connected")
    })
    // return edges.map(edge => `<path id="${edge.id}" d="${getRoundedPath(edge.points, 4)}" fill="none"></path>`).join("")
    return edges.map(edge => `<path id="${edge.id}" d="${getSimpleRoundedPath(edge.points, 4)}" fill="none"></path>`).join("") // todo: добиться на уровне elk линий без погрешностей
  }

  /**
   * Измеряет размеры триггеров в DOM
   * @param {HTMLElement} atomElement - DOM элемент атома
   * @returns {Promise<QGraphTriggerMetrics>} Метрики триггеров
   */
  async measureTriggers(atomElement) {
    const triggers = /** @type {QGraphTrigger[]} */ (Array.from(atomElement.querySelectorAll("graph-trigger")))
    if (!triggers.length) {
      return Promise.resolve({portSpacing: 0, sizes: {}})
    }
    const ports = triggers[0].querySelectorAll('graph-socket[id$="west"]')
    let portSpacing

    if (ports.length < 2) {
      // TODO: Сделать прогон по всем триггерам для поиска нескольких параметров в одном состоянии для получения размера
      const param = triggers[0].querySelector("trigger-parameter")
      if (!param) {
        console.warn("No param found")
        return Promise.resolve({portSpacing: 0, sizes: {}})
      }
      const computedStyle = window.getComputedStyle(param)
      const marginTop = parseInt(computedStyle.marginTop) || 0
      const marginBottom = parseInt(computedStyle.marginBottom) || 0

      portSpacing = param.getBoundingClientRect().height + marginTop + marginBottom
    } else {
      portSpacing = ports[1].getBoundingClientRect().top - ports[0].getBoundingClientRect().top
    }

    return {
      sizes: triggers.reduce((acc, trigger) => {
        const {width, height} = trigger.getBoundingClientRect()
        /** @type {{ [key: string]: [number, number] }} */
        acc[trigger.id] = [Math.round(width), Math.round(height)]
        return acc
      }, /** @type {{ [key: string]: [number, number] }} */ ({})),
      portSpacing: Math.round(portSpacing)
    }
  }

  /**
   * Измеряет размеры узлов в DOM
   * @param {HTMLElement} atomElement - DOM элемент атома
   * @returns {Promise<{ [key: string]: QGraphNodeMetrics }>}
   */
  async measureNodes(atomElement) {
    const nodes = /** @type {QGraphState[]} */ (Array.from(atomElement.querySelectorAll("graph-state")))
    return nodes.reduce((result, nodeElement) => {
      const {width, height, left: nodeLeft, right: nodeRight, top: nodeTop} = nodeElement.getBoundingClientRect()
      const nodeState = parseStateId(nodeElement.id).state
      const sockets = Array.from(nodeElement.querySelectorAll("graph-parameter")).reduce((socketResult, paramElement) => {
        const paramBB = paramElement.getBoundingClientRect()
        const paramYOffsetCenter = paramBB.top + paramBB.height / 2 - nodeTop
        const y = Math.round(paramYOffsetCenter - socketSize / 2)
        const key = /** @type {string} */ (/** @type {HTMLElement} */ (paramElement).dataset.key)
        socketResult[key] = [
          [Math.round(nodeLeft - socketSize / 2), y],
          [Math.round(nodeRight - socketSize / 2), y]
        ]
        return socketResult
      }, /** @type {{ [key: string]: [[number, number], [number, number]] }} */ ({}))
      result[nodeState] = {size: [Math.round(width), Math.round(height)], sockets}
      return result
    }, /** @type {{ [key: string]: { size: [number, number], sockets: { [key: string]: [[number, number], [number, number]] } } }} */ ({}))
  }

  /**
   * Очищает ресурсы при удалении компонента
   */
  disconnectedCallback() {
    this.channel.close()
  }
}

customElements.define("quantum-graph", QuantumGraph)
