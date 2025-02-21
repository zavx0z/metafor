import ID from "../../id.js"

customElements.define(
  "graph-parameter",
  class extends HTMLElement {
    /** @type {ReturnType<typeof setTimeout> | null} */
    #highlightTimer = null
    #lastUpdate = 0

    constructor() {
      super()
      this.classList.add("graph-parameter")
      const {atom, state, param} = ID.parseContextParameterId(this.id)
      const paramType = this.getAttribute("type")
      console.log(this.getAttribute("value"), paramType)
      const inputSocketId = ID.contextPortId({atom, state, param, direction: "input"})
      const outputSocketId = ID.contextPortId({atom, state, param, direction: "output"})
      html`
        <graph-socket id="${inputSocketId}" data-active="false"></graph-socket>
        <span class="parameter-name noselect">${this.getAttribute("name")}</span>
        <input name="${param}" class="parameter-value" value="${this.getAttribute("value")}" />
        <graph-socket id="${outputSocketId}" data-active="false"></graph-socket>
      `(this)
    }

    render() {}

    highlightValue() {
      const now = Date.now()
      if (this.#highlightTimer) clearTimeout(this.#highlightTimer)
      this.classList.add("highlight")
      this.#lastUpdate = now
      // Всегда запускаем таймер, даже при частых обновлениях
      this.#highlightTimer = setTimeout(() => this.classList.remove("highlight"), 444)
    }
  }
)

css`
  graph-parameter {
    --background-color: rgba(var(--surface-300));

    margin: 2px 0;

    &:focus-within {
      border-color: rgba(var(--primary-500));
      box-shadow: 0 0 2px 1px rgba(var(--primary-500));
    }

    &:active {
      border-color: rgba(var(--primary-500));
    }

    &.highlight {
      &:before {
        background-color: rgba(var(--tertiary-400)) !important;
      }
      /* background-color: rgba(var(--secondary-500)); */
      /* box-shadow: 0 0 2px inset rgba(var(--secondary-900)); */
      &:not(:focus-within) {
        /* border-color: rgba(var(--secondary-500)); */
      }
    }

    & input {
      -webkit-appearance: none;
      appearance: none;
      background-color: inherit;
      margin: 0;
      width: 100%;
      height: 100%;
      text-align: right;
      border: none;
      border-radius: 3px;
      color: var(--font-color);
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
    }
  }
`()
