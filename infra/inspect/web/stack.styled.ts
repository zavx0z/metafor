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

  /* Панель управления */
  .control-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
    margin: 3px 0px;
    min-height: 20px;
    position: relative;
  }

  /* Левая группа (корзина + слайдер) */
  .left-group {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
  }

  /* Центральная группа (кнопки дебага) */
  .center-group {
    display: flex;
    align-items: center;
    gap: 4px;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    height: 100%;
  }

  .opacity-slider {
    width: 60px;
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .opacity-slider::-webkit-slider-thumb {
    appearance: none;
    width: 10px;
    height: 10px;
    background: #4caf50;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
  }

  .opacity-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    background: #4caf50;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
  }

  .collapse-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #e6e6e6;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    transition: background 0.2s ease, transform 0.1s ease;
    align-self: center;
  }

  .collapse-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  .collapse-btn:active {
    transform: scale(0.95);
  }

  /* Кнопки управления дебагом */
  .debug-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #e6e6e6;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: background 0.2s ease, transform 0.1s ease;
  }

  .debug-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  .debug-btn:active {
    transform: scale(0.95);
  }

  .debug-btn[disabled] {
    opacity: 0.3;
    cursor: not-allowed;
    background: rgba(255, 255, 255, 0.05);
    color: #666;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .debug-btn[disabled]:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: none;
  }

  .debug-btn[disabled]:active {
    transform: none;
    background: rgba(255, 255, 255, 0.05);
  }

  /* Кнопка очистки стека */
  .clear-btn {
    background: rgba(244, 67, 54, 0.2);
    color: #ff5252;
    border: 1px solid rgba(244, 67, 54, 0.3);
    border-radius: 2px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: background 0.2s ease, transform 0.1s ease;
  }

  .clear-btn:hover {
    background: rgba(244, 67, 54, 0.3);
    transform: scale(1.05);
  }

  .clear-btn:active {
    transform: scale(0.95);
  }

  ul {
    list-style: none;
    padding: 0 4px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /* Оптимизация для быстрого сворачивания */
  :host.collapsing ul {
    transition: none !important;
    pointer-events: none;
  }

  :host.collapsing li {
    transition: none !important;
    pointer-events: none;
  }

  /* Сохраняем pointer events для resize handle */
  :host.collapsing .resize-handle {
    pointer-events: auto !important;
  }

  li {
    padding: 8px 12px;
    display: grid;
    grid-template-columns: 80px 60px 80px 30px 100px 1fr;
    gap: 8px;
    background-color: rgba(24, 24, 24, 0.87);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    transition: background-color 0.2s ease;
  }

  li:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  li span {
    padding: 4px 6px;
    background-color: rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  li span:first-child {
    color: #888;
    font-weight: 500;
  }

  li span:nth-child(2) {
    color: #4caf50;
    font-weight: 600;
    text-transform: uppercase;
  }

  li span:nth-child(3) {
    color: #2196f3;
    font-family: monospace;
  }

  li span:nth-child(4) {
    color: #ff9800;
    font-weight: 500;
  }

  li span:last-child {
    color: #e91e63;
    font-family: monospace;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Стили для удаленных импульсов */
  li.removed {
    opacity: 0.4;
    background-color: rgba(20, 20, 20, 0.59);
    border-color: rgba(255, 255, 255, 0.05);
    transition: opacity 0.3s ease;
  }

  li.removed span {
    color: #666;
    background-color: rgba(31, 31, 31, 0.6);
  }

  li.removed span:first-child {
    color: #444;
  }

  li.removed span:nth-child(2) {
    color: #2e7d32;
  }

  li.removed span:nth-child(3) {
    color: #1565c0;
  }

  li.removed span:nth-child(4) {
    color: #ef6c00;
  }

  li.removed span:last-child {
    color: #ad1457;
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
