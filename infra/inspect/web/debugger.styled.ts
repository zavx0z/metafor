const css = String.raw
export const style = css`
  :host {
    display: flex;
    z-index: 110;
    color: #e6e6e6;
    font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  }

  :host(:not([brk])) {
    display: none;
  }

  .toolbar {
    width: max-content;
    position: fixed;
    left: 50%;
    top: 10px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 8px;
    background: #1f1f1f;
    border: 1px solid #2a2a2a;
    border-bottom: none;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    width: max-content;
  }

  .toolbar button {
    background: #2b2b2b;
    color: #e6e6e6;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    padding: 0;
    width: 40px;
    height: 28px;
    line-height: 1;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.06s ease, box-shadow 0.15s ease, opacity 0.3s ease;
    opacity: 0;
  }

  .toolbar button:hover {
    background: #343434;
    box-shadow: 0 0 0 1px #3f3f3f inset;
  }

  .toolbar button:active {
    transform: translateY(1px) scale(0.98);
    background: #272727;
  }

  .toolbar button:focus-visible {
    outline: 2px solid #4b7fff;
    outline-offset: 2px;
  }

  .toolbar button[disabled] {
    opacity: 0.3;
    cursor: not-allowed;
    background: #1a1a1a;
    color: #666;
    border-color: #2a2a2a;
  }

  .toolbar button[disabled]:hover {
    background: #1a1a1a;
    transform: none;
    box-shadow: none;
  }

  .toolbar button[disabled]:active {
    transform: none;
    background: #1a1a1a;
  }
`
