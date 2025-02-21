export interface Metrics {
  triggers: {
    sizes: {
      [key: string]: [number, number] // ключ - ID, значения - [ширина, высота]
    }
    portSpacing: number // расстояние между портами
  }
  nodes: {
    [state: string]: {
      size: [number, number] // размеры узла
      sockets: {
        [type: string]: [[number, number], [number, number]] // Сокеты: массив из двух координат
      }
    }
  }
  socketSize: number // размер сокета
}

/**
 * Интерфейс для конфигурации макета.
 *
 * Описывает основные параметры и настройки различных компонентов в макете.
 *
 * @property base - Основные настройки макета.
 * @property atom - Конфигурация Атома.
 * @property state - Конфигурация состояния.
 * @property trigger - Настройки триггеров.
 * @property triggerParameter - Параметры для конфигурации триггеров.
 * @property port - Настройки портов.
 */
export interface LayoutConfig {
  base: {
    "elk.layered.spacing.edgeEdgeBetweenLayers": string
    "elk.spacing.edgeEdge"?: string
    "elk.spacing.edgeNode"?: string
    hierarchyHandling: string
    "elk.layered.layering.strategy": string
    "elk.padding": string
    "considerModelOrder.strategy": string
  }
  atom: {
    "elk.spacing.nodeNode": string
    "elk.layered.nodePlacement.strategy": string
  }
  state: {
    "elk.spacing.nodeNode": string
    "elk.padding": string
    portConstraints: string
  }
  trigger: {
    "elk.spacing.nodeNode": string
    "elk.padding": string
  }
  triggerParameter: {
    portConstraints: string
    "portAlignment.west": string
  }
  port: {
    west: {
      "port.side": string
    }
  }
}