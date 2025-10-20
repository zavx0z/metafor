const css = String.raw
export const style = css`
  :host {
    display: block;
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
`
