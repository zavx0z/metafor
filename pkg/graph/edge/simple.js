/**
 * Создает SVG путь по точкам без модификаций
 * @param {Point[]} points - Массив точек пути
 * @returns {string} SVG path data
 */
export function getDirectPath(points) {
  if (points.length < 2) return ""

  /** @type {string[]} */
  const path = []

  // Начальная точка
  path.push(`M ${points[0].x} ${points[0].y}`)

  // Остальные точки как линейные сегменты
  for (let i = 1; i < points.length; i++) {
    path.push(`L ${points[i].x} ${points[i].y}`)
  }

  return path.join(" ")
}