const css = String.raw
export const style = css`
  :host {
    display: block;
    flex: 1;
    overflow: hidden;
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
`
