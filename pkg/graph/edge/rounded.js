/**
 * Создает SVG путь с простыми скруглениями
 * @param {Point[]} points - Массив точек пути
 * @param {number} radius - Радиус скругления углов
 * @returns {string} SVG path data
 */
export function getSimpleRoundedPath(points, radius) {
  if (points.length < 2) return ""

  /** @type {string[]} */
  const path = []

  // Начальная точка
  path.push(`M ${points[0].x} ${points[0].y}`)

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    if (prev.y === curr.y) { // Горизонтальный сегмент
      path.push(`L ${curr.x - Math.sign(curr.x - prev.x) * radius} ${curr.y}`)
      path.push(`Q ${curr.x} ${curr.y} ${curr.x} ${curr.y + Math.sign(next.y - curr.y) * radius}`)
    } else { // Вертикальный сегмент
      path.push(`L ${curr.x} ${curr.y - Math.sign(curr.y - prev.y) * radius}`)
      path.push(`Q ${curr.x} ${curr.y} ${curr.x + Math.sign(next.x - curr.x) * radius} ${curr.y}`)
    }
  }

  // Последний сегмент
  const last = points[points.length - 1]
  path.push(`L ${last.x} ${last.y}`)

  return path.join(" ")
}