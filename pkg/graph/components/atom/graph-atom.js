import "../state/graph-state.js"
import "./atom-svg.js"
import ID from "../../id.js"
import {extractTriggers} from "../../../layout/triggers.js"

customElements.define(
  "graph-atom",
  class extends HTMLElement {
    viewport

    constructor() {
      super()
      this.classList.add("backdrop")
      const [header, content] = /** @type {[HTMLElement, HTMLElement]} */ (
        html`
          <header data-drag-selector="graph-atom">
            <div><!--кнопки слева--></div>
            <h2 class="noselect">${this.getAttribute("name")}</h2>
            <div>
              <!--кнопки справа-->
              <button aria-label="Редактировать">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor">
                  <path
                    d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                </svg>
              </button>
            </div>
          </header>
          <section class="content" data-drag-selector="graph-atom">
            <atom-svg></atom-svg>
          </section>
        `(this)
      )
      this.header = header
      this.content = content
      this.viewport = this.closest("quantum-viewport")
      this.context = {}
      this.state = this.getAttribute("state") || "INITIAL_STATE"
    }

    /** @param {{atom:QMachineSnapshot}} props */
    render({atom}) {
      extractTriggers(atom).map(trigger =>
        html`
          <graph-trigger id="${trigger.id}"></graph-trigger>
        `(this.content, trigger)
      )
      atom.states.map(state =>
        html`
          <graph-state id="${ID.stateId({atom: atom.id, state})}" name="${state}"></graph-state>
        `(this.content, {types: atom.types, context: atom.context, action: atom.collapses.find(collapse => collapse.from === state)?.action})
      )
    }

    /**
     * Метод для обновления контекста атома
     * @param {Record<string, any>} context - Новые значения контекста
     */
    updateContext(context) {
      for (const [key, value] of Object.entries(context)) {
        const parameters = this.querySelectorAll(`graph-parameter[data-key="${key}"]`)
        parameters.forEach(param => {
          const parameter = /** @type {QGraphParameter} */ (param)
          const input = parameter.querySelector("input")
          if (!input) return

          const oldValue = input.value
          input.value = value
          if (oldValue !== value) {
            parameter.highlightValue()
          }
        })
      }
    }

    /**
     * Метод для обновления состояния атома.
     * @param {string} newState - Новое состояние.
     */
    updateState(newState) {
      this.state = newState
      this.setAttribute("state", newState)
      this.querySelectorAll("graph-state").forEach(node => {
        const state = /** @type {QGraphState} */ (node)
        state.deactivate()
      })
      const id = ID.stateId({atom: this.id, state: newState})
      const nodeContext = /** @type {QGraphState} */ (document.getElementById(id))
      nodeContext?.activate()
    }
  }
)
css`
  graph-atom {
    --width: 1000;
    --height: 4444;
    --font-color: rgb(var(--surface-50));

    --background-color: rgba(var(--surface-100) / calc(var(--background-alpha) * 0.1));
    .theme-dark & {
      --background-color: rgba(var(--surface-900) / var(--background-alpha));
    }

    position: absolute;
    user-select: none;
    will-change: transform;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    border-radius: var(--border-radius);

    opacity: 0;
    transition: opacity 0.2s ease-in-out;

    & > section {
      display: flex;
      position: relative;
      background-color: var(--background-color);
      width: calc(var(--width) * 1px);
      height: calc(var(--height) * 1px);
      border-bottom-right-radius: inherit;
      border-bottom-left-radius: inherit;
    }
    header {
      --background-color: rgba(var(--surface-500) / var(--background-alpha));

      height: calc(var(--node-header-height, 36) * 1px);
      position: relative;
      z-index: 2;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background-color: var(--background-color);
      box-sizing: border-box;
      user-select: none;
      border-top-left-radius: inherit;
      border-top-right-radius: inherit;
      & > div:first-child {
        flex: 1;
        display: flex;
        gap: 4px;
        padding-left: 4px;
      }
      & > h2 {
        flex: 1;
        text-align: center;
        margin: 0;
        padding: 0;
      }
      & > div:last-child {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        padding-right: 4px;
        gap: 4px;
      }
      button {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        border-radius: 4px;
        color: var(--font-color);
        &:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        & svg {
          display: block;
        }
      }
    }
    svg.connections path {
      &.next {
        stroke: rgb(var(--secondary-500));
      }
      &.active {
        stroke: rgb(var(--secondary-500));
      }
      &.preview {
        stroke: rgb(var(--primary-500));
      }
    }
    trigger-parameter {
      &.next:before {
        background-color: rgb(var(--secondary-700) / var(--background-alpha)) !important;
      }

      &.preview:before {
        background-color: rgb(var(--primary-700)) !important;
      }
    }

    graph-state {
      &.active {
        &:before {
          --border-color: rgba(var(--secondary-50)) !important;
          box-shadow: 0 0 4px 2px rgba(var(--secondary-500));
        }

        & > state-header {
          background: rgb(var(--secondary-500) / var(--background-alpha));
        }
      }

      &.next {
        /* box-shadow: 0 0 var(--node-shadow-size) rgba(var(--tertiary-900)); */

        & > state-header {
          background-color: rgba(var(--secondary-500) / var(--background-alpha));
        }
      }

      &.preview {
        &:before {
          box-shadow: 0 0 var(--node-shadow-size) rgba(var(--primary-500));
        }

        &:hover {
          & > state-header {
            background-color: rgba(var(--primary-500) / var(--background-alpha));
          }
        }

        &:not(:hover) {
          & > state-header {
            background-color: rgba(var(--primary-700) / var(--background-alpha));
          }
        }
      }
    }
  }
`()
