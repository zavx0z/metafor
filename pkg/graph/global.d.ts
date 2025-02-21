declare global {
  /**
   * Компонент квантового графа
   * @interface QGraph
   * @extends HTMLElement
   * @property channel - Канал для коммуникации между компонентами
   * @property viewport - Элемент viewport для отображения графа
   * @property addAtom - Метод для добавления нового атома в граф
   * @property handlePatch - Метод для обработки патчей обновления графа
   * @property updateContext - Метод для обновления контекстных значений атома
   * @property updateState - Метод для обновления состояния атома
   */
  interface QGraph extends HTMLElement {
    channel: BroadcastChannel
    viewport: QViewport
    addAtom(snapshot: QMachineSnapshot<any, any>): Promise<QGraphAtom & HTMLElement>
    handlePatch(patch: { op: string; path: string; value: any }): Promise<void>
    updateContext(atom: HTMLElement, context: QMachineContextData<any>): void
    updateState(atom: HTMLElement, newState: string, atomPath: string): void
  }

  /**
   * Описание точки в пространстве
   * @interface QGraphPoint
   * @property x - Координата по оси X
   * @property y - Координата по оси Y
   */
  interface QGraphPoint {
    x: number
    y: number
  }

  /**
   * Описание ребра графа
   * @interface QGraphEdge
   * @property id - Идентификатор ребра
   * @property points - Массив точек, определяющих путь ребра
   */
  interface QGraphEdge {
    id: string
    points: Array<QGraphPoint>
  }

  /**
   * Описание метрик для триггеров
   * @interface QGraphTriggerMetrics
   * @property portSpacing - Расстояние между портами
   * @property sizes - Размеры триггеров
   */
  interface QGraphTriggerMetrics {
    portSpacing: number
    sizes: { [key: string]: [number, number] }
  }

  /**
   * Описание узла графа ELK
   * @interface QGraphElkNode
   * @property id - Идентификатор узла
   * @property width - Ширина узла
   * @property height - Высота узла
   * @property x - Позиция по X
   * @property y - Позиция по Y
   */
  interface QGraphElkNode {
    id: string
    width?: number
    height?: number
    x?: number
    y?: number
  }

  /**
   * Компонент параметра графа
   * @interface QGraphParameter
   * @extends HTMLElement
   */
  interface QGraphParameter extends HTMLElement {
    highlightValue(): void
  }

  /**
   * Компонент триггера графа
   * @interface QGraphTrigger
   * @extends HTMLElement
   * @property layout - Параметры расположения триггера
   */
  interface QGraphTrigger extends HTMLElement {
    layout: {
      id: string
      width: number
      height: number
      ports: Array<{
        id: string
        width: number
        height: number
        x: number
        y: number
      }>
      x: number
      y: number
    }
  }

  /**
   * Компонент параметра триггера
   * @interface QGraphTriggerParameter
   * @extends HTMLElement
   */
  interface QGraphTriggerParameter extends HTMLElement {
  }

  /**
   * Компонент сокета графа
   * @interface QGraphSocket
   * @extends HTMLElement
   * @property svg - SVG элемент для отрисовки соединений
   */
  interface QGraphSocket extends HTMLElement {
    svg: SVGSVGElement | null
  }

  /**
   * Описание размеров узлов в графе
   * @interface QGraphNodeMetrics
   * @property size - Размер узла
   * @property sockets - Сокеты узла
   */
  interface QGraphNodeMetrics {
    size: [number, number]
    sockets: { [key: string]: [[number, number], [number, number]] }
  }
}

export {}
