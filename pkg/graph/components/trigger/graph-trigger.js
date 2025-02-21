import ID from "../../id.js"
import "./trigger-parameter.js"
css`
  graph-trigger {
    --shadow-size: 0.5 !important;
    --background-color: rgba(var(--surface-400)) !important;
    position: absolute;
    display: flex;
    border-radius: 4px;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    width: auto;
  }
`
customElements.define(
  "graph-trigger",
  class extends HTMLElement {
    /** @param {import('@quantum/layout/types/index.js').GraphTrigger} trigger */
    render(trigger) {
      trigger.ports.map(port => {
        const {atom, from, to, param} = ID.parseTriggerPortId(port.id)
        const id = ID.triggerParameterId({atom, from, to, param})
        return html`
          <trigger-parameter port="${port.id}" id="${id}"></trigger-parameter>
        `(this, {port})
      })
    }
  }
)
