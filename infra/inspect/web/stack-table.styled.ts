const css = String.raw
export const style = css`
  :host {
    display: block;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Вертикальный layout для боковых позиций */
  :host[data-layout="vertical"] {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  :host[data-layout="vertical"] ul {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: 2px;
  }

  :host[data-layout="vertical"] li {
    width: 100%;
    grid-template-columns: 50px 30px 50px 15px 60px 1fr;
    font-size: 9px;
    padding: 3px 4px;
    min-height: 20px;
  }

  :host[data-layout="vertical"] li span {
    font-size: 8px;
    padding: 1px 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  ul {
    list-style: none;
    padding: 0 4px;
    margin: 0;
    display: flex;
    flex-direction: column;
    /* gap: 4px; */
    height: 100%;
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
    padding: 4px 8px;
    display: grid;
    grid-template-columns: 80px 60px 80px 30px 64px 1fr;
    /* gap: 8px; */
    background-color: transparent;
    border-bottom: 1px solid #444;
    border-radius: 0;
    transition: background-color 0.1s ease;
    min-height: 20px;
    font-size: 11px;
  }

  li:hover {
    background-color: rgba(40, 40, 40, var(--panel-opacity, 0.9));
  }

  li span {
    padding: 2px 4px;
    background-color: transparent;
    border-radius: 0;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  }

  li span:first-child {
    color: #999;
    font-weight: normal;
  }

  li span:nth-child(2) {
    color: #4caf50;
    font-weight: bold;
    text-transform: uppercase;
  }

  li span:nth-child(3) {
    color: #64b5f6;
    font-family: monospace;
  }

  li span:nth-child(4) {
    color: #ffb74d;
    font-weight: normal;
  }

  li span:last-child {
    color: #e5b9c8cc;
    font-family: monospace;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Стили для удаленных импульсов */
  li.removed {
    opacity: 0.4;
    border-bottom: 1px solid #444;
    transition: opacity 0.2s ease;
    background-color: rgba(40, 40, 40, var(--panel-opacity, 0.9));
  }

  li.removed span {
    color: #666;
    background-color: transparent;
  }

  li.removed span:first-child {
    color: #555;
  }

  li.removed span:nth-child(2) {
    color: #388e3c;
  }

  li.removed span:nth-child(3) {
    color: #21588fc4;
  }

  li.removed span:nth-child(4) {
    color: #664a2dbc;
  }

  li.removed span:last-child {
    color: #97315ac6;
  }

  :host([data-history-mode="true"]) li {
    background-color: rgba(100, 149, 237, 0.08);
    border-bottom-color: rgba(100, 149, 237, 0.4);
  }

  :host([data-history-mode="true"]) li span:first-child {
    color: #90caf9;
  }

  :host([data-history-mode="true"]) li span:nth-child(2) {
    color: #bbdefb;
  }
`
