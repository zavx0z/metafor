/**
 * Преобразует путь SVG в формат ELK
 * @param {SVGPathElement} path - Путь SVG
 * @param {HTMLElement} container - Контейнер для элементов
 * @returns {Object} Объект с параметрами пути
 */
export function parseSVGPathToELK(path, container) {
  const {id} = path
  const [source, target] = id.split("->")

  const dPath = path.getAttribute("d")
  if (!dPath) {
    throw new Error('Path attribute "d" is missing')
  }

  const pathCommands = dPath.match(/[MLQ][^MLQ]*/g)
  if (!pathCommands) {
    throw new Error("Invalid path format")
  }

  /** @type {Point[]} */
  const bendPoints = []
  /** @type {Point|null} */
  let startPoint = null
  /** @type {Point|null} */
  let endPoint = null

  pathCommands.forEach(cmd => {
    const type = cmd[0]
    const points = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number)

    if (type === "M") {
      startPoint = {x: points[0], y: points[1]}
    } else if (type === "Q") {
      const controlPoint = {x: points[0], y: points[1]}
      bendPoints.push(controlPoint)
      endPoint = {x: points[2], y: points[3]}
    } else if (type === "L") {
      endPoint = {x: points[0], y: points[1]}
    }
  })

  if (!startPoint) {
    throw new Error("Missing start point")
  }

  if (!endPoint) {
    endPoint = startPoint
  }

  const sections = [
    {
      id: `${id}_s0`,
      startPoint,
      endPoint,
      ...(bendPoints.length ? {bendPoints} : {}),
      incomingShape: source,
      outgoingShape: target
    }
  ]

  return {
    id,
    sources: [source],
    targets: [target],
    sections,
    container
  }
}