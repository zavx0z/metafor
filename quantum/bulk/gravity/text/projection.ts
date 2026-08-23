import type { BufferGeometry } from "@metafor/engine"
import type { BendTextAroundEquatorOptions } from "@bulk/types/text"

/**
 * Деформация текста по экватору поверхности (horizontal bend only).
 *
 * Горизонтальная составляющая текста изгибается по дуге радиуса `curveRadius`,
 * вертикальная остаётся плоской. Это сохраняет «налепленность» на поверхность для
 * широкого текста, но исключает риск схода descender/ascender за силуэт меридиана —
 * `y`/`g`/`p`/`f`/`h` всегда остаются в своей вертикальной позиции в локальном frame
 * контейнера, который ориентирован на камеру.
 *
 * Контейнер текста позиционирован в `labelPos` (ближайшая к камере точка на поверхности)
 * и ориентирован `(right, up, normal)`, поэтому локальная ось X = касательная вдоль параллели,
 * Y = касательная вдоль меридиана, Z = outward normal. Изгиб применяется в локальных координатах.
 */
const getPositionArray = (geometry: BufferGeometry): Float32Array | null => {
  const array = geometry.attributes.position?.array
  return array instanceof Float32Array ? array : null
}

const markGeometryPositionsDirty = (geometry: BufferGeometry): void => {
  const attribute = geometry.attributes.position
  if (attribute) attribute.needsUpdate = true
}

/**
 * Изгибает text-геометрию вдоль параллели радиуса `curveRadius` без проекции на меридиан.
 *
 * Преобразование применяется в локальных координатах контейнера:
 * - X = `sin(angle) × curveRadius` (позиция на дуге)
 * - Y = оригинальное `y × scale` (без изменения по меридиану)
 * - Z = `(cos(angle) − 1) × curveRadius` (глубина, так что `angle=0` на Z=0)
 *
 * где `angle = arcOffset / curveRadius`, `arcOffset = (initial.x − centerX) × scale`.
 */
export const bendTextAroundEquator = ({
  geometry,
  initialPositions,
  centerX,
  scale,
  curveRadius,
}: BendTextAroundEquatorOptions): void => {
  const positions = getPositionArray(geometry)
  if (!positions || positions.length === 0) return

  const safeRadius = Math.max(Math.abs(curveRadius), 1e-6)

  for (let i = 0; i < initialPositions.length; i += 3) {
    const arcOffset = ((initialPositions[i] ?? 0) - centerX) * scale
    const verticalOffset = (initialPositions[i + 1] ?? 0) * scale
    const angle = arcOffset / safeRadius

    positions[i] = Math.sin(angle) * safeRadius
    positions[i + 1] = verticalOffset
    positions[i + 2] = (Math.cos(angle) - 1) * safeRadius
  }

  markGeometryPositionsDirty(geometry)
}
