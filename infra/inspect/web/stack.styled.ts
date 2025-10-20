const css = String.raw
export const style = css`
  :host {
    --panel-height: 300;
    --panel-opacity: 0.9;
    display: flex;
    flex-direction: column;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background-color: rgba(37, 37, 37, var(--panel-opacity));
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
    height: calc(var(--panel-height) * 1px);
    max-width: 100vw;
    overflow: hidden;
    margin: 0;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  /* Оптимизация для быстрого сворачивания */
  :host.collapsing .resize-handle {
    pointer-events: auto !important;
  }

  /* Handle для изменения размера */
  .resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
    cursor: ns-resize;
    z-index: 1001;
    transition: background 0.2s ease;
  }

  .resize-handle:hover {
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%);
  }

  .resize-handle:active {
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.8) 50%, transparent 100%);
  }
`
