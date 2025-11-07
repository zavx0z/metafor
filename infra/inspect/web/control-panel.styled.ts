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
    background-color: #274044;
    border-bottom: 1px solid #333;
    margin: 0;
    height: 26px;
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

  .control-panel[data-layout="vertical"] .step-delay-container {
    flex-direction: column;
    gap: 2px;
    margin-left: 0;
  }

  .control-panel[data-layout="vertical"] .step-delay-slider {
    width: 100%;
    height: 3px;
    transform: rotate(90deg);
    transform-origin: center;
  }

  .control-panel[data-layout="vertical"] .step-delay-value {
    font-size: 8px;
    min-width: auto;
  }

  /* Левая группа (корзина + слайдер) */
  .left-group {
    display: flex;
    align-items: center;
    /* gap: 7px; */
    height: 100%;
    padding: 1px 2px;
  }

  /* Кнопки панели: единый базовый стиль */
  .control-panel button {
    background: transparent;
    border: none;
    border-radius: 100px;
    width: 26px;
    height: 26px;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    outline: none;
    padding: 0;
    color: #ccc;
  }

  .control-panel button:hover {
    background: #3e575b;
  }

  .control-panel button:active {
    background: #4e6e73;
  }

  /* Меню в стиле DevTools */
  .menu {
    position: absolute;
    top: 32px;
    left: 4px;
    background: #1f1f1f;
    border: 1px solid #333;
    border-radius: 4px;
    min-width: 220px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    padding: 6px 0;
    z-index: 1002;
  }

  .menu.hidden {
    display: none;
  }

  .menu-section {
    padding: 6px 8px;
  }

  .menu-title {
    color: #aaa;
    font-size: 11px;
    padding: 2px 4px 6px;
  }

  .dock-grid {
    display: grid;
    grid-template-columns: repeat(4, 28px);
    gap: 6px;
    padding: 0 4px 4px;
  }

  .dock-btn {
    background: #262626;
    color: #ccc;
    border: 1px solid #333;
    border-radius: 2px;
    width: 28px;
    height: 24px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }

  .dock-btn:hover {
    background: #2f2f2f;
  }

  .dock-btn.active {
    border-color: #4a90e2;
    box-shadow: 0 0 0 1px #4a90e2 inset;
  }

  /* Ползунок прозрачности внутри меню */
  .menu .opacity-slider {
    width: 180px;
    height: 2px;
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
    padding: 1px 2px;
  }

  /* Контейнер для слайдера замедления */
  .step-delay-container {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 4px;
  }

  /* Слайдер замедления выполнения на панели */
  .step-delay-slider {
    width: 80px;
    height: 2px;
    background: #444;
    border-radius: 1px;
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
  }

  .step-delay-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 8px;
    height: 8px;
    background: #666;
    border-radius: 1px;
    cursor: pointer;
    border: none;
  }

  .step-delay-slider::-moz-range-thumb {
    width: 8px;
    height: 8px;
    background: #666;
    border-radius: 1px;
    cursor: pointer;
    border: none;
  }

  .step-delay-value {
    color: #aaa;
    font-size: 10px;
    min-width: 35px;
    text-align: left;
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

  /* Индивидуальные цвета */
  .debug-btn,
  .collapse-btn,
  .menu-btn {
    color: #ccc;
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

  /* Кнопка очистки стека: красный цвет */
  .clear-btn {
    color: #ff6666;
  }
`
