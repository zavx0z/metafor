// language=CSS
css`
  q-node {
    display: flex;
    min-height: 60px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    position: relative;
    padding: 8px 8px 8px 16px;
    font-family: monospace;
    color: #fff;

    & .input-socket {
      position: absolute;
      left: -8px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      background: #444;
      border-radius: 50%;
      cursor: pointer;

      &[connected] {
        background: #66bb6a;
      }

      & .debug-info {
        white-space: pre;
        font-size: 12px;
      }
    }
  }
`()

export class QNode extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="input-socket" id="input"></div>
      <div class="debug-info"></div>
    `
  }

  /**
   * Устанавливает отладочную информацию
   * @param {Object} info - Объект с отладочной информацией
   */
  setDebugInfo(info) {
    const debugInfo = this.querySelector(".debug-info")
    if (!debugInfo) {
      console.error("Debug info element not found")
      return
    }
    debugInfo.textContent = JSON.stringify(info, null, 2)
  }
}

customElements.define("q-node", QNode)
