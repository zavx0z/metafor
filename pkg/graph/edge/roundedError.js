/**
 * Проверяет "почти равенство" координат с учетом погрешности
 * @param {number} a - Первое значение
 * @param {number} b - Второе значение
 * @returns {boolean} Результат сравнения
 */
const nearlyEqual = (a, b) => Math.abs(a - b) <= 0.5
/**
 * Выравнивает точки по Y относительно начальной точки
 * @param {Point[]} points - Массив точек для выравнивания
 * @returns {Point[]} Массив выровненных точек
 */
const alignPoints = points => {
  const result = /** @type {Point[]} */ ([])
  let currentY = points[0].y

  for (const point of points) {
    if (nearlyEqual(point.y, currentY)) {
      result.push({x: point.x, y: currentY})
    } else {
      currentY = point.y
      result.push({x: point.x, y: currentY})
    }
  }
  return result
}
/**
 * Проверяет достаточность расстояния для скругления
 * @param {Point} p1 - Первая точка
 * @param {Point} p2 - Вторая точка
 * @param {number} radius - Радиус скругления
 * @returns {boolean} Возможность скругления
 */
const canRound = (p1, p2, radius) => {
  return Math.abs(p1.x - p2.x) > radius * 2 && Math.abs(p1.y - p2.y) > radius * 2
}

/**
 * Создает SVG путь со скругленными углами
 * @param {Point[]} points - Массив точек пути
 * @param {number} radius - Радиус скругления углов
 * @returns {string} SVG path data
 */
export function getRoundedPath(points, radius) {
  if (points.length < 2) return ""

  /** @type {string[]} */
  const path = []

  const alignedPoints = alignPoints(points)

  // Начальная точка
  path.push(`M ${alignedPoints[0].x} ${alignedPoints[0].y}`)

  for (let i = 1; i < alignedPoints.length; i++) {
    const prev = alignedPoints[i - 1]
    const curr = alignedPoints[i]
    const next = alignedPoints[i + 1]

    if (next && canRound(prev, next, radius)) {
      // Скругленный поворот
      if (prev.y === curr.y) {
        // Горизонтальный сегмент
        path.push(`L ${curr.x - Math.sign(curr.x - prev.x) * radius} ${curr.y}`)
        path.push(`Q ${curr.x} ${curr.y} ${curr.x} ${curr.y + Math.sign(next.y - curr.y) * radius}`)
      } else {
        // Вертикальный сегмент
        path.push(`L ${curr.x} ${curr.y - Math.sign(curr.y - prev.y) * radius}`)
        path.push(`Q ${curr.x} ${curr.y} ${curr.x + Math.sign(next.x - curr.x) * radius} ${curr.y}`)
      }
    } else {
      // Прямой сегмент
      path.push(`L ${curr.x} ${curr.y}`)
    }
  }

  return path.join(" ")
}