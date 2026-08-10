/** Направление слоёв, выбранное engine по форме viewport. */
export type LayoutDirection = "RIGHT" | "DOWN"

/** Размер в логических пикселях. */
export type LayoutSize = Readonly<{width: number; height: number}>

/** Точка в логических пикселях. */
export type LayoutPoint = Readonly<{x: number; y: number}>

/** Прямоугольник в логических пикселях. */
export type LayoutRectangle = Readonly<{x: number; y: number; width: number; height: number}>

/**
 * Уже измеренная нода. Layout не читает её содержимое и не меняет размеры
 * листовой карточки; compound может быть расширен для своих children.
 */
export type LayoutNode = Readonly<{
  id: string
  parentId?: string
  width: number
  height: number
}>

/**
 * Видимый порт, заранее измеренный владельцем UI.
 * `y` — вертикальный offset центра сокета от верхней границы ноды.
 * Сторона не передаётся: source всегда EAST, target всегда WEST.
 */
export type LayoutPort = Readonly<{
  id: string
  nodeId: string
  y: number
}>

/**
 * Одно semantic edge между двумя точными портами.
 * Массивы ELK здесь намеренно не используются: hyperedge не входит в договор.
 */
export type LayoutEdge = Readonly<{
  id: string
  sourcePortId: string
  targetPortId: string
}>

/**
 * Числовые ограничения engine в логических пикселях.
 * Пропущенные значения получают одинаковый ритм из `spacing`.
 */
export type LayoutOptions = Readonly<{
  spacing?: number
  layerSpacing?: number
  padding?: number
  clearance?: number
}>

/**
 * Минимальный serializable graph-in договор, близкий к ELK JSON по составу:
 * измеренные nodes/ports, semantic edges, viewport и layout options.
 */
export type LayoutGraph = Readonly<{
  viewport: LayoutSize
  nodes: readonly LayoutNode[]
  ports: readonly LayoutPort[]
  edges: readonly LayoutEdge[]
  layoutOptions?: LayoutOptions
}>

/** Окончательная геометрия ноды или compound-контейнера. */
export type LayoutNodeGeometry = Readonly<LayoutRectangle & {id: string}>

/** Абсолютный центр исходного видимого порта. */
export type LayoutPortGeometry = Readonly<{id: string; x: number; y: number}>

/** Один ортогональный участок semantic edge. */
export type LayoutEdgeSection = Readonly<{
  startPoint: LayoutPoint
  bendPoints: readonly LayoutPoint[]
  endPoint: LayoutPoint
}>

/** Окончательный маршрут одного semantic edge. */
export type LayoutEdgeGeometry = Readonly<{
  id: string
  sections: readonly [LayoutEdgeSection]
}>

/**
 * Минимальный geometry-out договор. Результат не содержит исходный UI document,
 * текст, renderer state или внутренние поисковые метрики.
 */
export type LayoutResult = Readonly<{
  direction: LayoutDirection
  bounds: LayoutRectangle
  nodes: readonly LayoutNodeGeometry[]
  ports: readonly LayoutPortGeometry[]
  edges: readonly LayoutEdgeGeometry[]
}>
