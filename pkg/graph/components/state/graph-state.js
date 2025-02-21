import "../trigger/graph-trigger.js"
import "../graph-socket.js"
import "../context/graph-parameter.js"
import "./state-header.js"

import ID, {parseStateId} from "../../id.js"


css`
  graph-state {
    --background-color: rgba(var(--surface-600) / var(--background-alpha));

    position: absolute;
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius);
    transition: box-shadow 0.3s ease-in-out;
    box-sizing: border-box;

    & > section {
      background: var(--background-color);
    }

    &:has(> :nth-child(2)) {
      & > state-header {
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;

        &::before {
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
        }
      }
    }

    &:has(> :nth-child(2)) {
      section {
        padding: 8px 8px 0 8px;
        display: flex;
        flex-direction: column;
        position: relative;
        background-color: var(--background-color);

        &:last-child {
          padding-bottom: 8px;
          border-bottom-left-radius: var(--border-radius);
          border-bottom-right-radius: var(--border-radius);
        }
      }
    }
  }
`()

customElements.define(
  "graph-state",
  class extends HTMLElement {
    /** @type {SVGSVGElement|null} */
    svg = null

    constructor() {
      super()
      this.classList.add("backdrop")
      this.header = /**@type {HTMLElement}*/ (
        html`
          <state-header></state-header>
        `(this, {name: this.getAttribute("name")})
      )
    }

    /**
     * @param {{
     *   types: Record<string, any>,
     *   context: Record<string, any>,
     *   action?: string
     * }} props
     */
    render({types, context, action}) {
      const {atom: atomName, state: stateName} = ID.parseStateId(this.id.toString())
      const typeNameArray = Object.keys(types)
      html`
        <section>
          ${typeNameArray.map(parameter =>
            html`
              <graph-parameter
                id="${ID.contextParameterId({atom: atomName, state: stateName, param: parameter})}"
                data-key="${parameter}"
                type="${types[parameter].type}"
                name="${types[parameter].title || parameter}"
                value="${String(context[parameter])}"></graph-parameter>
            `()
          )}
        </section>
        <section>
          <button>
            <span>${action || "change"}</span>
          </button>
        </section>
      `(this)
    }

    connectedCallback() {
      const svg = this.parentElement?.querySelector("svg.connections")

      if (!svg) {
        console.warn("svg not found or invalid type")
        return
      }
      this.svg = /** @type {SVGSVGElement} */ (svg)

      this.header.addEventListener("mouseenter", this.onMouseEnter)
      this.header.addEventListener("mouseleave", this.onMouseLeave)
    }

    disconnectedCallback() {
      this.header.removeEventListener("mouseenter", this.onMouseEnter)
      this.header.removeEventListener("mouseleave", this.onMouseLeave)
    }

    onMouseEnter = () => {
      if (this.classList.contains("active") || !this.svg) return
      preview(this)
    }
    onMouseLeave = () => this.unhighlight("preview")

    activate = () => activate(this)
    deactivate = () => deactivate(this)

    /**
     * Удаляет подсветку элементов графа
     * @param {string} className - Имя класса для удаления
     */
    unhighlight(className) {
      this.classList.remove(className)
      const atom = this.closest("graph-atom")
      if (!atom) return

      this.parentElement
        ?.querySelector("svg.connections")
        ?.querySelectorAll(`path.${className}`)
        .forEach(path => path.classList.remove(className))
      atom.querySelectorAll(`graph-state.${className}`).forEach(node => node.classList.remove(className))
      atom.querySelectorAll(`trigger-parameter.${className}`).forEach(node => node.classList.remove(className))
    }
  }
)

/**
 * Подсвечивает следующие состояния графа
 * @param {QGraphState} self - Элемент состояния графа
 */
export const next = self => {
  const className = "next"
  self.classList.add(className)

  const {atom, state} = ID.parseStateId(self.id.toString())

  if (!self.svg) {
    console.warn("svg not found")
    return
  }

  Array.from(self.svg.querySelectorAll("path"))
    .filter(path => {
      const {sourceId} = ID.parseEdgeId(path.id)
      const contextPort = ID.parseContextPortId(sourceId)
      return contextPort.atom === atom && contextPort.state === state && contextPort.direction === "output"
    })
    .forEach(edge => {
      edge.classList.add(className)

      const {targetId} = ID.parseEdgeId(edge.id)
      const {atom, from, to, param} = ID.parseTriggerPortId(targetId)

      const betweenId = ID.edgeId({
        sourceId: ID.triggerPortId({atom, from, to, param, direction: "east"}),
        targetId: ID.contextPortId({atom, state: to, param, direction: "input"})
      })
      self.svg?.getElementById(betweenId)?.classList.add(className)
      const context = document.getElementById(ID.stateId({atom, state: to}))
      if (context && !context.classList.contains("active")) context.classList.add(className)
      const trigger = document.getElementById(ID.triggerParameterId({atom, from, to, param}))
      trigger?.classList.add(className)
    })
}

/**
 * Подсвечивает предварительный просмотр следующих состояний графа
 * @param {QGraphState} self - Элемент состояния графа
 */
export const preview = self => {
  const className = "preview"
  // !self.classList.contains('active') &&
  self.classList.add(className)

  const {atom, state} = parseStateId(self.id.toString())

  if (!self.svg) return

  Array.from(self.svg.querySelectorAll("path"))
    .filter(path => {
      const {sourceId} = ID.parseEdgeId(path.id)
      const contextPort = ID.parseContextPortId(sourceId)
      return contextPort.atom === atom && contextPort.state === state && contextPort.direction === "output"
    })
    .forEach(edge => {
      edge.classList.add(className)

      const {targetId} = ID.parseEdgeId(edge.id)
      const {atom, from, to, param} = ID.parseTriggerPortId(targetId)

      const betweenId = ID.edgeId({
        sourceId: ID.triggerPortId({atom, from, to, param, direction: "east"}),
        targetId: ID.contextPortId({atom, state: to, param, direction: "input"})
      })
      self.svg?.getElementById(betweenId)?.classList.add(className)

      const context = document.getElementById(ID.stateId({atom, state: to}))
      if (context && !context.classList.contains("active")) context.classList.add(className)
      const trigger = document.getElementById(ID.triggerParameterId({atom, from, to, param}))
      trigger?.classList.add(className)
    })
}

/**
 * Подсвечивает активные состояния графа
 * @param {QGraphState} self - Элемент состояния графа
 */
export const activate = self => {
  self.classList.add("active")

  const {atom, state} = parseStateId(self.id.toString())

  if (!self.svg) return

  Array.from(self.svg.querySelectorAll("path"))
    .filter(path => {
      const {sourceId} = ID.parseEdgeId(path.id)
      const contextPort = ID.parseContextPortId(sourceId)
      return contextPort.atom === atom && contextPort.state === state && contextPort.direction === "output"
    })
    .forEach(edge => {
      edge.classList.add("next")

      const {targetId} = ID.parseEdgeId(edge.id)
      const {atom, from, to, param} = ID.parseTriggerPortId(targetId)

      const betweenId = ID.edgeId({
        sourceId: ID.triggerPortId({atom, from, to, param, direction: "east"}),
        targetId: ID.contextPortId({atom, state: to, param, direction: "input"})
      })
      self.svg?.getElementById(betweenId)?.classList.add("next")
      const context = document.getElementById(ID.stateId({atom, state: to}))
      context?.classList.add("next")
      const trigger = document.getElementById(ID.triggerParameterId({atom, from, to, param}))
      trigger?.classList.add("next")
    })
}

/**
 * Удаляет подсветку активных состояний графа
 * @param {QGraphState} self - Элемент состояния графа
 */
export const deactivate = self => {
  self.classList.remove("active")
  const atom = self.closest("graph-atom")
  if (!atom) return
  const className = "next"
  self.svg?.querySelectorAll(`path.${className}`).forEach(path => path.classList.remove(className))
  atom.querySelectorAll(`graph-state.${className}`).forEach(node => node.classList.remove(className))
  atom.querySelectorAll(`trigger-parameter.${className}`).forEach(node => node.classList.remove(className))
}
