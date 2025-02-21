declare global {
  /**
   * Компонент состояния графа.
   * @interface QGraphState
   * @extends HTMLElement
   * @property svg - SVG элемент для отрисовки соединений
   * @property header - Заголовок состояния
   * @property activate - Активирует состояние
   * @property deactivate - Деактивирует состояние
   * @property unhighlight - Удаляет подсветку элементов графа
   */
  interface QGraphState extends HTMLElement {
    svg: SVGSVGElement | null
    header: HTMLElement
    render(any, any, any): void
    activate(): void
    deactivate(): void
    unhighlight(className: string): void
  }
}
export {}