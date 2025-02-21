/**
 * Позиция ноды состояния
 * @interface NodePosition
 * @property id - Идентификатор состояния
 * @property x - Координата X
 * @property y - Координата Y
 */
export interface NodePosition {
  id: string
  x: number
  y: number
}

/**
 * Ребро графа с точками и типом
 * @interface Edge
 * @property id - Идентификатор ребра
 * @property points - Массив точек, определяющих путь ребра
 * @property type - Тип ребра: east-input, west или other
 */
export interface Edge {
  id: string
  points: Point[]
  type: "east-input" | "west" | "other"
  sections?: EdgeSection[]
  sources: string[]
  targets: string[]
}

/**
 * Структура ELK layout для состояния
 * @interface StateLayout
 * @property edges - Массив рёбер состояния
 * @property x - Координата X
 * @property y - Координата Y
 */
export interface StateLayout {
  edges?: Array<InputEdge>
  x: number
  y: number
}

/**
 * Структура ELK layout
 * @interface Layout
 * @property edges - Корневые рёбра
 * @property children - Состояния
 */
export interface Layout {
  edges?: Array<Edge>
  children?: Array<StateLayout>
}

/**
 * Секция ребра с точками пути
 * @interface EdgeSection
 * @property startPoint - Начальная точка
 * @property endPoint - Конечная точка
 * @property bendPoints - Точки изгиба
 */
export interface EdgeSection {
  startPoint: Point
  endPoint: Point
  bendPoints?: Point[]
}

/**
 * Входное ребро с секциями
 * @interface InputEdge
 * @property id - Идентификатор ребра
 * @property sections - Секции ребра
 * @property sources - Исходные точки
 * @property targets - Целевые точки
 */
export interface InputEdge {
  id: string
  sections?: EdgeSection[]
  sources: string[]
  targets: string[]
}

/**
 * Структура состояний с триггерами
 * @interface StatesTriggers
 * @property states - Словарь состояний с параметрами и триггерами
 */
export interface StatesTriggers {
  [atomID: string]: {
    [state: string]: {
      [param: string]: {
        [from: string]: Record<string, unknown>
      }
    }
  }
}
