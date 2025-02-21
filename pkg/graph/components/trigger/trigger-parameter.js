import "./trigger-value.js"

css`
  trigger-parameter {
    &:before {
      --background-color: rgba(var(--surface-400));
    }

    graph-socket {
      opacity: 0;
    }
  }
`

customElements.define(
  "trigger-parameter",
  class extends HTMLElement {
    constructor() {
      super()
      this.classList.add("graph-parameter")
      this.innerHTML = `
      ${this.innerHTML}
      `
    }

    /** @param {{port: import('../../../layout/types/index.ts').TriggerPort}} props */
    render({port}) {
      html`
        <graph-socket id="${port.id}" data-active="false"></graph-socket>
        ${Object.values(port.operators).map(content =>
          html`
            <trigger-value name="${content.title}" value="${String(content.value)}" symbol="${content.symbol}"></trigger-value>
          `()
        )}
      `(this)
    }
  }
)
