const css = String.raw
export const style = css`
  :host {
    display: block;
  }

  /* Панель управления в стиле DevTools */
  .control-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #1e1e1e;
    border-bottom: 1px solid #333;
    margin: 0;
    height: 32px;
    position: relative;
    flex-shrink: 0;
  }

  /* Адаптивный layout для боковых позиций */
  .control-panel[data-layout="vertical"] {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    padding: 8px 4px;
    gap: 4px;
    min-height: auto;
    min-width: 20px;
  }

  .control-panel[data-layout="vertical"] .left-group,
  .control-panel[data-layout="vertical"] .center-group {
    flex-direction: column;
    align-items: center;
    gap: 4px;
    position: static;
    transform: none;
  }

  .control-panel[data-layout="vertical"] .center-group {
    order: -1;
  }

  .control-panel[data-layout="vertical"] .collapse-btn {
    align-self: center;
    margin-top: 4px;
  }

  /* Адаптация размеров для вертикального layout */
  .control-panel[data-layout="vertical"] .opacity-slider {
    width: 100%;
    height: 3px;
    transform: rotate(90deg);
    transform-origin: center;
  }

  .control-panel[data-layout="vertical"] .position-select {
    min-width: auto;
    width: 100%;
    font-size: 9px;
    padding: 1px 3px;
  }

  .control-panel[data-layout="vertical"] .debug-btn,
  .control-panel[data-layout="vertical"] .clear-btn {
    width: 16px;
    height: 16px;
    font-size: 8px;
  }

  /* Левая группа (корзина + слайдер) */
  .left-group {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 100%;
    padding: 1px 2px;
  }

  /* Центральная группа (кнопки дебага) */
  .center-group {
    display: flex;
    align-items: center;
    gap: 1px;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    height: 100%;
    padding: 1px 2px;
  }

  .opacity-slider {
    width: 60px;
    height: 2px;
    background: #444;
    border-radius: 1px;
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
  }

  .opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 8px;
    height: 8px;
    background: #666;
    border-radius: 1px;
    cursor: pointer;
    border: none;
  }

  .opacity-slider::-moz-range-thumb {
    width: 8px;
    height: 8px;
    background: #666;
    border-radius: 1px;
    cursor: pointer;
    border: none;
  }

  .position-select {
    background: #1e1e1e;
    color: #ccc;
    border: none;
    border-radius: 0;
    padding: 2px 4px;
    font-size: 11px;
    cursor: pointer;
    outline: none;
    min-width: 50px;
    height: 100%;
  }

  .position-select:hover {
    background: #2d2d2d;
    color: #ccc;
  }

  .position-select option {
    background: #1e1e1e;
    color: #ccc;
  }

  /* Кнопки управления дебагом */
  .debug-btn,
  .collapse-btn {
    background: #1e1e1e;
    color: #ccc;
    border: none;
    border-radius: 0;
    width: 32px;
    height: 100%;
    cursor: pointer;
    font-size: 11px;
    font-weight: normal;
    outline: none;
    padding: 0 4px;
  }

  .debug-btn:hover,
  .collapse-btn:hover {
    background: #2d2d2d;
    color: #ccc;
  }

  .debug-btn:active,
  .collapse-btn:active {
    background: #0d0d0d;
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
    background: #1e1e1e;
    color: #ff6666;
    border: none;
    border-radius: 0;
    width: 32px;
    height: 100%;
    cursor: pointer;
    font-size: 11px;
    font-weight: normal;
    outline: none;
  }

  .clear-btn:hover {
    background: #2d2d2d;
    color: #ff6666;
  }

  .clear-btn:active {
    background: #0d0d0d;
  }
`
