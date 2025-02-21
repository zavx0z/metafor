css`
  trigger-value {
    & trigger-symbol {
      color: #4caf50;
    }
  }
`

customElements.define(
  "trigger-value",
  class extends HTMLElement {
    constructor() {
      super()
      const name = this.getAttribute("name")
      const value = this.getAttribute("value")
      const symbol = this.getAttribute("symbol")
      html`
        <span class="noselect">
          <trigger-symbol>${symbol}</trigger-symbol>
          <span>${String(name)} - ${String(value)}</span>
        </span>
      `(this)
    }
  }
)
