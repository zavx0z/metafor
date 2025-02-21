/**
 * Заголовок ноды состояния
 * @typedef {Object} StateHeaderProps
 * @property {string} name - Имя состояния
 */

customElements.define(
  "state-header",
  class extends HTMLElement {
    /** @param {StateHeaderProps} props */
    render({name}) {
      return html`
        <h2 class="noselect">${name}</h2>
      `(this)
    }
  }
)

css`
  state-header {
    padding: 8px 24px;
    background-color: rgba(var(--surface-400) / var(--background-alpha));
    border-radius: var(--border-radius);
    position: relative;
    font-weight: 800;
    letter-spacing: 0.02em;
    & h2 {
      margin: 0;
    }
  }
`()
