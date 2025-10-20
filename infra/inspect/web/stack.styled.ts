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
    height: calc(var(--panel-height) * 1px);
    width: auto;
    z-index: 1000;
    background-color: rgba(30, 30, 30, var(--panel-opacity));
    border-top: 1px solid #333;
    padding: 0;
    box-shadow: none;
    max-width: 100vw;
    max-height: 100vh;
    overflow: hidden;
    margin: 0;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 11px;
    line-height: 1.3;
    color: #cccccc;
  }

  /* Позиции панели */
  :host.position-bottom {
    bottom: 0 !important;
    top: auto !important;
    left: 0 !important;
    right: 0 !important;
    height: calc(var(--panel-height) * 1px) !important;
    width: auto !important;
    flex-direction: column !important;
    border-top: 1px solid #333 !important;
    border-left: none !important;
    border-right: none !important;
    border-bottom: none !important;
  }

  :host.position-top {
    top: 0 !important;
    bottom: auto !important;
    left: 0 !important;
    right: 0 !important;
    height: calc(var(--panel-height) * 1px) !important;
    width: auto !important;
    flex-direction: column !important;
    border-bottom: 1px solid #333 !important;
    border-left: none !important;
    border-right: none !important;
    border-top: none !important;
  }

  :host.position-left {
    left: 0 !important;
    right: auto !important;
    top: 0 !important;
    bottom: 0 !important;
    width: calc(var(--panel-height) * 1px) !important;
    height: auto !important;
    flex-direction: column !important;
    border-right: 1px solid #333 !important;
    border-left: none !important;
    border-top: none !important;
    border-bottom: none !important;
  }

  :host.position-right {
    right: 0 !important;
    left: auto !important;
    top: 0 !important;
    bottom: 0 !important;
    width: calc(var(--panel-height) * 1px) !important;
    height: auto !important;
    flex-direction: column !important;
    border-left: 1px solid #333 !important;
    border-right: none !important;
    border-top: none !important;
    border-bottom: none !important;
  }

  /* Стили для сворачивания панели */
  :host.collapsed {
    transition: height 0.3s ease, width 0.3s ease !important;
  }

  /* Сворачивание для нижней позиции */
  :host.position-bottom.collapsed {
    height: 32px !important;
  }

  /* Сворачивание для верхней позиции */
  :host.position-top.collapsed {
    height: 32px !important;
  }

  /* Сворачивание для левой позиции */
  :host.position-left.collapsed {
    width: 32px !important;
  }

  /* Сворачивание для правой позиции */
  :host.position-right.collapsed {
    width: 32px !important;
  }

  /* Скрытие содержимого при сворачивании */
  :host.collapsed stack-table {
    display: none !important;
  }

  /* Показ только панели управления при сворачивании */
  :host.collapsed control-panel {
    display: flex !important;
    visibility: visible !important;
  }

  /* Скрытие resize handle при сворачивании */
  :host.collapsed .resize-handle {
    display: none !important;
  }

  /* Handle для изменения размера */
  .resize-handle {
    position: absolute;
    z-index: 1001;
    transition: background 0.2s ease;
  }

  /* Resize handle для верхней и нижней позиций */
  :host.position-bottom .resize-handle,
  :host.position-top .resize-handle {
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: #555;
    cursor: ns-resize;
    opacity: 0.2;
  }

  /* Resize handle для левой и правой позиций */
  :host.position-left .resize-handle,
  :host.position-right .resize-handle {
    top: 0;
    left: 0;
    bottom: 0;
    width: 1px;
    background: #555;
    cursor: ew-resize;
    opacity: 0.2;
  }

  .resize-handle:hover {
    background: #666;
    opacity: 0.6;
  }

  .resize-handle:active {
    background: #777;
    opacity: 0.8;
  }
`
