css`
  svg.connections {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;

    & path {
      stroke: rgb(var(--surface-300));
      stroke-width: 4px;
      fill: none;
      transition: stroke 0.3s ease;
      stroke-dasharray: var(--dash-length) var(--gap-length);
      stroke-dashoffset: 0;
    }
  }
`()

customElements.define(
  "atom-svg",
  class extends HTMLElement {
    constructor() {
      super()
      html`
        <svg class="connections"></svg>
      `(this)
    }
  }
)
