import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineGlowMaterial,
  LineSegments,
  Object3D,
  Raycaster,
  Renderer,
  Space,
  SphereGeometry,
  Vector3,
  ViewPoint,
} from "@engine/core"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"
import {
  EDGE_EXAMPLE_SCHEMA,
  type StoredEdgeExample,
} from "./EdgeExample.ts"
import {
  buildThreeTorusWireGeometry,
  readStoredTorusDefaults,
  type ThreeTorusParameters,
} from "./TorusAnalysisLab.ts"

export type EdgeConstraintInput = Readonly<{
  centerDistance: number
  clearance: number
  extraLift: number
  leftDirectionDegrees?: number
  leftTangentLength?: number
  leftTorusScale?: number
  leftSphereX: number
  leftSphereY: number
  rightDirectionDegrees?: number
  rightTangentLength?: number
  rightTorusScale?: number
  rightSphereX: number
  rightSphereY: number
  sphereRadius?: number
  torusRadius: number
  torusTube: number
}>

export type EdgeConstraintPoint = Readonly<{
  x: number
  y: number
  z: number
}>

export type EdgeConstraintModel = Readonly<{
  approximateLength: number
  clearanceTransitionDistance: number
  clearanceControlScale: number
  clearanceControlHeight: number
  controlHeight: number
  curve: readonly EdgeConstraintPoint[]
  leftCenter: EdgeConstraintPoint
  leftControl: EdgeConstraintPoint
  leftControlHeight: number
  leftShapeControlHeight: number
  leftTorusCenter: EdgeConstraintPoint
  maximumHeight: number
  minimumSafetyMargin: number
  minimumTorusClearance: number
  rightCenter: EdgeConstraintPoint
  rightControl: EdgeConstraintPoint
  rightControlHeight: number
  rightShapeControlHeight: number
  rightTorusCenter: EdgeConstraintPoint
  routeVariant: EdgeRouteVariant
  shapeControlHeight: number
  sourceSink?: Readonly<{
    leftDepartureAngle: number
    leftStrength: number
    rightDepartureAngle: number
    rightStrength: number
    streamFunction: number
    verticalSafetyScale: number
  }>
  hermite?: Readonly<{
    leftDirection: EdgeConstraintPoint
    leftDirectionDegrees: number
    leftTangentLength: number
    rightDirection: EdgeConstraintPoint
    rightDirectionDegrees: number
    rightTangentLength: number
  }>
}>

export type EdgeRouteVariant = "composite" | "hermite" | "source-sink"

export const EDGE_TORUS_GAP_MM = 2
export const ELECTROMAGNETIC_CONTROL_HEIGHT_RATIO = 2 / 3

export const fieldShapeControlHeights = (
  span: number,
  leftOuterRadius: number,
  rightOuterRadius: number,
): Readonly<{left: number; right: number}> => {
  const baseHeight =
    Math.max(0, span) * ELECTROMAGNETIC_CONTROL_HEIGHT_RATIO
  const leftWeight = Math.sqrt(Math.max(Number.EPSILON, leftOuterRadius))
  const rightWeight = Math.sqrt(Math.max(Number.EPSILON, rightOuterRadius))
  const weightMean = (leftWeight + rightWeight) / 2

  return {
    left: baseHeight * leftWeight / weightMean,
    right: baseHeight * rightWeight / weightMean,
  }
}

export const defaultHermiteTangentLengths = (
  span: number,
  leftOuterRadius: number,
  rightOuterRadius: number,
): Readonly<{left: number; right: number}> => {
  const shoulders = fieldShapeControlHeights(
    span,
    leftOuterRadius,
    rightOuterRadius,
  )

  // A cubic Hermite endpoint derivative is three times the equivalent
  // cubic Bézier handle. Reusing the field shoulder handles makes the
  // default Hermite silhouette match the proven unequal-form profile.
  return {
    left: shoulders.left * 3,
    right: shoulders.right * 3,
  }
}

const FORMULA_LINK_COLORS: Readonly<Record<string, string>> = {
  p: "#ff8a3d",
  t: "#ffd166",
  sl: "#43d9ff",
  sr: "#d979ff",
  cl: "#35f2a1",
  cr: "#ff6fae",
  h: "#a78bfa",
  dt: "#ff5d5d",
  c: "#58f0d0",
  dh: "#7aa7ff",
  tl: "#00b8d9",
  tr: "#bb6bd9",
  "r-major": "#f9c74f",
  "r-tube": "#90e65c",
  rho: "#ff9fcb",
  distance: "#e9f1ff",
  "scale-left": "#36c9ff",
  "scale-right": "#d96bff",
  span: "#f4d35e",
  theta: "#ffd166",
  "g-left": "#36c9ff",
  "g-right": "#d96bff",
  psi: "#35f2a1",
  "lambda-field": "#7aa7ff",
  "d-left": "#35f2a1",
  "d-right": "#ff6fae",
  "l-left": "#36c9ff",
  "l-right": "#d96bff",
  "v-left": "#43d9ff",
  "v-right": "#ff9fcb",
}

const FORMULA_HELP: Readonly<
  Record<string, Readonly<{title: string; text: string}>>
> = {
  p: {
    title: "P(t) · точка на Edge",
    text: "Это вычисляемая точка линии связи. Все такие точки подряд образуют весь плавный Edge.",
  },
  t: {
    title: "t · положение вдоль Edge",
    text: "Число от 0 до 1: 0 — левая Sphere, 1 — правая Sphere, промежуточные значения идут между ними.",
  },
  sl: {
    title: "Sₗ · центр левой Sphere",
    text: "Начало Edge. Координаты берутся прямо из положения левой Sphere внутри отверстия Torus.",
  },
  sr: {
    title: "Sᵣ · центр правой Sphere",
    text: "Конец Edge. Координаты берутся прямо из положения правой Sphere внутри отверстия Torus.",
  },
  cl: {
    title: "Cₗ · левая control-точка",
    text: "Тянет начало кривой вверх и задаёт плавное направление выхода Edge из левой Sphere.",
  },
  cr: {
    title: "Cᵣ · правая control-точка",
    text: "Тянет конец кривой вверх и задаёт плавное направление входа Edge в правую Sphere.",
  },
  h: {
    title: "Hᵢ · локальная высота плеча",
    text: "Левое и правое плечи рассчитываются отдельно. Их кривизна следует размеру своего Torus: у большой формы плечо длиннее и плавнее, у маленькой — короче и круче.",
  },
  dt: {
    title: "dₜ · расстояние до Torus",
    text: "Кратчайшее расстояние от проверяемой точки Edge до поверхности ближайшего Torus.",
  },
  c: {
    title: "c · безопасный зазор",
    text: "Целевой зазор свободной части Edge. Внутри Sphere он равен нулю, а после выхода растёт по круглому профилю трубки Torus. Маленькая Sphere поэтому не заставляет дугу взлетать аномально высоко.",
  },
  dh: {
    title: "Δh · дополнительный подъём",
    text: "Ручная добавка к минимальной безопасной высоте. Увеличивает дугу, но не двигает её вход и выход.",
  },
  tl: {
    title: "Tₗ · левый Torus",
    text: "Левая форма-препятствие. Её положение и размеры участвуют в проверке безопасного маршрута.",
  },
  tr: {
    title: "Tᵣ · правый Torus",
    text: "Правая форма-препятствие. Её положение и размеры участвуют в проверке безопасного маршрута.",
  },
  "r-major": {
    title: "R · основной радиус Torus",
    text: "Расстояние от центра Torus до центра его трубки. Определяет общий размер кольца.",
  },
  "r-tube": {
    title: "r · радиус трубки Torus",
    text: "Толщина тела Torus от середины трубки до её поверхности.",
  },
  rho: {
    title: "ρ · радиус Sphere",
    text: "Размер сферической точки входа Edge. Sphere можно подвинуть до самого края отверстия: её поверхность коснётся внутренней поверхности Torus, но не пересечёт её.",
  },
  distance: {
    title: "D · расстояние между центрами",
    text: "Полная длина размерной стрелки от центра левого Torus до центра правого Torus.",
  },
  "scale-left": {
    title: "κₗ · масштаб левого Torus",
    text: "Умножает основной радиус и радиус трубки левого Torus. Отверстие, ограничение Sphere и маршрут Edge пересчитываются по новому размеру.",
  },
  "scale-right": {
    title: "κᵣ · масштаб правого Torus",
    text: "Умножает основной радиус и радиус трубки правого Torus. Это независимый размер правой формы.",
  },
  span: {
    title: "ℓ · пролёт между Sphere",
    text: "Прямое расстояние между центрами Sphere. Он задаёт общий масштаб дуги, после чего этот масштаб распределяется между левым и правым плечом по размерам форм.",
  },
  theta: {
    title: "θₗ · угол луча от источника",
    text: "Параметр аналитической силовой линии. Он плавно уменьшается от угла выхода из левой Sphere до нуля у правой Sphere.",
  },
  "g-left": {
    title: "gₗ · сила левого полюса",
    text: "Вес левого полюса в модели источник–сток. В этом эксперименте он равен квадратному корню из внешнего радиуса левого Torus.",
  },
  "g-right": {
    title: "gᵣ · сила правого полюса",
    text: "Вес правого полюса в модели источник–сток. Чем больше вес, тем раньше силовая линия поворачивает к этому полюсу.",
  },
  psi: {
    title: "Ψ₀ · выбранная силовая линия",
    text: "Постоянное значение функции тока. Среди линий одного физического поля стенд выбирает самую низкую, которая сохраняет заданный зазор до обоих Torus.",
  },
  "lambda-field": {
    title: "λ𝓏 · резервный масштаб безопасности",
    text: "Обычно равен 1 и линия остаётся точной линией поля. Если при крайнем смещении Sphere ни один аналитический контур семейства не обходит Torus, стенд увеличивает только высоту линии одним общим коэффициентом.",
  },
  "d-left": {
    title: "dₗ · направление выхода",
    text: "Единичный вектор задаёт направление, в котором Edge выходит из центра левой Sphere. Угол 90° совпадает с нормалью плоскости Torus.",
  },
  "d-right": {
    title: "dᵣ · направление входа",
    text: "Единичный внешний вектор правой Sphere. Edge входит в Sphere в противоположном направлении −dᵣ.",
  },
  "l-left": {
    title: "Lₗ · длина левого вектора",
    text: "Определяет длину и мягкость левого плеча Hermite-кривой, не меняя направление выхода.",
  },
  "l-right": {
    title: "Lᵣ · длина правого вектора",
    text: "Определяет длину и мягкость правого плеча Hermite-кривой независимо от левого.",
  },
  "v-left": {
    title: "Vₗ · левый граничный вектор",
    text: "Полный вектор производной в начале Edge: Vₗ = Lₗdₗ. Он задаёт и направление, и силу левого плеча.",
  },
  "v-right": {
    title: "Vᵣ · правый граничный вектор",
    text: "Производная в конце Edge направлена внутрь правой Sphere: Vᵣ = −Lᵣdᵣ.",
  },
}

export const minimumEdgeTorusCenterDistance = (
  torus: Pick<ThreeTorusParameters, "radius" | "tube">,
  leftScale = 1,
  rightScale = 1,
): number =>
  (torus.radius + torus.tube) *
  (Math.max(0.1, leftScale) + Math.max(0.1, rightScale)) +
  EDGE_TORUS_GAP_MM

export const sphereOffsetLimit = (
  torus: Pick<ThreeTorusParameters, "radius" | "tube">,
  sphereRadius: number,
): number => Math.max(0, torus.radius - torus.tube - sphereRadius)

export const constrainSphereOffset = (
  x: number,
  y: number,
  limit: number,
): Readonly<{x: number; y: number}> => {
  const safeLimit = Math.max(0, limit)
  const distance = Math.hypot(x, y)
  if (distance <= safeLimit || distance === 0) return {x, y}
  const scale = safeLimit / distance
  return {x: x * scale, y: y * scale}
}

export const edgeClearanceTransitionDistance = (
  torusTube: number,
  sphereRadius: number,
  clearance: number,
): number => {
  const safeTube = Math.max(0, torusTube)
  const safeRadius = Math.max(0, sphereRadius)
  const safeClearance = Math.max(0, clearance)
  if (safeClearance === 0) return 0

  return Math.sqrt(
    safeClearance *
      (2 * (safeTube + safeRadius) + safeClearance),
  )
}

const distance = (
  left: EdgeConstraintPoint,
  right: EdgeConstraintPoint,
): number => Math.hypot(
  right.x - left.x,
  right.y - left.y,
  right.z - left.z,
)

export const requiredEdgeClearance = (
  point: EdgeConstraintPoint,
  leftCenter: EdgeConstraintPoint,
  rightCenter: EdgeConstraintPoint,
  sphereRadius: number,
  clearance: number,
  torusTube = 0,
): number => {
  const safeClearance = Math.max(0, clearance)
  if (safeClearance === 0) return 0

  const distanceFromNearestEndpoint = Math.min(
    distance(point, leftCenter),
    distance(point, rightCenter),
  )
  const outsideDistance = Math.max(
    0,
    distanceFromNearestEndpoint - Math.max(0, sphereRadius),
  )
  const localCrossSectionRadius =
    Math.max(0, torusTube) + Math.max(0, sphereRadius)
  return Math.min(
    safeClearance,
    Math.hypot(localCrossSectionRadius, outsideDistance) -
      localCrossSectionRadius,
  )
}

const cubicPoint = (
  from: EdgeConstraintPoint,
  controlFrom: EdgeConstraintPoint,
  controlTo: EdgeConstraintPoint,
  to: EdgeConstraintPoint,
  t: number,
): EdgeConstraintPoint => {
  const inverse = 1 - t
  return {
    x: inverse ** 3 * from.x +
      3 * inverse ** 2 * t * controlFrom.x +
      3 * inverse * t ** 2 * controlTo.x +
      t ** 3 * to.x,
    y: inverse ** 3 * from.y +
      3 * inverse ** 2 * t * controlFrom.y +
      3 * inverse * t ** 2 * controlTo.y +
      t ** 3 * to.y,
    z: inverse ** 3 * from.z +
      3 * inverse ** 2 * t * controlFrom.z +
      3 * inverse * t ** 2 * controlTo.z +
      t ** 3 * to.z,
  }
}

const torusSurfaceDistance = (
  point: EdgeConstraintPoint,
  center: EdgeConstraintPoint,
  radius: number,
  tube: number,
): number => Math.hypot(
  Math.hypot(point.x - center.x, point.y - center.y) - radius,
  point.z - center.z,
) - tube

const hermitePoint = (
  from: EdgeConstraintPoint,
  fromTangent: EdgeConstraintPoint,
  to: EdgeConstraintPoint,
  toTangent: EdgeConstraintPoint,
  t: number,
): EdgeConstraintPoint => {
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return {
    x:
      h00 * from.x +
      h10 * fromTangent.x +
      h01 * to.x +
      h11 * toTangent.x,
    y:
      h00 * from.y +
      h10 * fromTangent.y +
      h01 * to.y +
      h11 * toTangent.y,
    z:
      h00 * from.z +
      h10 * fromTangent.z +
      h01 * to.z +
      h11 * toTangent.z,
  }
}

export const buildHermiteBeamModel = (
  input: EdgeConstraintInput,
  segments = 192,
): EdgeConstraintModel => {
  const leftScale = Math.max(0.1, input.leftTorusScale ?? 1)
  const rightScale = Math.max(0.1, input.rightTorusScale ?? 1)
  const leftRadius = input.torusRadius * leftScale
  const leftTube = input.torusTube * leftScale
  const rightRadius = input.torusRadius * rightScale
  const rightTube = input.torusTube * rightScale
  const halfDistance = input.centerDistance / 2
  const leftTorusCenter = {x: -halfDistance, y: 0, z: 0}
  const rightTorusCenter = {x: halfDistance, y: 0, z: 0}
  const leftCenter = {
    x: leftTorusCenter.x + input.leftSphereX,
    y: leftTorusCenter.y + input.leftSphereY,
    z: 0,
  }
  const rightCenter = {
    x: rightTorusCenter.x + input.rightSphereX,
    y: rightTorusCenter.y + input.rightSphereY,
    z: 0,
  }
  const spanX = rightCenter.x - leftCenter.x
  const spanY = rightCenter.y - leftCenter.y
  const horizontalSpan = Math.max(Number.EPSILON, Math.hypot(spanX, spanY))
  const axis = {x: spanX / horizontalSpan, y: spanY / horizontalSpan}
  const clampDegrees = (value: number): number =>
    Math.max(0, Math.min(180, value))
  const leftDirectionDegrees = clampDegrees(
    input.leftDirectionDegrees ?? 90,
  )
  const rightDirectionDegrees = clampDegrees(
    input.rightDirectionDegrees ?? 90,
  )
  const leftAngle = leftDirectionDegrees * Math.PI / 180
  const rightAngle = rightDirectionDegrees * Math.PI / 180
  const leftDirection = {
    x: axis.x * Math.cos(leftAngle),
    y: axis.y * Math.cos(leftAngle),
    z: Math.sin(leftAngle),
  }
  const rightDirection = {
    x: -axis.x * Math.cos(rightAngle),
    y: -axis.y * Math.cos(rightAngle),
    z: Math.sin(rightAngle),
  }
  const span = distance(leftCenter, rightCenter)
  const defaultTangentLengths = defaultHermiteTangentLengths(
    span,
    leftRadius + leftTube,
    rightRadius + rightTube,
  )
  const leftTangentLength = Math.max(
    0.01,
    input.leftTangentLength ?? defaultTangentLengths.left,
  )
  const rightTangentLength = Math.max(
    0.01,
    input.rightTangentLength ?? defaultTangentLengths.right,
  )
  const leftTangent = {
    x: leftDirection.x * leftTangentLength,
    y: leftDirection.y * leftTangentLength,
    z: leftDirection.z * leftTangentLength,
  }
  const rightTangent = {
    x: -rightDirection.x * rightTangentLength,
    y: -rightDirection.y * rightTangentLength,
    z: -rightDirection.z * rightTangentLength,
  }
  const leftControl = {
    x: leftCenter.x + leftTangent.x / 3,
    y: leftCenter.y + leftTangent.y / 3,
    z: leftCenter.z + leftTangent.z / 3,
  }
  const rightControl = {
    x: rightCenter.x - rightTangent.x / 3,
    y: rightCenter.y - rightTangent.y / 3,
    z: rightCenter.z - rightTangent.z / 3,
  }
  const safeSegments = Math.max(48, Math.floor(segments))
  const curve = Array.from(
    {length: safeSegments + 1},
    (_, index) => hermitePoint(
      leftCenter,
      leftTangent,
      rightCenter,
      rightTangent,
      index / safeSegments,
    ),
  )
  const clearance = Math.max(0, input.clearance)
  const sphereRadius = Math.max(0, input.sphereRadius ?? 0)
  const maximumTube = Math.max(leftTube, rightTube)
  const clearanceTransitionDistance = edgeClearanceTransitionDistance(
    maximumTube,
    sphereRadius,
    clearance,
  )
  let approximateLength = 0
  let minimumSafetyMargin = Number.POSITIVE_INFINITY
  let minimumTorusClearance = Number.POSITIVE_INFINITY
  for (let index = 0; index < curve.length; index += 1) {
    const point = curve[index]!
    const previous = curve[index - 1]
    if (previous) approximateLength += distance(previous, point)
    const actualClearance = Math.min(
      torusSurfaceDistance(
        point,
        leftTorusCenter,
        leftRadius,
        leftTube,
      ),
      torusSurfaceDistance(
        point,
        rightTorusCenter,
        rightRadius,
        rightTube,
      ),
    )
    minimumTorusClearance = Math.min(
      minimumTorusClearance,
      actualClearance,
    )
    minimumSafetyMargin = Math.min(
      minimumSafetyMargin,
      actualClearance - requiredEdgeClearance(
        point,
        leftCenter,
        rightCenter,
        sphereRadius,
        clearance,
        maximumTube,
      ),
    )
  }
  const maximumHeight = Math.max(...curve.map((point) => point.z))
  const leftControlHeight = leftControl.z - leftCenter.z
  const rightControlHeight = rightControl.z - rightCenter.z
  return {
    approximateLength,
    clearanceTransitionDistance,
    clearanceControlHeight: maximumHeight,
    clearanceControlScale: 1,
    controlHeight: Math.max(leftControlHeight, rightControlHeight),
    curve,
    hermite: {
      leftDirection,
      leftDirectionDegrees,
      leftTangentLength,
      rightDirection,
      rightDirectionDegrees,
      rightTangentLength,
    },
    leftCenter,
    leftControl,
    leftControlHeight,
    leftShapeControlHeight: leftControlHeight,
    leftTorusCenter,
    maximumHeight,
    minimumSafetyMargin,
    minimumTorusClearance,
    rightCenter,
    rightControl,
    rightControlHeight,
    rightShapeControlHeight: rightControlHeight,
    rightTorusCenter,
    routeVariant: "hermite",
    shapeControlHeight: Math.max(leftControlHeight, rightControlHeight),
  }
}

export const buildEdgeConstraintModel = (
  input: EdgeConstraintInput,
  segments = 192,
): EdgeConstraintModel => {
  const leftScale = Math.max(0.1, input.leftTorusScale ?? 1)
  const rightScale = Math.max(0.1, input.rightTorusScale ?? 1)
  const leftRadius = input.torusRadius * leftScale
  const leftTube = input.torusTube * leftScale
  const rightRadius = input.torusRadius * rightScale
  const rightTube = input.torusTube * rightScale
  const halfDistance = input.centerDistance / 2
  const leftTorusCenter = {x: -halfDistance, y: 0, z: 0}
  const rightTorusCenter = {x: halfDistance, y: 0, z: 0}
  const leftCenter = {
    x: leftTorusCenter.x + input.leftSphereX,
    y: leftTorusCenter.y + input.leftSphereY,
    z: 0,
  }
  const rightCenter = {
    x: rightTorusCenter.x + input.rightSphereX,
    y: rightTorusCenter.y + input.rightSphereY,
    z: 0,
  }
  const safeSegments = Math.max(48, Math.floor(segments))
  const clearance = Math.max(0, input.clearance)
  const sphereRadius = Math.max(0, input.sphereRadius ?? 0)
  const clearanceTransitionDistance = edgeClearanceTransitionDistance(
    Math.max(leftTube, rightTube),
    sphereRadius,
    clearance,
  )
  const shapeControlHeights = fieldShapeControlHeights(
    distance(leftCenter, rightCenter),
    leftRadius + leftTube,
    rightRadius + rightTube,
  )
  const minimumSafetyMarginAtScale = (scale: number): number => {
    const leftControl = {
      ...leftCenter,
      z: shapeControlHeights.left * scale,
    }
    const rightControl = {
      ...rightCenter,
      z: shapeControlHeights.right * scale,
    }
    let minimum = Number.POSITIVE_INFINITY
    for (let index = 0; index <= safeSegments; index += 1) {
      const point = cubicPoint(
        leftCenter,
        leftControl,
        rightControl,
        rightCenter,
        index / safeSegments,
      )
      const requiredClearance = requiredEdgeClearance(
        point,
        leftCenter,
        rightCenter,
        sphereRadius,
        clearance,
        Math.max(leftTube, rightTube),
      )
      minimum = Math.min(
        minimum,
        torusSurfaceDistance(
          point,
          leftTorusCenter,
          leftRadius,
          leftTube,
        ) - requiredClearance,
        torusSurfaceDistance(
          point,
          rightTorusCenter,
          rightRadius,
          rightTube,
        ) - requiredClearance,
      )
    }
    return minimum
  }
  const safeAtScale = (scale: number): boolean =>
    minimumSafetyMarginAtScale(scale) >= 0
  let lowerScale = 0
  let upperScale = 1
  for (
    let iteration = 0;
    iteration < 32 && !safeAtScale(upperScale);
    iteration += 1
  ) {
    upperScale *= 2
  }
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const candidate = (lowerScale + upperScale) / 2
    if (safeAtScale(candidate)) {
      upperScale = candidate
    } else {
      lowerScale = candidate
    }
  }
  const clearanceControlScale = upperScale
  const finalControlScale = Math.max(1, clearanceControlScale)
  const extraLift = Math.max(0, input.extraLift)
  const leftShapeControlHeight = shapeControlHeights.left
  const rightShapeControlHeight = shapeControlHeights.right
  const leftControlHeight =
    leftShapeControlHeight * finalControlScale + extraLift
  const rightControlHeight =
    rightShapeControlHeight * finalControlScale + extraLift
  const shapeControlHeight = Math.max(
    leftShapeControlHeight,
    rightShapeControlHeight,
  )
  const clearanceControlHeight =
    shapeControlHeight * clearanceControlScale
  const controlHeight = Math.max(leftControlHeight, rightControlHeight)
  const leftControl = {...leftCenter, z: leftControlHeight}
  const rightControl = {...rightCenter, z: rightControlHeight}
  const curve = Array.from(
    {length: safeSegments + 1},
    (_, index) => cubicPoint(
      leftCenter,
      leftControl,
      rightControl,
      rightCenter,
      index / safeSegments,
    ),
  )

  let approximateLength = 0
  let minimumSafetyMargin = Number.POSITIVE_INFINITY
  let minimumTorusClearance = Number.POSITIVE_INFINITY
  for (let index = 0; index < curve.length; index += 1) {
    const point = curve[index]!
    const previous = curve[index - 1]
    if (previous) approximateLength += distance(previous, point)
    const leftClearance = torusSurfaceDistance(
      point,
      leftTorusCenter,
      leftRadius,
      leftTube,
    )
    const rightClearance = torusSurfaceDistance(
      point,
      rightTorusCenter,
      rightRadius,
      rightTube,
    )
    const actualClearance = Math.min(leftClearance, rightClearance)
    const requiredClearance = requiredEdgeClearance(
      point,
      leftCenter,
      rightCenter,
      sphereRadius,
      clearance,
      Math.max(leftTube, rightTube),
    )
    minimumTorusClearance = Math.min(
      minimumTorusClearance,
      actualClearance,
    )
    minimumSafetyMargin = Math.min(
      minimumSafetyMargin,
      actualClearance - requiredClearance,
    )
  }
  return {
    approximateLength,
    clearanceTransitionDistance,
    clearanceControlScale,
    clearanceControlHeight,
    controlHeight,
    curve,
    leftCenter,
    leftControl,
    leftControlHeight,
    leftShapeControlHeight,
    leftTorusCenter,
    maximumHeight: Math.max(...curve.map((point) => point.z)),
    minimumSafetyMargin,
    minimumTorusClearance,
    rightCenter,
    rightControl,
    rightControlHeight,
    rightShapeControlHeight,
    rightTorusCenter,
    routeVariant: "composite",
    shapeControlHeight,
  }
}

type SourceSinkCurve = Readonly<{
  curve: readonly EdgeConstraintPoint[]
  leftDepartureAngle: number
  leftStrength: number
  rightDepartureAngle: number
  rightStrength: number
  streamFunction: number
}>

const sourceSinkCurve = (
  leftCenter: EdgeConstraintPoint,
  rightCenter: EdgeConstraintPoint,
  leftStrength: number,
  rightStrength: number,
  leftDepartureAngle: number,
  segments: number,
): SourceSinkCurve => {
  const spanX = rightCenter.x - leftCenter.x
  const spanY = rightCenter.y - leftCenter.y
  const span = Math.max(Number.EPSILON, Math.hypot(spanX, spanY))
  const axisX = spanX / span
  const axisY = spanY / span
  const safeLeftStrength = Math.max(Number.EPSILON, leftStrength)
  const safeRightStrength = Math.max(Number.EPSILON, rightStrength)
  const streamFunction =
    safeLeftStrength * leftDepartureAngle - safeRightStrength * Math.PI
  const rightDepartureAngle =
    Math.PI - safeLeftStrength / safeRightStrength * leftDepartureAngle
  const safeSegments = Math.max(48, Math.floor(segments))
  const curve = Array.from({length: safeSegments + 1}, (_, index) => {
    if (index === 0) return leftCenter
    if (index === safeSegments) return rightCenter
    const progress = index / safeSegments
    const thetaLeft = leftDepartureAngle * (1 - progress)
    const thetaRight =
      (safeLeftStrength * thetaLeft - streamFunction) / safeRightStrength
    const denominator = Math.sin(thetaRight - thetaLeft)
    const distanceFromLeft =
      span * Math.sin(thetaRight) /
      (
        Math.abs(denominator) < 1e-12
          ? Math.sign(denominator || 1) * 1e-12
          : denominator
      )
    const horizontal = distanceFromLeft * Math.cos(thetaLeft)
    return {
      x: leftCenter.x + axisX * horizontal,
      y: leftCenter.y + axisY * horizontal,
      z: distanceFromLeft * Math.sin(thetaLeft),
    }
  })
  return {
    curve,
    leftDepartureAngle,
    leftStrength: safeLeftStrength,
    rightDepartureAngle,
    rightStrength: safeRightStrength,
    streamFunction,
  }
}

export const buildSourceSinkFieldModel = (
  input: EdgeConstraintInput,
  segments = 192,
): EdgeConstraintModel => {
  const leftScale = Math.max(0.1, input.leftTorusScale ?? 1)
  const rightScale = Math.max(0.1, input.rightTorusScale ?? 1)
  const leftRadius = input.torusRadius * leftScale
  const leftTube = input.torusTube * leftScale
  const rightRadius = input.torusRadius * rightScale
  const rightTube = input.torusTube * rightScale
  const halfDistance = input.centerDistance / 2
  const leftTorusCenter = {x: -halfDistance, y: 0, z: 0}
  const rightTorusCenter = {x: halfDistance, y: 0, z: 0}
  const leftCenter = {
    x: leftTorusCenter.x + input.leftSphereX,
    y: leftTorusCenter.y + input.leftSphereY,
    z: 0,
  }
  const rightCenter = {
    x: rightTorusCenter.x + input.rightSphereX,
    y: rightTorusCenter.y + input.rightSphereY,
    z: 0,
  }
  const safeSegments = Math.max(48, Math.floor(segments))
  const clearance = Math.max(0, input.clearance)
  const sphereRadius = Math.max(0, input.sphereRadius ?? 0)
  const maximumTube = Math.max(leftTube, rightTube)
  const clearanceTransitionDistance = edgeClearanceTransitionDistance(
    maximumTube,
    sphereRadius,
    clearance,
  )
  // The pole strength is an explicit visualization mapping. Square-root
  // scaling keeps unequal forms asymmetric without making a large Torus
  // dominate the entire field-line family.
  const leftStrength = Math.sqrt(Math.max(Number.EPSILON, leftRadius + leftTube))
  const rightStrength = Math.sqrt(
    Math.max(Number.EPSILON, rightRadius + rightTube),
  )
  const epsilon = 1e-4
  const maximumLeftAngle = Math.max(
    epsilon * 2,
    Math.min(
      Math.PI - epsilon,
      Math.PI * rightStrength / leftStrength - epsilon,
    ),
  )
  const naturalLeftAngle = Math.min(
    maximumLeftAngle,
    leftStrength <= rightStrength
      ? Math.PI / 2
      : Math.PI * rightStrength / leftStrength / 2,
  )

  const minimumSafetyMarginFor = (candidate: SourceSinkCurve): number => {
    let minimum = Number.POSITIVE_INFINITY
    for (const point of candidate.curve) {
      const requiredClearance = requiredEdgeClearance(
        point,
        leftCenter,
        rightCenter,
        sphereRadius,
        clearance,
        maximumTube,
      )
      minimum = Math.min(
        minimum,
        torusSurfaceDistance(
          point,
          leftTorusCenter,
          leftRadius,
          leftTube,
        ) - requiredClearance,
        torusSurfaceDistance(
          point,
          rightTorusCenter,
          rightRadius,
          rightTube,
        ) - requiredClearance,
      )
    }
    return minimum
  }
  const candidateAt = (angle: number): SourceSinkCurve =>
    sourceSinkCurve(
      leftCenter,
      rightCenter,
      leftStrength,
      rightStrength,
      angle,
      safeSegments,
    )
  let safeAngle = naturalLeftAngle
  let safeCandidate = candidateAt(safeAngle)
  let safeMargin = minimumSafetyMarginFor(safeCandidate)
  if (safeMargin < 0 && maximumLeftAngle > naturalLeftAngle + epsilon) {
    let previousAngle = naturalLeftAngle
    let foundUpper: number | null = null
    for (let step = 1; step <= 48; step += 1) {
      const angle =
        naturalLeftAngle +
        (maximumLeftAngle - naturalLeftAngle) * step / 48
      const candidate = candidateAt(angle)
      const margin = minimumSafetyMarginFor(candidate)
      if (margin >= 0) {
        foundUpper = angle
        safeCandidate = candidate
        safeMargin = margin
        break
      }
      previousAngle = angle
      safeCandidate = candidate
      safeMargin = margin
    }
    if (foundUpper !== null) {
      let lower = previousAngle
      let upper = foundUpper
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const angle = (lower + upper) / 2
        const candidate = candidateAt(angle)
        if (minimumSafetyMarginFor(candidate) >= 0) upper = angle
        else lower = angle
      }
      safeAngle = upper
      safeCandidate = candidateAt(safeAngle)
      safeMargin = minimumSafetyMarginFor(safeCandidate)
    } else {
      safeAngle = maximumLeftAngle
    }
  }

  const maximumHeightOf = (candidate: SourceSinkCurve): number =>
    Math.max(...candidate.curve.map((point) => point.z))
  const extraLift = Math.max(0, input.extraLift)
  if (extraLift > 0 && safeAngle < maximumLeftAngle - epsilon) {
    const targetHeight = maximumHeightOf(safeCandidate) + extraLift
    const maximumCandidate = candidateAt(maximumLeftAngle)
    if (maximumHeightOf(maximumCandidate) >= targetHeight) {
      let lower = safeAngle
      let upper = maximumLeftAngle
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const angle = (lower + upper) / 2
        if (maximumHeightOf(candidateAt(angle)) >= targetHeight) upper = angle
        else lower = angle
      }
      safeAngle = upper
      safeCandidate = candidateAt(safeAngle)
      safeMargin = minimumSafetyMarginFor(safeCandidate)
    } else {
      safeAngle = maximumLeftAngle
      safeCandidate = maximumCandidate
      safeMargin = minimumSafetyMarginFor(safeCandidate)
    }
  }

  let verticalSafetyScale = 1
  if (safeMargin < 0) {
    const fieldCandidate = safeCandidate
    const scaledCandidate = (scale: number): SourceSinkCurve => ({
      ...fieldCandidate,
      curve: fieldCandidate.curve.map((point, index) =>
        index === 0 || index === fieldCandidate.curve.length - 1
          ? point
          : {...point, z: point.z * scale}
      ),
    })
    let lower = 1
    let upper = 2
    let upperCandidate = scaledCandidate(upper)
    let upperMargin = minimumSafetyMarginFor(upperCandidate)
    for (
      let iteration = 0;
      iteration < 16 && upperMargin < 0;
      iteration += 1
    ) {
      lower = upper
      upper *= 2
      upperCandidate = scaledCandidate(upper)
      upperMargin = minimumSafetyMarginFor(upperCandidate)
    }
    if (upperMargin >= 0) {
      for (let iteration = 0; iteration < 28; iteration += 1) {
        const scale = (lower + upper) / 2
        if (minimumSafetyMarginFor(scaledCandidate(scale)) >= 0) upper = scale
        else lower = scale
      }
      verticalSafetyScale = upper
      safeCandidate = scaledCandidate(verticalSafetyScale)
      safeMargin = minimumSafetyMarginFor(safeCandidate)
    }
  }

  let approximateLength = 0
  let minimumTorusClearance = Number.POSITIVE_INFINITY
  for (let index = 0; index < safeCandidate.curve.length; index += 1) {
    const point = safeCandidate.curve[index]!
    const previous = safeCandidate.curve[index - 1]
    if (previous) approximateLength += distance(previous, point)
    minimumTorusClearance = Math.min(
      minimumTorusClearance,
      torusSurfaceDistance(
        point,
        leftTorusCenter,
        leftRadius,
        leftTube,
      ),
      torusSurfaceDistance(
        point,
        rightTorusCenter,
        rightRadius,
        rightTube,
      ),
    )
  }
  const span = distance(leftCenter, rightCenter)
  const handleLength = span / 3
  const horizontalSpan = Math.max(
    Number.EPSILON,
    Math.hypot(
      rightCenter.x - leftCenter.x,
      rightCenter.y - leftCenter.y,
    ),
  )
  const axis = {
    x: (rightCenter.x - leftCenter.x) / horizontalSpan,
    y: (rightCenter.y - leftCenter.y) / horizontalSpan,
  }
  const leftControl = {
    x: leftCenter.x +
      axis.x * Math.cos(safeCandidate.leftDepartureAngle) * handleLength,
    y: leftCenter.y +
      axis.y * Math.cos(safeCandidate.leftDepartureAngle) * handleLength,
    z:
      Math.sin(safeCandidate.leftDepartureAngle) *
      handleLength *
      verticalSafetyScale,
  }
  const rightControl = {
    x: rightCenter.x +
      axis.x * Math.cos(safeCandidate.rightDepartureAngle) * handleLength,
    y: rightCenter.y +
      axis.y * Math.cos(safeCandidate.rightDepartureAngle) * handleLength,
    z:
      Math.sin(safeCandidate.rightDepartureAngle) *
      handleLength *
      verticalSafetyScale,
  }
  const maximumHeight = maximumHeightOf(safeCandidate)
  const naturalCandidate = candidateAt(naturalLeftAngle)
  const naturalHeight = maximumHeightOf(naturalCandidate)
  return {
    approximateLength,
    clearanceTransitionDistance,
    clearanceControlScale: safeAngle / Math.max(epsilon, naturalLeftAngle),
    clearanceControlHeight: maximumHeight,
    controlHeight: Math.max(leftControl.z, rightControl.z),
    curve: safeCandidate.curve,
    leftCenter,
    leftControl,
    leftControlHeight: leftControl.z,
    leftShapeControlHeight: naturalHeight,
    leftTorusCenter,
    maximumHeight,
    minimumSafetyMargin: safeMargin,
    minimumTorusClearance,
    rightCenter,
    rightControl,
    rightControlHeight: rightControl.z,
    rightShapeControlHeight: naturalHeight,
    rightTorusCenter,
    routeVariant: "source-sink",
    shapeControlHeight: naturalHeight,
    sourceSink: {
      leftDepartureAngle: safeCandidate.leftDepartureAngle,
      leftStrength: safeCandidate.leftStrength,
      rightDepartureAngle: safeCandidate.rightDepartureAngle,
      rightStrength: safeCandidate.rightStrength,
      streamFunction: safeCandidate.streamFunction,
      verticalSafetyScale,
    },
  }
}

export type EdgesLab = Readonly<{
  dispose(): void
  hide(): void
  show(variant: EdgeRouteVariant): void
  showOverview(): void
}>

type EdgesLabElements = Readonly<{
  addExample: HTMLButtonElement
  addExampleStatus: HTMLOutputElement
  canvas: HTMLCanvasElement
  centerDistance: HTMLInputElement
  centerDistanceOutput: HTMLOutputElement
  clearance: HTMLInputElement
  clearanceOutput: HTMLOutputElement
  helpers: HTMLInputElement
  leftTorusScale: HTMLInputElement
  leftTorusScaleOutput: HTMLOutputElement
  measureClearance: HTMLElement
  measureDistance: HTMLElement
  measureLeftScale: HTMLElement
  measureLift: HTMLElement
  measureRightScale: HTMLElement
  measureRoute: HTMLElement
  measureSphere: HTMLElement
  readout: HTMLElement
  rightTorusScale: HTMLInputElement
  rightTorusScaleOutput: HTMLOutputElement
  sphereRadius: HTMLInputElement
  sphereRadiusOutput: HTMLOutputElement
  torusRadiusOutput: HTMLOutputElement
  extraLift: HTMLInputElement
  extraLiftOutput: HTMLOutputElement
  examplesBody: HTMLTableSectionElement
  examplesDescription: HTMLElement
  examplesEmpty: HTMLElement
  examplesHead: HTMLTableSectionElement
  examplesTitle: HTMLElement
  formulaLinks: SVGSVGElement
  formulaHelp: HTMLElement
  formulaHelpText: HTMLElement
  formulaHelpTitle: HTMLElement
  formulaComposite: HTMLElement
  formulaHermite: HTMLElement
  formulaSourceSink: HTMLElement
  formulaTarget: HTMLElement
  formulaValues: HTMLElement
  leftDirection: HTMLInputElement
  leftDirectionOutput: HTMLOutputElement
  leftTangentLength: HTMLInputElement
  leftTangentLengthOutput: HTMLOutputElement
  sceneDescription: HTMLElement
  sceneTitle: HTMLElement
  measureLeftDirection: HTMLElement
  measureLeftTangent: HTMLElement
  measureRightDirection: HTMLElement
  measureRightTangent: HTMLElement
  routeMeasureDescription: HTMLElement
  rightDirection: HTMLInputElement
  rightDirectionOutput: HTMLOutputElement
  rightTangentLength: HTMLInputElement
  rightTangentLengthOutput: HTMLOutputElement
  viewport: HTMLElement
  viewButtons: NodeListOf<HTMLButtonElement>
}>

const requireElement = <T extends Element>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Edges Lab element #${id} is missing`)
  return element as unknown as T
}

const labElements = (): EdgesLabElements => ({
  addExample: requireElement<HTMLButtonElement>("edges-add-example"),
  addExampleStatus: requireElement<HTMLOutputElement>(
    "edges-add-example-status",
  ),
  canvas: requireElement<HTMLCanvasElement>("edges-canvas"),
  centerDistance: requireElement<HTMLInputElement>("edges-center-distance"),
  centerDistanceOutput: requireElement<HTMLOutputElement>("edges-center-distance-output"),
  clearance: requireElement<HTMLInputElement>("edges-clearance"),
  clearanceOutput: requireElement<HTMLOutputElement>("edges-clearance-output"),
  helpers: requireElement<HTMLInputElement>("edges-helpers"),
  leftTorusScale: requireElement<HTMLInputElement>("edges-left-torus-scale"),
  leftTorusScaleOutput: requireElement<HTMLOutputElement>(
    "edges-left-torus-scale-output",
  ),
  measureClearance: requireElement("edges-measure-clearance"),
  measureDistance: requireElement("edges-measure-distance"),
  measureLeftScale: requireElement("edges-measure-left-scale"),
  measureLift: requireElement("edges-measure-lift"),
  measureRightScale: requireElement("edges-measure-right-scale"),
  measureRoute: requireElement("edges-measure-route"),
  measureSphere: requireElement("edges-measure-sphere"),
  readout: requireElement("edges-readout"),
  rightTorusScale: requireElement<HTMLInputElement>("edges-right-torus-scale"),
  rightTorusScaleOutput: requireElement<HTMLOutputElement>(
    "edges-right-torus-scale-output",
  ),
  sphereRadius: requireElement<HTMLInputElement>("edges-sphere-radius"),
  sphereRadiusOutput: requireElement<HTMLOutputElement>("edges-sphere-radius-output"),
  torusRadiusOutput: requireElement<HTMLOutputElement>("edges-torus-radius-output"),
  extraLift: requireElement<HTMLInputElement>("edges-extra-lift"),
  extraLiftOutput: requireElement<HTMLOutputElement>("edges-extra-lift-output"),
  examplesBody: requireElement<HTMLTableSectionElement>("edges-examples-body"),
  examplesDescription: requireElement("edges-examples-description"),
  examplesEmpty: requireElement("edges-examples-empty"),
  examplesHead: requireElement<HTMLTableSectionElement>("edges-examples-head"),
  examplesTitle: requireElement("edges-examples-title"),
  formulaLinks: requireElement<SVGSVGElement>("edges-formula-links"),
  formulaHelp: requireElement("edges-formula-help"),
  formulaHelpText: requireElement("edges-formula-help-text"),
  formulaHelpTitle: requireElement("edges-formula-help-title"),
  formulaComposite: requireElement("edges-formula-composite"),
  formulaHermite: requireElement("edges-formula-hermite"),
  formulaSourceSink: requireElement("edges-formula-source-sink"),
  formulaTarget: requireElement("edges-formula-target"),
  formulaValues: requireElement("edges-formula-values"),
  leftDirection: requireElement<HTMLInputElement>("edges-left-direction"),
  leftDirectionOutput: requireElement<HTMLOutputElement>(
    "edges-left-direction-output",
  ),
  leftTangentLength: requireElement<HTMLInputElement>(
    "edges-left-tangent-length",
  ),
  leftTangentLengthOutput: requireElement<HTMLOutputElement>(
    "edges-left-tangent-length-output",
  ),
  measureLeftDirection: requireElement("edges-measure-left-direction"),
  measureLeftTangent: requireElement("edges-measure-left-tangent"),
  measureRightDirection: requireElement("edges-measure-right-direction"),
  measureRightTangent: requireElement("edges-measure-right-tangent"),
  routeMeasureDescription: requireElement("edges-route-measure-description"),
  rightDirection: requireElement<HTMLInputElement>("edges-right-direction"),
  rightDirectionOutput: requireElement<HTMLOutputElement>(
    "edges-right-direction-output",
  ),
  rightTangentLength: requireElement<HTMLInputElement>(
    "edges-right-tangent-length",
  ),
  rightTangentLengthOutput: requireElement<HTMLOutputElement>(
    "edges-right-tangent-length-output",
  ),
  sceneDescription: requireElement("edges-scene-description"),
  sceneTitle: requireElement("edges-scene-title"),
  viewport: requireElement("edges-viewport"),
  viewButtons: document.querySelectorAll<HTMLButtonElement>("[data-edges-view]"),
})

const pointVector = (point: EdgeConstraintPoint): Vector3 =>
  new Vector3(point.x, point.y, point.z)

const segmentGeometry = (
  segments: readonly (readonly [EdgeConstraintPoint, EdgeConstraintPoint])[],
): BufferGeometry => {
  const values = new Float32Array(segments.length * 6)
  let offset = 0
  for (const [from, to] of segments) {
    values[offset++] = from.x
    values[offset++] = from.y
    values[offset++] = from.z
    values[offset++] = to.x
    values[offset++] = to.y
    values[offset++] = to.z
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(values, 3))
  return geometry
}

const polylineGeometry = (
  points: readonly EdgeConstraintPoint[],
  closed = false,
): BufferGeometry => {
  const segments: Array<readonly [EdgeConstraintPoint, EdgeConstraintPoint]> = []
  for (let index = 1; index < points.length; index += 1) {
    segments.push([points[index - 1]!, points[index]!])
  }
  if (closed && points.length > 1) {
    segments.push([points.at(-1)!, points[0]!])
  }
  return segmentGeometry(segments)
}

const thickPolylineGeometry = (
  points: readonly EdgeConstraintPoint[],
  radius: number,
): BufferGeometry => {
  const safeRadius = Math.max(0, radius)
  const offsets = [
    {x: 0, y: 0, z: 0},
    {x: safeRadius, y: 0, z: 0},
    {x: -safeRadius, y: 0, z: 0},
    {x: 0, y: safeRadius, z: 0},
    {x: 0, y: -safeRadius, z: 0},
    {x: 0, y: 0, z: safeRadius},
    {x: 0, y: 0, z: -safeRadius},
  ]
  const segments: Array<
    readonly [EdgeConstraintPoint, EdgeConstraintPoint]
  > = []
  for (const offset of offsets) {
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!
      const to = points[index]!
      segments.push([
        {
          x: from.x + offset.x,
          y: from.y + offset.y,
          z: from.z + offset.z,
        },
        {
          x: to.x + offset.x,
          y: to.y + offset.y,
          z: to.z + offset.z,
        },
      ])
    }
  }
  return segmentGeometry(segments)
}

const circlePoints = (
  center: EdgeConstraintPoint,
  height: number,
  radius: number,
  segments = 72,
): readonly EdgeConstraintPoint[] =>
  Array.from({length: segments}, (_, index) => {
    const angle = index / segments * Math.PI * 2
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      z: center.z + height,
    }
  })

const centerDistanceDimension = (
  model: EdgeConstraintModel,
  offsetY: number,
  arrowSize: number,
): readonly (readonly [EdgeConstraintPoint, EdgeConstraintPoint])[] => {
  const left = {...model.leftTorusCenter, y: offsetY}
  const right = {...model.rightTorusCenter, y: offsetY}
  return [
    [model.leftTorusCenter, left],
    [model.rightTorusCenter, right],
    [left, right],
    [left, {...left, x: left.x + arrowSize, y: left.y + arrowSize * 0.45}],
    [left, {...left, x: left.x + arrowSize, y: left.y - arrowSize * 0.45}],
    [right, {...right, x: right.x - arrowSize, y: right.y + arrowSize * 0.45}],
    [right, {...right, x: right.x - arrowSize, y: right.y - arrowSize * 0.45}],
  ]
}

const replaceReadout = (
  target: HTMLElement,
  values: ReadonlyArray<readonly [string, string]>,
): void => {
  target.replaceChildren(...values.flatMap(([label, value]) => {
    const wrapper = document.createElement("div")
    const term = document.createElement("span")
    term.textContent = label
    const definition = document.createElement("strong")
    definition.textContent = value
    wrapper.append(term, definition)
    return [wrapper]
  }))
}

const formatPoint = (point: EdgeConstraintPoint): string =>
  `${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)}`

const EDGE_VARIANTS: ReadonlyArray<
  Readonly<{label: string; route: string; variant: EdgeRouteVariant}>
> = [
  {
    label: "Составная экспериментальная",
    route: "#/edges/composite",
    variant: "composite",
  },
  {
    label: "Источник → сток",
    route: "#/edges/source-sink",
    variant: "source-sink",
  },
  {
    label: "Hermite · балка",
    route: "#/edges/hermite",
    variant: "hermite",
  },
]

const edgeModelForVariant = (
  input: EdgeConstraintInput,
  variant: EdgeRouteVariant,
): EdgeConstraintModel =>
  variant === "source-sink"
    ? buildSourceSinkFieldModel(input)
    : variant === "hermite"
      ? buildHermiteBeamModel(input)
      : buildEdgeConstraintModel(input)

const drawEdgeExamplePreview = (
  canvas: HTMLCanvasElement,
  input: EdgeConstraintInput,
  model: EdgeConstraintModel,
): void => {
  const context = canvas.getContext("2d")
  if (!context) return
  const width = canvas.width
  const height = canvas.height
  context.clearRect(0, 0, width, height)
  context.fillStyle = "#02070d"
  context.fillRect(0, 0, width, height)

  const project = (point: EdgeConstraintPoint) => ({
    x: point.x + point.y * 0.24,
    z: point.z - point.y * 0.08,
  })
  const leftScale = input.leftTorusScale ?? 1
  const rightScale = input.rightTorusScale ?? 1
  const leftOuter = (input.torusRadius + input.torusTube) * leftScale
  const rightOuter = (input.torusRadius + input.torusTube) * rightScale
  const leftTube = input.torusTube * leftScale
  const rightTube = input.torusTube * rightScale
  const projectedCurve = model.curve.map(project)
  const leftTorus = project(model.leftTorusCenter)
  const rightTorus = project(model.rightTorusCenter)
  const minX = Math.min(
    leftTorus.x - leftOuter,
    rightTorus.x - rightOuter,
    ...projectedCurve.map((point) => point.x),
  )
  const maxX = Math.max(
    leftTorus.x + leftOuter,
    rightTorus.x + rightOuter,
    ...projectedCurve.map((point) => point.x),
  )
  const minimumZ = -Math.max(leftTube, rightTube) * 1.35
  const maximumZ = Math.max(
    leftTube,
    rightTube,
    ...projectedCurve.map((point) => point.z),
  ) * 1.12
  const padding = 20
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, maxX - minX),
    (height - padding * 2) / Math.max(1, maximumZ - minimumZ),
  )
  const screen = (point: Readonly<{x: number; z: number}>) => ({
    x: padding + (point.x - minX) * scale,
    y: padding + (maximumZ - point.z) * scale,
  })

  const drawTorus = (
    center: Readonly<{x: number; z: number}>,
    radius: number,
    tube: number,
    color: string,
  ): void => {
    const at = screen(center)
    context.save()
    context.strokeStyle = color
    context.lineWidth = 1.6
    context.globalAlpha = 0.62
    context.beginPath()
    context.ellipse(
      at.x,
      at.y,
      (radius + tube) * scale,
      tube * scale,
      0,
      0,
      Math.PI * 2,
    )
    context.stroke()
    context.globalAlpha = 0.28
    for (const factor of [0.35, 0.68]) {
      context.beginPath()
      context.ellipse(
        at.x,
        at.y,
        (radius + tube * factor) * scale,
        tube * factor * scale,
        0,
        0,
        Math.PI * 2,
      )
      context.stroke()
    }
    context.restore()
  }
  drawTorus(leftTorus, input.torusRadius * leftScale, leftTube, "#43cfff")
  drawTorus(
    rightTorus,
    input.torusRadius * rightScale,
    rightTube,
    "#cf74ff",
  )

  context.save()
  context.lineCap = "round"
  context.lineJoin = "round"
  const drawCurve = (lineWidth: number, color: string): void => {
    context.beginPath()
    projectedCurve.forEach((point, index) => {
      const at = screen(point)
      if (index === 0) context.moveTo(at.x, at.y)
      else context.lineTo(at.x, at.y)
    })
    context.strokeStyle = color
    context.lineWidth = lineWidth
    context.stroke()
  }
  drawCurve(8, "rgba(255, 111, 24, 0.12)")
  drawCurve(2.8, "#ff841f")
  context.restore()

  const sphereRadius = Math.max(0.01, input.sphereRadius ?? 0)
  for (const [center, color] of [
    [project(model.leftCenter), "#8ceaff"],
    [project(model.rightCenter), "#eda5ff"],
  ] as const) {
    const at = screen(center)
    context.beginPath()
    context.arc(at.x, at.y, Math.max(2.5, sphereRadius * scale), 0, Math.PI * 2)
    context.fillStyle = color
    context.globalAlpha = 0.9
    context.fill()
  }
  context.globalAlpha = 1
}

export const createEdgesLab = async (): Promise<EdgesLab> => {
  const elements = labElements()
  const renderer = new Renderer()
  await renderer.init(elements.canvas)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  const space = new Space()
  space.background = new Color(0.006, 0.014, 0.024)
  const viewPoint = new ViewPoint({
    element: elements.canvas,
    fov: Math.PI / 3.5,
    near: 0.01,
    far: 10000,
    position: {x: 0, y: -68, z: 30},
    target: {x: 0, y: 0, z: 7},
  })
  viewPoint.getUp().set(0, 0, 1)

  let active = false
  let activeVariant: EdgeRouteVariant = "composite"
  let activeView = "perspective"
  let disposed = false
  let frame = 0
  let geometries: BufferGeometry[] = []
  let sphereOffsets = {
    left: {x: 0, y: 0},
    right: {x: 0, y: 0},
  }
  let interactionModel: EdgeConstraintModel | null = null
  let interactionSphereRadius = 0
  let interactionOffsetLimit = {left: 0, right: 0}
  let hermiteControlsInitialized = false
  let hermiteTangentsCustomized = false
  let activeFormulaKey: string | null = null
  let exampleScope: EdgeRouteVariant | null = "composite"
  let exampleLoadVersion = 0
  let formulaTargetPoints = new Map<string, Readonly<{x: number; y: number}>>()
  let formulaSceneMaterials = new Map<string, Set<LineGlowMaterial>>()
  let formulaMaterialBaselines = new Map<
    LineGlowMaterial,
    Readonly<{
      color: Color
      glowColor: Color | null
      glowIntensity: number
      luminanceBoost: number
    }>
  >()
  const annotation = createPageAnnotationLayer({
    sourceCanvas: elements.canvas,
    viewer: elements.canvas.parentElement ??
      (() => {
        throw new Error("Edges canvas parent is missing")
      })(),
    capturePng: () => renderer.captureLastPresentedFramePng(),
    surface: () => ({
      canvasId: elements.canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: `edges-${activeVariant}`,
      title: EDGE_VARIANTS.find((item) =>
        item.variant === activeVariant
      )?.label ?? "Edges",
    }),
  })

  const input = (
    torus = readStoredTorusDefaults(localStorage),
  ): EdgeConstraintInput => ({
    centerDistance: Number(elements.centerDistance.value),
    clearance: Number(elements.clearance.value),
    extraLift: Number(elements.extraLift.value),
    ...(activeVariant === "hermite"
      ? {
          leftDirectionDegrees: Number(elements.leftDirection.value),
          leftTangentLength: Number(elements.leftTangentLength.value),
        }
      : {}),
    leftTorusScale: Number(elements.leftTorusScale.value),
    leftSphereX: sphereOffsets.left.x,
    leftSphereY: sphereOffsets.left.y,
    rightTorusScale: Number(elements.rightTorusScale.value),
    rightSphereX: sphereOffsets.right.x,
    rightSphereY: sphereOffsets.right.y,
    ...(activeVariant === "hermite"
      ? {
          rightDirectionDegrees: Number(elements.rightDirection.value),
          rightTangentLength: Number(elements.rightTangentLength.value),
        }
      : {}),
    sphereRadius: Number(elements.sphereRadius.value),
    torusRadius: torus.radius,
    torusTube: torus.tube,
  })

  const applyHermiteShoulderDefaults = (): void => {
    const torus = readStoredTorusDefaults(localStorage)
    const span = Math.hypot(
      Number(elements.centerDistance.value) +
        sphereOffsets.right.x -
        sphereOffsets.left.x,
      sphereOffsets.right.y - sphereOffsets.left.y,
    )
    const defaults = defaultHermiteTangentLengths(
      span,
      (torus.radius + torus.tube) *
        Number(elements.leftTorusScale.value),
      (torus.radius + torus.tube) *
        Number(elements.rightTorusScale.value),
    )
    elements.leftTangentLength.value = String(defaults.left)
    elements.rightTangentLength.value = String(defaults.right)
    hermiteControlsInitialized = true
  }

  const algorithmCell = (
    example: StoredEdgeExample,
    variant: EdgeRouteVariant,
  ): HTMLTableCellElement => {
    const definition = EDGE_VARIANTS.find((item) => item.variant === variant)!
    const cell = document.createElement("td")
    const wrapper = document.createElement("div")
    wrapper.className = "edges-example-algorithm"
    const link = document.createElement("a")
    link.href = definition.route
    link.textContent = definition.label
    const canvas = document.createElement("canvas")
    canvas.className = "edges-example-preview"
    canvas.width = 520
    canvas.height = 280
    canvas.setAttribute(
      "aria-label",
      `Живое превью ${definition.label}`,
    )
    const metrics = document.createElement("small")
    try {
      const model = edgeModelForVariant(example.input, variant)
      drawEdgeExamplePreview(canvas, example.input, model)
      metrics.textContent = [
        `высота ${model.maximumHeight.toFixed(1)} мм`,
        `длина ${model.approximateLength.toFixed(1)} мм`,
        `запас ${model.minimumSafetyMargin.toFixed(2)} мм`,
      ].join(" · ")
    } catch {
      metrics.textContent = "Не удалось рассчитать этот набор параметров."
    }
    wrapper.append(link, canvas, metrics)
    cell.append(wrapper)
    return cell
  }

  const parameterCell = (
    example: StoredEdgeExample,
  ): HTMLTableCellElement => {
    const cell = document.createElement("td")
    cell.className = "edges-example-parameters"
    const source = EDGE_VARIANTS.find(
      (item) => item.variant === example.sourceVariant,
    )!
    const created = document.createElement("strong")
    created.textContent = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(example.createdAt))
    const values = document.createElement("div")
    const hermite = buildHermiteBeamModel(example.input).hermite!
    values.textContent = [
      `D ${example.input.centerDistance.toFixed(1)} мм`,
      `Torus L ${(example.input.leftTorusScale ?? 1).toFixed(2)}×`,
      `R ${(example.input.rightTorusScale ?? 1).toFixed(2)}×`,
      `Sphere ${(example.input.sphereRadius ?? 0).toFixed(1)} мм`,
      `зазор ${example.input.clearance.toFixed(1)} мм`,
      `подъём ${example.input.extraLift.toFixed(1)} мм`,
      `Sₗ (${example.input.leftSphereX.toFixed(1)}, ${example.input.leftSphereY.toFixed(1)})`,
      `Sᵣ (${example.input.rightSphereX.toFixed(1)}, ${example.input.rightSphereY.toFixed(1)})`,
      `dₗ ${(example.input.leftDirectionDegrees ?? 90).toFixed(1)}°`,
      `Lₗ ${hermite.leftTangentLength.toFixed(1)} мм`,
      `dᵣ ${(example.input.rightDirectionDegrees ?? 90).toFixed(1)}°`,
      `Lᵣ ${hermite.rightTangentLength.toFixed(1)} мм`,
    ].join(" · ")
    const provenance = document.createElement("div")
    provenance.textContent = `Добавлен из: ${source.label}`
    cell.append(created, values, provenance)
    return cell
  }

  const renderExamples = (
    examples: readonly StoredEdgeExample[],
    scope: EdgeRouteVariant | null,
  ): void => {
    const variants = scope === null
      ? EDGE_VARIANTS
      : EDGE_VARIANTS.filter((item) => item.variant === scope)
    const headerRow = document.createElement("tr")
    const parameterHeader = document.createElement("th")
    parameterHeader.scope = "col"
    parameterHeader.textContent = "Набор параметров"
    headerRow.append(parameterHeader)
    for (const variant of variants) {
      const header = document.createElement("th")
      header.scope = "col"
      header.textContent = variant.label
      headerRow.append(header)
    }
    elements.examplesHead.replaceChildren(headerRow)
    elements.examplesBody.replaceChildren(
      ...examples.map((example) => {
        const row = document.createElement("tr")
        row.append(
          parameterCell(example),
          ...variants.map((variant) =>
            algorithmCell(example, variant.variant)
          ),
        )
        return row
      }),
    )
    elements.examplesEmpty.hidden = examples.length > 0
    if (scope === null) {
      elements.examplesTitle.textContent = "Все сохранённые примеры Edges"
      elements.examplesDescription.textContent =
        "Каждый набор входных данных рассчитан всеми алгоритмами. Превью строятся живыми функциями из текущего кода, без PNG и вспомогательной геометрии."
    } else {
      const definition = EDGE_VARIANTS.find(
        (item) => item.variant === scope,
      )!
      elements.examplesTitle.textContent = `Примеры · ${definition.label}`
      elements.examplesDescription.textContent =
        "Все сохранённые наборы параметров применены к функции этого эксперимента. Превью пересчитываются из текущего кода."
    }
  }

  const loadExamples = async (
    scope: EdgeRouteVariant | null,
  ): Promise<void> => {
    exampleScope = scope
    const version = ++exampleLoadVersion
    try {
      const response = await fetch("/api/edge-examples", {
        headers: {accept: "application/json"},
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const examples = await response.json() as StoredEdgeExample[]
      if (version !== exampleLoadVersion || exampleScope !== scope) return
      renderExamples(examples, scope)
    } catch {
      if (version !== exampleLoadVersion || exampleScope !== scope) return
      elements.examplesHead.replaceChildren()
      elements.examplesBody.replaceChildren()
      elements.examplesEmpty.hidden = false
      elements.examplesEmpty.textContent =
        "Не удалось загрузить сохранённые примеры."
    }
  }

  const saveCurrentExample = async (): Promise<void> => {
    if (!interactionModel || !active) return
    elements.addExample.disabled = true
    elements.addExampleStatus.value = "Сохраняю набор параметров…"
    try {
      const response = await fetch("/api/edge-examples", {
        body: JSON.stringify({
          createdAt: new Date().toISOString(),
          input: input(readStoredTorusDefaults(localStorage)),
          schema: EDGE_EXAMPLE_SCHEMA,
          sourceVariant: activeVariant,
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        method: "POST",
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      elements.addExampleStatus.value =
        "Добавлено: набор рассчитан всеми алгоритмами."
      await loadExamples(activeVariant)
    } catch {
      elements.addExampleStatus.value = "Не удалось сохранить пример."
    } finally {
      elements.addExample.disabled = false
    }
  }

  const updateOutputs = (
    model: EdgeConstraintModel,
    settings: EdgeConstraintInput,
    torus: ThreeTorusParameters,
  ): void => {
    elements.centerDistanceOutput.value = `${settings.centerDistance.toFixed(1)} mm`
    elements.clearanceOutput.value = `${settings.clearance.toFixed(1)} mm`
    elements.leftTorusScaleOutput.value =
      `${(settings.leftTorusScale ?? 1).toFixed(2)}×`
    elements.rightTorusScaleOutput.value =
      `${(settings.rightTorusScale ?? 1).toFixed(2)}×`
    elements.sphereRadiusOutput.value =
      `${Number(elements.sphereRadius.value).toFixed(1)} mm`
    elements.torusRadiusOutput.value =
      `R ${torus.radius.toFixed(2)} · tube ${torus.tube.toFixed(2)} мм`
    elements.extraLiftOutput.value = `${settings.extraLift.toFixed(1)} mm`
    elements.leftDirectionOutput.value =
      `${(settings.leftDirectionDegrees ?? 90).toFixed(1)}°`
    elements.rightDirectionOutput.value =
      `${(settings.rightDirectionDegrees ?? 90).toFixed(1)}°`
    elements.leftTangentLengthOutput.value =
      `${(model.hermite?.leftTangentLength ?? 0).toFixed(1)} mm`
    elements.rightTangentLengthOutput.value =
      `${(model.hermite?.rightTangentLength ?? 0).toFixed(1)} mm`
    const routeOutput = elements.measureRoute.querySelector("output")
    if (routeOutput) {
      routeOutput.textContent =
        `${model.maximumHeight.toFixed(1)} mm · ` +
        `${model.minimumSafetyMargin.toFixed(2)} mm запас`
    }
    elements.measureRoute.classList.toggle(
      "safe",
      model.minimumSafetyMargin >= -1e-6,
    )
    elements.measureRoute.classList.toggle(
      "unsafe",
      model.minimumSafetyMargin < -1e-6,
    )
    const commonFormulaValues = [
      `D=${settings.centerDistance.toFixed(1)} mm`,
      `κₗ=${(settings.leftTorusScale ?? 1).toFixed(2)}×`,
      `κᵣ=${(settings.rightTorusScale ?? 1).toFixed(2)}×`,
      `R₀=${torus.radius.toFixed(2)} mm`,
      `r₀=${torus.tube.toFixed(2)} mm`,
      `Rₗ=${(torus.radius * (settings.leftTorusScale ?? 1)).toFixed(2)} mm`,
      `Rᵣ=${(torus.radius * (settings.rightTorusScale ?? 1)).toFixed(2)} mm`,
      `rₗ=${(torus.tube * (settings.leftTorusScale ?? 1)).toFixed(2)} mm`,
      `rᵣ=${(torus.tube * (settings.rightTorusScale ?? 1)).toFixed(2)} mm`,
      `ρ=${Number(elements.sphereRadius.value).toFixed(2)} mm`,
      `c=${settings.clearance.toFixed(2)} mm`,
      `qfull=${model.clearanceTransitionDistance.toFixed(2)} mm`,
      `Δh=${settings.extraLift.toFixed(2)} mm`,
      `ℓ=${distance(model.leftCenter, model.rightCenter).toFixed(2)} mm`,
      `Sₗ=(${formatPoint(model.leftCenter)})`,
      `Sᵣ=(${formatPoint(model.rightCenter)})`,
    ]
    const sourceSink = model.sourceSink
    const hermite = model.hermite
    elements.formulaValues.textContent = [
      ...(hermite
        ? [
            `Sₗ=(${formatPoint(model.leftCenter)})`,
            `Sᵣ=(${formatPoint(model.rightCenter)})`,
            `dₗ=(${formatPoint(hermite.leftDirection)})`,
            `dᵣ=(${formatPoint(hermite.rightDirection)})`,
            `Lₗ=${hermite.leftTangentLength.toFixed(2)} mm`,
            `Lᵣ=${hermite.rightTangentLength.toFixed(2)} mm`,
            `Vₗ=Lₗdₗ`,
            `Vᵣ=−Lᵣdᵣ`,
            "t∈[0,1]",
          ]
        : commonFormulaValues),
      ...(!hermite && sourceSink
        ? [
            `gₗ=${sourceSink.leftStrength.toFixed(3)}`,
            `gᵣ=${sourceSink.rightStrength.toFixed(3)}`,
            `Ψ₀=${sourceSink.streamFunction.toFixed(3)}`,
            `λ𝓏=${sourceSink.verticalSafetyScale.toFixed(3)}`,
            `αₗ=${(sourceSink.leftDepartureAngle * 180 / Math.PI).toFixed(1)}°`,
            `αᵣ=${(sourceSink.rightDepartureAngle * 180 / Math.PI).toFixed(1)}°`,
            "θₗ∈[αₗ,0]",
          ]
        : !hermite
          ? [
            `λsafe=${model.clearanceControlScale.toFixed(3)}`,
            `Hshape,ₗ=${model.leftShapeControlHeight.toFixed(2)} mm`,
            `Hshape,ᵣ=${model.rightShapeControlHeight.toFixed(2)} mm`,
            `Hₗ=${model.leftControlHeight.toFixed(2)} mm`,
            `Hᵣ=${model.rightControlHeight.toFixed(2)} mm`,
            `Cₗ=(${formatPoint(model.leftControl)})`,
            `Cᵣ=(${formatPoint(model.rightControl)})`,
            "t∈[0,1]",
          ]
          : []),
    ].join(" · ")
    const routeReadout: ReadonlyArray<readonly [string, string]> = hermite
      ? [
          ["Угол выхода L", `${hermite.leftDirectionDegrees.toFixed(1)}°`],
          ["Длина Vₗ", `${hermite.leftTangentLength.toFixed(1)} mm`],
          ["Угол входа R", `${hermite.rightDirectionDegrees.toFixed(1)}°`],
          ["Длина Vᵣ", `${hermite.rightTangentLength.toFixed(1)} mm`],
          ["Автокоррекция", "нет"],
        ]
      : sourceSink
      ? [
          ["Полюс L", sourceSink.leftStrength.toFixed(3)],
          ["Полюс R", sourceSink.rightStrength.toFixed(3)],
          ["Угол выхода L", `${(sourceSink.leftDepartureAngle * 180 / Math.PI).toFixed(1)}°`],
          ["Угол входа R", `${(sourceSink.rightDepartureAngle * 180 / Math.PI).toFixed(1)}°`],
          ["Ψ₀", sourceSink.streamFunction.toFixed(3)],
          ["Резерв λ𝓏", `${sourceSink.verticalSafetyScale.toFixed(3)}×`],
        ]
      : [
          ["Плечо L", `${model.leftControlHeight.toFixed(1)} mm`],
          ["Плечо R", `${model.rightControlHeight.toFixed(1)} mm`],
          ["Масштаб безопасности", `${model.clearanceControlScale.toFixed(3)}×`],
        ]
    replaceReadout(elements.readout, [
      ["Центры", `${settings.centerDistance.toFixed(1)} mm`],
      ["Scale L", `${(settings.leftTorusScale ?? 1).toFixed(2)}×`],
      ["Scale R", `${(settings.rightTorusScale ?? 1).toFixed(2)}×`],
      ...(hermite
        ? []
        : [[
            "Дополнительный подъём",
            `${settings.extraLift.toFixed(1)} mm`,
          ] as const]),
      ...routeReadout,
      ["Безопасный зазор", `${settings.clearance.toFixed(1)} mm`],
      ["Переход зазора", `${model.clearanceTransitionDistance.toFixed(2)} mm`],
      ["Высота маршрута", `${model.maximumHeight.toFixed(2)} mm`],
      ["Мин. до Torus", `${model.minimumTorusClearance.toFixed(2)} mm`],
      ["Запас правила", `${model.minimumSafetyMargin.toFixed(3)} mm`],
      ["Длина Edge", `${model.approximateLength.toFixed(2)} mm`],
      ["Sphere L", formatPoint(model.leftCenter)],
      ["Sphere R", formatPoint(model.rightCenter)],
    ])
  }

  const addLine = (
    geometry: BufferGeometry,
    material: LineBasicMaterial | LineGlowMaterial,
  ): LineSegments => {
    geometries.push(geometry)
    const line = new LineSegments(geometry, material)
    line.frustumCulled = false
    space.add(line)
    return line
  }

  const registerFormulaMaterial = (
    keys: readonly string[],
    material: LineGlowMaterial,
  ): void => {
    formulaMaterialBaselines.set(material, {
      color: material.color.clone(),
      glowColor: material.glowColor?.clone() ?? null,
      glowIntensity: material.glowIntensity,
      luminanceBoost: material.luminanceBoost,
    })
    for (const key of keys) {
      const materials = formulaSceneMaterials.get(key) ?? new Set()
      materials.add(material)
      formulaSceneMaterials.set(key, materials)
    }
  }

  const formulaVariableForKey = (key: string): HTMLElement | null =>
    document.getElementById(
      activeVariant === "source-sink"
        ? `edges-source-formula-${key}`
        : activeVariant === "hermite"
          ? `edges-hermite-formula-${key}`
        : `edges-formula-${key}`,
    )

  const formulaKeyForVariable = (variable: HTMLElement): string | null => {
    const prefix = variable.id.startsWith("edges-source-formula-")
      ? "edges-source-formula-"
      : variable.id.startsWith("edges-hermite-formula-")
        ? "edges-hermite-formula-"
      : variable.id.startsWith("edges-formula-")
        ? "edges-formula-"
        : null
    return prefix ? variable.id.slice(prefix.length) : null
  }

  const updateFormulaHighlight = (render = true): void => {
    const variables = document.querySelectorAll<HTMLElement>(
      ".edges-formula-variable",
    )
    const paths = elements.formulaLinks.querySelectorAll<SVGPathElement>(
      "[data-edges-formula-link]",
    )
    for (const variable of variables) {
      variable.classList.toggle(
        "is-highlighted",
        variable === (
          activeFormulaKey
            ? formulaVariableForKey(activeFormulaKey)
            : null
        ),
      )
    }
    for (const path of paths) {
      path.classList.toggle(
        "is-highlighted",
        path.dataset.edgesFormulaLink === activeFormulaKey,
      )
    }

    for (const [material, baseline] of formulaMaterialBaselines) {
      material.color.copy(baseline.color)
      material.glowColor = baseline.glowColor?.clone() ?? null
      material.glowIntensity = baseline.glowIntensity
      material.luminanceBoost = baseline.luminanceBoost
    }
    if (activeFormulaKey) {
      const highlightColor = new Color(
        FORMULA_LINK_COLORS[activeFormulaKey] ?? "#ffffff",
      )
      for (const material of formulaSceneMaterials.get(activeFormulaKey) ?? []) {
        material.color.copy(highlightColor)
        material.glowColor = highlightColor.clone()
        material.glowIntensity *= 1.8
        material.luminanceBoost = Math.max(1.7, material.luminanceBoost)
      }
    }

    const measureTargets: Readonly<Record<string, HTMLElement>> = {
      c: elements.measureClearance,
      dh: elements.measureLift,
      distance: elements.measureDistance,
      dt: elements.measureRoute,
      h: elements.measureRoute,
      p: elements.measureRoute,
      rho: elements.measureSphere,
      "d-left": elements.measureLeftDirection,
      "d-right": elements.measureRightDirection,
      "l-left": elements.measureLeftTangent,
      "l-right": elements.measureRightTangent,
      "v-left": elements.measureLeftTangent,
      "v-right": elements.measureRightTangent,
      "scale-left": elements.measureLeftScale,
      "scale-right": elements.measureRightScale,
    }
    for (const measure of [
      elements.measureClearance,
      elements.measureDistance,
      elements.measureLeftScale,
      elements.measureLift,
      elements.measureLeftDirection,
      elements.measureLeftTangent,
      elements.measureRightScale,
      elements.measureRightDirection,
      elements.measureRightTangent,
      elements.measureRoute,
      elements.measureSphere,
    ]) {
      const highlighted = activeFormulaKey
        ? measureTargets[activeFormulaKey] === measure
        : false
      measure.classList.toggle("is-formula-highlighted", highlighted)
      measure.style.color = highlighted && activeFormulaKey
        ? FORMULA_LINK_COLORS[activeFormulaKey] ?? "#ffffff"
        : ""
    }

    const help = activeFormulaKey ? FORMULA_HELP[activeFormulaKey] : null
    elements.formulaHelp.hidden = !help
    if (help && activeFormulaKey) {
      elements.formulaHelpTitle.textContent = help.title
      elements.formulaHelpText.textContent = help.text
      elements.formulaHelp.style.color =
        FORMULA_LINK_COLORS[activeFormulaKey] ?? "#ffffff"
    }

    const target = activeFormulaKey
      ? formulaTargetPoints.get(activeFormulaKey)
      : null
    elements.formulaTarget.classList.toggle("is-highlighted", Boolean(target))
    if (target && activeFormulaKey) {
      elements.formulaTarget.style.left = `${target.x}px`
      elements.formulaTarget.style.top = `${target.y}px`
      elements.formulaTarget.style.color =
        FORMULA_LINK_COLORS[activeFormulaKey] ?? "#ffffff"
    }
    if (render) requestRender()
  }

  const syncVariantContent = (): void => {
    const sourceSink = activeVariant === "source-sink"
    const hermite = activeVariant === "hermite"
    elements.formulaComposite.hidden = sourceSink || hermite
    elements.formulaHermite.hidden = !hermite
    elements.formulaSourceSink.hidden = !sourceSink
    elements.measureLeftDirection.hidden = !hermite
    elements.measureLeftTangent.hidden = !hermite
    elements.measureRightDirection.hidden = !hermite
    elements.measureRightTangent.hidden = !hermite
    elements.measureLift.hidden = hermite
    if (hermite) {
      elements.sceneTitle.textContent = "Edge · Hermite / упругая балка"
      elements.sceneDescription.textContent =
        "Чистая кубическая Hermite-кривая соединяет центры Sphere по двум явным граничным векторам. Проверка Torus измеряет результат, но не исправляет формулу."
      elements.routeMeasureDescription.textContent =
        "проверка отдельно · без автокоррекции"
    } else if (sourceSink) {
      elements.sceneTitle.textContent = "Edge · силовая линия источник → сток"
      elements.sceneDescription.textContent =
        "Аналитическая линия двумерного поля соединяет Sphere как источник и сток. Стенд выбирает самый низкий контур, который проходит через отверстия и не пересекает Torus."
      elements.routeMeasureDescription.textContent =
        "выбор безопасной линии поля"
    } else {
      elements.sceneTitle.textContent =
        "Edge · составная экспериментальная формула"
      elements.sceneDescription.textContent =
        "Экспериментальная составная схема: кубическая Bézier-кривая, профиль безопасного зазора и численный автоподбор высоты. Sphere перемещается перетаскиванием левой кнопкой мыши."
      elements.routeMeasureDescription.textContent =
        "автоподбор по плавному профилю зазора"
    }
  }

  const rebuild = (): void => {
    if (disposed) return
    syncVariantContent()
    for (const geometry of geometries) renderer.invalidateGeometry(geometry)
    geometries = []
    formulaSceneMaterials = new Map()
    formulaMaterialBaselines = new Map()
    for (const child of [...space.children]) space.remove(child)

    const torusParameters = readStoredTorusDefaults(localStorage)
    const leftScale = Number(elements.leftTorusScale.value)
    const rightScale = Number(elements.rightTorusScale.value)
    const leftTorus = {
      radius: torusParameters.radius * leftScale,
      tube: torusParameters.tube * leftScale,
    }
    const rightTorus = {
      radius: torusParameters.radius * rightScale,
      tube: torusParameters.tube * rightScale,
    }
    const torusOuterRadius = Math.max(
      leftTorus.radius + leftTorus.tube,
      rightTorus.radius + rightTorus.tube,
    )
    const minimumCenterDistance = minimumEdgeTorusCenterDistance(
      torusParameters,
      leftScale,
      rightScale,
    )
    elements.centerDistance.min = String(minimumCenterDistance)
    elements.centerDistance.max = String(Math.max(200, minimumCenterDistance))
    if (Number(elements.centerDistance.value) < minimumCenterDistance) {
      elements.centerDistance.value = String(minimumCenterDistance)
    }
    const torusInnerRadius = Math.max(
      0.02,
      Math.min(
        leftTorus.radius - leftTorus.tube,
        rightTorus.radius - rightTorus.tube,
      ),
    )
    const maximumSphereRadius = Math.max(0.01, torusInnerRadius - 0.01)
    elements.sphereRadius.max = String(maximumSphereRadius)
    if (Number(elements.sphereRadius.value) > maximumSphereRadius) {
      elements.sphereRadius.value = String(maximumSphereRadius)
    }
    const sphereRadius = Number(elements.sphereRadius.value)
    const leftOffsetLimit = sphereOffsetLimit(
      leftTorus,
      sphereRadius,
    )
    const rightOffsetLimit = sphereOffsetLimit(
      rightTorus,
      sphereRadius,
    )
    const leftOffset = constrainSphereOffset(
      sphereOffsets.left.x,
      sphereOffsets.left.y,
      leftOffsetLimit,
    )
    const rightOffset = constrainSphereOffset(
      sphereOffsets.right.x,
      sphereOffsets.right.y,
      rightOffsetLimit,
    )
    sphereOffsets = {left: leftOffset, right: rightOffset}
    const tangentMaximum = Math.max(
      400,
      Number(elements.centerDistance.value) * 3,
    )
    elements.leftTangentLength.max = String(tangentMaximum)
    elements.rightTangentLength.max = String(tangentMaximum)
    const settings = input(torusParameters)
    const model = edgeModelForVariant(settings, activeVariant)
    interactionModel = model
    interactionSphereRadius = sphereRadius
    interactionOffsetLimit = {
      left: leftOffsetLimit,
      right: rightOffsetLimit,
    }
    const torusGeometry =
      buildThreeTorusWireGeometry(torusParameters).geometry
    const sphereGeometry = new SphereGeometry({
      radius: sphereRadius,
      widthSegments: 28,
      heightSegments: 18,
    }).toWireframe()
    geometries.push(torusGeometry, sphereGeometry)

    const leftRoot = new Object3D()
    leftRoot.position.copy(pointVector(model.leftTorusCenter))
    leftRoot.scale.set(leftScale, leftScale, leftScale)
    const leftTorusMaterial = new LineGlowMaterial({
      color: new Color(0.19, 0.75, 1, 0.58),
      glowColor: new Color(0.25, 0.84, 1, 0.2),
      glowIntensity: 1.3,
      opacity: 1,
      visibilityMode: "scene",
    })
    leftRoot.add(new LineSegments(torusGeometry, leftTorusMaterial))
    registerFormulaMaterial(
      ["tl", "r-major", "r-tube", "c", "scale-left", "g-left"],
      leftTorusMaterial,
    )
    space.add(leftRoot)

    const rightRoot = new Object3D()
    rightRoot.position.copy(pointVector(model.rightTorusCenter))
    rightRoot.scale.set(rightScale, rightScale, rightScale)
    const rightTorusMaterial = new LineGlowMaterial({
      color: new Color(0.75, 0.35, 1, 0.58),
      glowColor: new Color(0.82, 0.5, 1, 0.2),
      glowIntensity: 1.3,
      opacity: 1,
      visibilityMode: "scene",
    })
    rightRoot.add(new LineSegments(torusGeometry, rightTorusMaterial))
    registerFormulaMaterial(
      ["tr", "scale-right", "g-right"],
      rightTorusMaterial,
    )
    space.add(rightRoot)

    const leftSphereMaterial = new LineGlowMaterial({
      color: new Color(0.25, 0.88, 1, 0.96),
      glowColor: new Color(0.55, 0.94, 1, 0.58),
      glowIntensity: 3,
      opacity: 1,
      visibilityMode: "scene",
    })
    const leftSphere = new LineSegments(sphereGeometry, leftSphereMaterial)
    registerFormulaMaterial(["sl", "rho"], leftSphereMaterial)
    leftSphere.position.copy(pointVector(model.leftCenter))
    space.add(leftSphere)
    const rightSphereMaterial = new LineGlowMaterial({
      color: new Color(0.89, 0.48, 1, 0.96),
      glowColor: new Color(0.95, 0.7, 1, 0.58),
      glowIntensity: 3,
      opacity: 1,
      visibilityMode: "scene",
    })
    const rightSphere = new LineSegments(sphereGeometry, rightSphereMaterial)
    registerFormulaMaterial(["sr"], rightSphereMaterial)
    rightSphere.position.copy(pointVector(model.rightCenter))
    space.add(rightSphere)

    const edgeMaterial = new LineGlowMaterial({
      color: new Color(1, 0.48, 0.12, 0.96),
      glowColor: new Color(1, 0.25, 0.04, 0.38),
      glowIntensity: 2.8,
      luminanceBoost: 1.2,
      opacity: 1,
      visibilityMode: "overlay",
    })
    addLine(
      thickPolylineGeometry(
        model.curve,
        Math.min(0.4, Math.max(0.12, sphereRadius * 0.08)),
      ),
      edgeMaterial,
    )
    registerFormulaMaterial(
      ["p", "t", "theta", "h", "dt", "dh", "psi", "lambda-field"],
      edgeMaterial,
    )

    if (elements.helpers.checked) {
      const helper = new LineBasicMaterial({
        color: new Color(1, 1, 1, 0.72),
        opacity: 1,
      })
      const faintHelper = new LineBasicMaterial({
        color: new Color(1, 1, 1, 0.3),
        opacity: 1,
      })
      const minimumZ = -torusOuterRadius * 0.25
      const maximumZ = model.maximumHeight + torusOuterRadius * 0.45
      addLine(segmentGeometry([
        [
          {...model.leftCenter, z: minimumZ},
          {...model.leftCenter, z: maximumZ},
        ],
        [
          {...model.rightCenter, z: minimumZ},
          {...model.rightCenter, z: maximumZ},
        ],
      ]), faintHelper)

      const formulaHelperMaterial = (
        keys: readonly string[],
      ): LineGlowMaterial => {
        const material = new LineGlowMaterial({
          color: new Color(1, 1, 1, 0.72),
          glowIntensity: 0.8,
          opacity: 1,
          visibilityMode: "overlay",
        })
        registerFormulaMaterial(keys, material)
        return material
      }
      addLine(
        segmentGeometry([[model.leftCenter, model.rightCenter]]),
        formulaHelperMaterial(["span"]),
      )
      const heightMaterial = formulaHelperMaterial(["h"])
      if (model.hermite) {
        addLine(
          segmentGeometry([[model.leftCenter, model.leftControl]]),
          formulaHelperMaterial(["v-left", "d-left", "l-left"]),
        )
        addLine(
          segmentGeometry([[model.rightCenter, model.rightControl]]),
          formulaHelperMaterial(["v-right", "d-right", "l-right"]),
        )
      } else {
        addLine(segmentGeometry([
          [model.leftCenter, model.leftControl],
          [model.rightCenter, model.rightControl],
        ]), heightMaterial)
      }

      const majorRadiusStart = model.leftTorusCenter
      const majorRadiusEnd = {
        ...model.leftTorusCenter,
        y: model.leftTorusCenter.y + leftTorus.radius,
      }
      addLine(segmentGeometry([
        [majorRadiusStart, majorRadiusEnd],
      ]), formulaHelperMaterial(["r-major"]))

      const tubeRadiusEnd = {
        ...majorRadiusEnd,
        z: leftTorus.tube,
      }
      addLine(segmentGeometry([
        [majorRadiusEnd, tubeRadiusEnd],
      ]), formulaHelperMaterial(["r-tube"]))

      const clearanceEnd = {
        ...tubeRadiusEnd,
        z: leftTorus.tube + settings.clearance,
      }
      addLine(segmentGeometry([
        [tubeRadiusEnd, clearanceEnd],
      ]), formulaHelperMaterial(["c"]))

      const heightArrowSize = Math.max(0.8, torusOuterRadius * 0.08)
      const heightDimension = (
        center: EdgeConstraintPoint,
        height: number,
      ): readonly (readonly [EdgeConstraintPoint, EdgeConstraintPoint])[] => {
        const bottom = {...center, y: -torusOuterRadius * 1.3}
        const top = {...bottom, z: height}
        return [
          [bottom, top],
          [
            bottom,
            {
              ...bottom,
              x: bottom.x + heightArrowSize,
              z: bottom.z + heightArrowSize,
            },
          ],
          [
            bottom,
            {
              ...bottom,
              x: bottom.x - heightArrowSize,
              z: bottom.z + heightArrowSize,
            },
          ],
          [
            top,
            {
              ...top,
              x: top.x + heightArrowSize,
              z: top.z - heightArrowSize,
            },
          ],
          [
            top,
            {
              ...top,
              x: top.x - heightArrowSize,
              z: top.z - heightArrowSize,
            },
          ],
        ]
      }
      if (!model.hermite) {
        addLine(segmentGeometry([
          ...heightDimension(model.leftTorusCenter, model.leftControlHeight),
          ...heightDimension(model.rightTorusCenter, model.rightControlHeight),
        ]), heightMaterial)
      }
      addLine(
        polylineGeometry(
          circlePoints(model.leftTorusCenter, 0, leftOffsetLimit),
          true,
        ),
        faintHelper,
      )
      addLine(
        polylineGeometry(
          circlePoints(model.rightTorusCenter, 0, rightOffsetLimit),
          true,
        ),
        faintHelper,
      )
      addLine(
        segmentGeometry(centerDistanceDimension(
          model,
          -torusOuterRadius * 1.3,
          Math.max(0.8, torusOuterRadius * 0.08),
        )),
        formulaHelperMaterial(["distance"]),
      )
      const sphereRadiusEnd = {
        ...model.leftCenter,
        x: model.leftCenter.x + sphereRadius,
      }
      addLine(segmentGeometry([
        [model.leftCenter, sphereRadiusEnd],
        [
          sphereRadiusEnd,
          {
            ...sphereRadiusEnd,
            x: sphereRadiusEnd.x - sphereRadius * 0.28,
            y: sphereRadiusEnd.y + sphereRadius * 0.18,
          },
        ],
        [
          sphereRadiusEnd,
          {
            ...sphereRadiusEnd,
            x: sphereRadiusEnd.x - sphereRadius * 0.28,
            y: sphereRadiusEnd.y - sphereRadius * 0.18,
          },
        ],
      ]), formulaHelperMaterial(["rho"]))
      const controlGeometry = new SphereGeometry({
        radius: Math.max(0.25, sphereRadius * 0.24),
        widthSegments: 12,
        heightSegments: 8,
      }).toWireframe()
      geometries.push(controlGeometry)
      for (const [key, control] of [
        ["cl", model.leftControl],
        ["cr", model.rightControl],
      ] as const) {
        const controlMaterial = new LineGlowMaterial({
          color: new Color(1, 1, 1, 0.72),
          glowIntensity: 1,
          opacity: 1,
          visibilityMode: "overlay",
        })
        const marker = new LineSegments(controlGeometry, controlMaterial)
        marker.position.copy(pointVector(control))
        marker.frustumCulled = false
        space.add(marker)
        registerFormulaMaterial(
          model.hermite
            ? key === "cl"
              ? ["v-left", "d-left", "l-left"]
              : ["v-right", "d-right", "l-right"]
            : [key],
          controlMaterial,
        )
      }
      const centerTick = Math.max(0.35, sphereRadius * 0.3)
      addLine(segmentGeometry([
        [
          {...model.leftTorusCenter, x: model.leftTorusCenter.x - centerTick},
          {...model.leftTorusCenter, x: model.leftTorusCenter.x + centerTick},
        ],
        [
          {...model.leftTorusCenter, y: model.leftTorusCenter.y - centerTick},
          {...model.leftTorusCenter, y: model.leftTorusCenter.y + centerTick},
        ],
        [
          {...model.rightTorusCenter, x: model.rightTorusCenter.x - centerTick},
          {...model.rightTorusCenter, x: model.rightTorusCenter.x + centerTick},
        ],
        [
          {...model.rightTorusCenter, y: model.rightTorusCenter.y - centerTick},
          {...model.rightTorusCenter, y: model.rightTorusCenter.y + centerTick},
        ],
      ]), helper)
    }
    updateOutputs(model, settings, torusParameters)
    updateFormulaHighlight(false)
    requestRender()
  }

  const resize = (): void => {
    const rect = elements.canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    renderer.setSize(Math.floor(rect.width), Math.floor(rect.height))
    viewPoint.setAspectRatio(rect.width / rect.height)
    viewPoint.update()
  }

  const setView = (view: string): void => {
    activeView = view
    const torus = readStoredTorusDefaults(localStorage)
    const settings = input(torus)
    const span = Math.max(
      settings.centerDistance +
        (torus.radius + torus.tube) *
        Math.max(settings.leftTorusScale ?? 1, settings.rightTorusScale ?? 1) *
        3,
      modelSpanForSettings(settings),
    )
    const target = viewPoint.getTarget()
    target.set(
      0,
      0,
      (
        torus.tube *
        Math.max(settings.leftTorusScale ?? 1, settings.rightTorusScale ?? 1) +
        settings.clearance +
        (
          activeVariant === "hermite"
            ? Math.max(
                settings.leftTangentLength ?? settings.centerDistance * 2,
                settings.rightTangentLength ?? settings.centerDistance * 2,
              ) / 3
            : settings.extraLift
        )
      ) * 0.3,
    )
    switch (view) {
      case "front":
        viewPoint.position.set(0, -span, target.z)
        viewPoint.getUp().set(0, 0, 1)
        break
      case "top":
        viewPoint.position.set(0, 0, span)
        viewPoint.getUp().set(0, 1, 0)
        break
      default:
        viewPoint.position.set(0, -span * 0.9, span * 0.45)
        viewPoint.getUp().set(0, 0, 1)
        break
    }
    viewPoint.update()
    for (const button of elements.viewButtons) {
      button.classList.toggle("active", button.dataset.edgesView === view)
    }
    requestRender()
  }

  const modelSpanForSettings = (settings: EdgeConstraintInput): number =>
    (
      settings.torusTube *
      Math.max(settings.leftTorusScale ?? 1, settings.rightTorusScale ?? 1) +
      settings.clearance +
      (
        activeVariant === "hermite"
          ? Math.max(
              settings.leftTangentLength ?? settings.centerDistance * 2,
              settings.rightTangentLength ?? settings.centerDistance * 2,
            ) / 3
          : settings.extraLift
      ) +
      1
    ) * 4

  const projectWorldPoint = (
    point: EdgeConstraintPoint,
  ): Readonly<{x: number; y: number}> => {
    const rect = elements.canvas.getBoundingClientRect()
    const projected = pointVector(point)
      .applyMatrix4(viewPoint.viewMatrix)
      .applyMatrix4(viewPoint.projectionMatrix)
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (0.5 - projected.y * 0.5) * rect.height,
    }
  }

  const placeSceneMeasure = (
    element: HTMLElement,
    point: EdgeConstraintPoint,
    offsetX = 0,
    offsetY = 0,
  ): void => {
    const rect = elements.canvas.getBoundingClientRect()
    const projected = projectWorldPoint(point)
    const halfWidth = Math.max(95, element.offsetWidth / 2)
    const halfHeight = Math.max(30, element.offsetHeight / 2)
    const left = projected.x + offsetX
    const top = projected.y + offsetY
    element.style.left =
      `${Math.min(rect.width - halfWidth, Math.max(halfWidth, left))}px`
    element.style.top =
      `${Math.min(rect.height - halfHeight, Math.max(halfHeight, top))}px`
  }

  const updateSceneMeasures = (): void => {
    if (!interactionModel) return
    const torus = readStoredTorusDefaults(localStorage)
    const leftScale = Number(elements.leftTorusScale.value)
    const rightScale = Number(elements.rightTorusScale.value)
    const baseOuterRadius = torus.radius + torus.tube
    const leftOuterRadius = baseOuterRadius * leftScale
    const rightOuterRadius = baseOuterRadius * rightScale
    const outerRadius = Math.max(leftOuterRadius, rightOuterRadius)
    const distanceAnchor = {
      x: 0,
      y: -outerRadius * 1.3,
      z: 0,
    }
    const sphereAnchor = {
      ...interactionModel.leftCenter,
      y: interactionModel.leftCenter.y - Number(elements.sphereRadius.value),
    }
    const clearanceAnchor = {
      x: interactionModel.leftTorusCenter.x,
      y: interactionModel.leftTorusCenter.y + leftOuterRadius * 0.9,
      z: torus.tube * leftScale + Number(elements.clearance.value) / 2,
    }
    const routeAnchor = interactionModel.curve.reduce(
      (highest, point) => point.z > highest.z ? point : highest,
      interactionModel.curve[0]!,
    )
    placeSceneMeasure(elements.measureDistance, distanceAnchor, 0, 42)
    placeSceneMeasure(
      elements.measureLeftScale,
      {
        ...interactionModel.leftTorusCenter,
        y: interactionModel.leftTorusCenter.y + leftOuterRadius,
      },
      -82,
      72,
    )
    placeSceneMeasure(
      elements.measureRightScale,
      {
        ...interactionModel.rightTorusCenter,
        y: interactionModel.rightTorusCenter.y + rightOuterRadius,
      },
      82,
      72,
    )
    placeSceneMeasure(elements.measureSphere, sphereAnchor, -72, 38)
    placeSceneMeasure(
      elements.measureClearance,
      clearanceAnchor,
      -105,
      -10,
    )
    if (!elements.measureLift.hidden) {
      placeSceneMeasure(
        elements.measureLift,
        interactionModel.leftControl,
        95,
        -35,
      )
    }
    if (interactionModel.hermite) {
      placeSceneMeasure(
        elements.measureLeftDirection,
        interactionModel.leftControl,
        -115,
        -38,
      )
      placeSceneMeasure(
        elements.measureLeftTangent,
        interactionModel.leftControl,
        -115,
        40,
      )
      placeSceneMeasure(
        elements.measureRightDirection,
        interactionModel.rightControl,
        115,
        -38,
      )
      placeSceneMeasure(
        elements.measureRightTangent,
        interactionModel.rightControl,
        115,
        40,
      )
    }
    placeSceneMeasure(elements.measureRoute, routeAnchor, 0, -50)
  }

  const updateFormulaLinks = (): void => {
    if (!interactionModel) return
    const stageRect = elements.canvas.getBoundingClientRect()
    const torus = readStoredTorusDefaults(localStorage)
    const sphereRadius = Number(elements.sphereRadius.value)
    const clearance = Number(elements.clearance.value)
    const leftScale = Number(elements.leftTorusScale.value)
    const rightScale = Number(elements.rightTorusScale.value)
    const leftTorus = {
      radius: torus.radius * leftScale,
      tube: torus.tube * leftScale,
    }
    const rightTorus = {
      radius: torus.radius * rightScale,
      tube: torus.tube * rightScale,
    }
    const outerRadius = Math.max(
      leftTorus.radius + leftTorus.tube,
      rightTorus.radius + rightTorus.tube,
    )
    const curveMidpoint =
      interactionModel.curve[Math.floor(interactionModel.curve.length / 2)]!
    const curveQuarter =
      interactionModel.curve[Math.floor(interactionModel.curve.length / 4)]!
    let closestCurvePoint = curveMidpoint
    let closestDistance = Number.POSITIVE_INFINITY
    for (const point of interactionModel.curve) {
      const candidate = Math.min(
        torusSurfaceDistance(
          point,
          interactionModel.leftTorusCenter,
          leftTorus.radius,
          leftTorus.tube,
        ),
        torusSurfaceDistance(
          point,
          interactionModel.rightTorusCenter,
          rightTorus.radius,
          rightTorus.tube,
        ),
      )
      if (candidate < closestDistance) {
        closestDistance = candidate
        closestCurvePoint = point
      }
    }
    const worldTargets: Readonly<Record<string, EdgeConstraintPoint>> = {
      p: curveMidpoint,
      t: curveQuarter,
      sl: interactionModel.leftCenter,
      sr: interactionModel.rightCenter,
      cl: interactionModel.leftControl,
      cr: interactionModel.rightControl,
      h: {
        ...interactionModel.leftCenter,
        z: interactionModel.leftControlHeight / 2,
      },
      dt: closestCurvePoint,
      c: {
        x: interactionModel.leftTorusCenter.x,
        y: interactionModel.leftTorusCenter.y + leftTorus.radius,
        z: leftTorus.tube + clearance,
      },
      tl: interactionModel.leftTorusCenter,
      tr: interactionModel.rightTorusCenter,
      "r-major": {
        x: interactionModel.leftTorusCenter.x,
        y: interactionModel.leftTorusCenter.y + leftTorus.radius,
        z: 0,
      },
      "r-tube": {
        x: interactionModel.leftTorusCenter.x,
        y: interactionModel.leftTorusCenter.y + leftTorus.radius,
        z: leftTorus.tube,
      },
      rho: {
        ...interactionModel.leftCenter,
        x: interactionModel.leftCenter.x + sphereRadius,
      },
      distance: {
        x: 0,
        y: -outerRadius * 1.3,
        z: 0,
      },
      "scale-left": {
        ...interactionModel.leftTorusCenter,
        y: interactionModel.leftTorusCenter.y + leftTorus.radius,
      },
      "scale-right": {
        ...interactionModel.rightTorusCenter,
        y: interactionModel.rightTorusCenter.y + rightTorus.radius,
      },
      span: {
        x: (interactionModel.leftCenter.x + interactionModel.rightCenter.x) / 2,
        y: (interactionModel.leftCenter.y + interactionModel.rightCenter.y) / 2,
        z: 0,
      },
      theta: curveQuarter,
      "g-left": interactionModel.leftTorusCenter,
      "g-right": interactionModel.rightTorusCenter,
      psi: interactionModel.curve.reduce(
        (highest, point) => point.z > highest.z ? point : highest,
        interactionModel.curve[0]!,
      ),
      "lambda-field": interactionModel.curve.reduce(
        (highest, point) => point.z > highest.z ? point : highest,
        interactionModel.curve[0]!,
      ),
      "d-left": interactionModel.leftControl,
      "d-right": interactionModel.rightControl,
      "l-left": interactionModel.leftControl,
      "l-right": interactionModel.rightControl,
      "v-left": interactionModel.leftControl,
      "v-right": interactionModel.rightControl,
    }
    const domTargets: Readonly<Record<string, HTMLElement>> = {
      dh: elements.measureLift,
      "d-left": elements.measureLeftDirection,
      "d-right": elements.measureRightDirection,
      "l-left": elements.measureLeftTangent,
      "l-right": elements.measureRightTangent,
    }
    const paths = elements.formulaLinks.querySelectorAll<SVGPathElement>(
      "[data-edges-formula-link]",
    )
    formulaTargetPoints = new Map()
    elements.formulaLinks.setAttribute(
      "viewBox",
      `0 0 ${stageRect.width} ${stageRect.height}`,
    )
    paths.forEach((path) => {
      const key = path.dataset.edgesFormulaLink
      const variable = key ? formulaVariableForKey(key) : null
      if (!key || !variable) {
        path.setAttribute("d", "")
        return
      }
      const color = FORMULA_LINK_COLORS[key] ?? "#ffffff"
      variable.style.color = color
      path.style.color = color
      path.style.stroke = color
      const variableRect = variable.getBoundingClientRect()
      const source = {
        x: variableRect.left - stageRect.left + variableRect.width / 2,
        y: variableRect.bottom - stageRect.top,
      }
      const domTarget = domTargets[key]
      const target = domTarget
        ? (() => {
            const rect = domTarget.getBoundingClientRect()
            return {
              x: rect.left - stageRect.left + rect.width / 2,
              y: rect.top - stageRect.top,
            }
          })()
        : projectWorldPoint(worldTargets[key] ?? curveMidpoint)
      formulaTargetPoints.set(key, target)
      const verticalDistance = target.y - source.y
      const firstControlY = source.y + Math.max(34, verticalDistance * 0.22)
      const secondControlY = target.y - Math.max(42, verticalDistance * 0.3)
      path.setAttribute(
        "d",
        `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} ` +
        `C ${source.x.toFixed(1)} ${firstControlY.toFixed(1)} ` +
        `${target.x.toFixed(1)} ${secondControlY.toFixed(1)} ` +
        `${target.x.toFixed(1)} ${target.y.toFixed(1)}`,
      )
    })
    updateFormulaHighlight(false)
  }

  const renderOnce = (): void => {
    frame = 0
    if (!active || disposed) return
    space.updateWorldMatrix()
    renderer.render(space, viewPoint)
    updateSceneMeasures()
    updateFormulaLinks()
  }

  function requestRender(): void {
    if (!active || disposed || frame !== 0) return
    frame = requestAnimationFrame(renderOnce)
  }

  const observer = new ResizeObserver(() => {
    resize()
    annotation.resize()
    requestRender()
  })
  observer.observe(elements.canvas)
  elements.addExample.addEventListener("click", saveCurrentExample)
  const rebuildInputs = [
    elements.centerDistance,
    elements.clearance,
    elements.extraLift,
    elements.leftDirection,
    elements.leftTangentLength,
    elements.leftTorusScale,
    elements.rightDirection,
    elements.rightTangentLength,
    elements.rightTorusScale,
    elements.sphereRadius,
  ]
  for (const control of rebuildInputs) {
    control.addEventListener("input", () => {
      if (
        control === elements.leftTangentLength ||
        control === elements.rightTangentLength
      ) {
        hermiteTangentsCustomized = true
      } else if (
        activeVariant === "hermite" &&
        !hermiteTangentsCustomized &&
        (
          control === elements.centerDistance ||
          control === elements.leftTorusScale ||
          control === elements.rightTorusScale
        )
      ) {
        applyHermiteShoulderDefaults()
      }
      rebuild()
      if (
        control === elements.leftTorusScale ||
        control === elements.rightTorusScale
      ) {
        setView(activeView)
      }
    })
  }
  elements.helpers.addEventListener("change", rebuild)
  for (const button of elements.viewButtons) {
    button.addEventListener("click", () => {
      setView(button.dataset.edgesView ?? "perspective")
    })
  }
  const formulaHighlightCleanups: Array<() => void> = []
  for (const path of elements.formulaLinks.querySelectorAll<SVGPathElement>(
    "[data-edges-formula-link]",
  )) {
    const key = path.dataset.edgesFormulaLink
    if (!key) continue
    const activate = (): void => {
      activeFormulaKey = key
      updateFormulaHighlight()
    }
    const deactivate = (): void => {
      if (activeFormulaKey !== key) return
      activeFormulaKey = null
      updateFormulaHighlight()
    }
    path.addEventListener("pointerenter", activate)
    path.addEventListener("pointerleave", deactivate)
    formulaHighlightCleanups.push(() => {
      path.removeEventListener("pointerenter", activate)
      path.removeEventListener("pointerleave", deactivate)
    })
  }
  for (const variable of document.querySelectorAll<HTMLElement>(
    ".edges-formula-variable",
  )) {
    const key = formulaKeyForVariable(variable)
    if (!key) continue
    const activate = (): void => {
      activeFormulaKey = key
      updateFormulaHighlight()
    }
    const deactivate = (): void => {
      if (activeFormulaKey !== key) return
      activeFormulaKey = null
      updateFormulaHighlight()
    }
    variable.addEventListener("pointerenter", activate)
    variable.addEventListener("pointerleave", deactivate)
    formulaHighlightCleanups.push(() => {
      variable.removeEventListener("pointerenter", activate)
      variable.removeEventListener("pointerleave", deactivate)
    })
  }
  const requestRenderFromDrag = (event: MouseEvent): void => {
    if (event.buttons !== 0) requestRender()
  }
  const requestRenderFromCamera = (): void => requestRender()
  const raycaster = new Raycaster()
  type SphereSide = "left" | "right"
  let draggedSphere: SphereSide | null = null
  let dragGrabOffset = {x: 0, y: 0}

  const rayFromClient = (clientX: number, clientY: number) => {
    const rect = elements.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    viewPoint.update()
    raycaster.setFromCamera({
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: 1 - ((clientY - rect.top) / rect.height) * 2,
    }, viewPoint)
    return raycaster.ray
  }

  const pointOnTorusPlane = (
    clientX: number,
    clientY: number,
  ): EdgeConstraintPoint | null => {
    const ray = rayFromClient(clientX, clientY)
    if (!ray || Math.abs(ray.direction.z) < 1e-6) return null
    const travel = -ray.origin.z / ray.direction.z
    if (!Number.isFinite(travel) || travel < 0) return null
    return {
      x: ray.origin.x + ray.direction.x * travel,
      y: ray.origin.y + ray.direction.y * travel,
      z: 0,
    }
  }

  const sphereHitDistance = (
    center: EdgeConstraintPoint,
    clientX: number,
    clientY: number,
  ): number | null => {
    const ray = rayFromClient(clientX, clientY)
    if (!ray) return null
    const toCenterX = center.x - ray.origin.x
    const toCenterY = center.y - ray.origin.y
    const toCenterZ = center.z - ray.origin.z
    const alongRay =
      toCenterX * ray.direction.x +
      toCenterY * ray.direction.y +
      toCenterZ * ray.direction.z
    if (alongRay < 0) return null
    const centerDistanceSquared =
      toCenterX ** 2 + toCenterY ** 2 + toCenterZ ** 2
    const closestDistanceSquared =
      centerDistanceSquared - alongRay ** 2
    const radiusSquared = interactionSphereRadius ** 2
    if (closestDistanceSquared > radiusSquared) return null
    return alongRay - Math.sqrt(
      Math.max(0, radiusSquared - closestDistanceSquared),
    )
  }

  const sphereAtClient = (
    clientX: number,
    clientY: number,
  ): SphereSide | null => {
    if (!interactionModel || interactionSphereRadius <= 0) return null
    const leftDistance = sphereHitDistance(
      interactionModel.leftCenter,
      clientX,
      clientY,
    )
    const rightDistance = sphereHitDistance(
      interactionModel.rightCenter,
      clientX,
      clientY,
    )
    if (leftDistance === null) {
      return rightDistance === null ? null : "right"
    }
    if (rightDistance === null) return "left"
    return leftDistance <= rightDistance ? "left" : "right"
  }

  const startSphereDrag = (event: MouseEvent): void => {
    if (event.button !== 0 || !interactionModel) return
    const side = sphereAtClient(event.clientX, event.clientY)
    const planePoint = pointOnTorusPlane(event.clientX, event.clientY)
    if (!side || !planePoint) return
    const center = side === "left"
      ? interactionModel.leftCenter
      : interactionModel.rightCenter
    dragGrabOffset = {
      x: center.x - planePoint.x,
      y: center.y - planePoint.y,
    }
    draggedSphere = side
    elements.canvas.style.cursor = "grabbing"
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const moveSphere = (event: MouseEvent): void => {
    if (!draggedSphere || !interactionModel) return
    const planePoint = pointOnTorusPlane(event.clientX, event.clientY)
    if (!planePoint) return
    const torusCenter = draggedSphere === "left"
      ? interactionModel.leftTorusCenter
      : interactionModel.rightTorusCenter
    const offset = constrainSphereOffset(
      planePoint.x + dragGrabOffset.x - torusCenter.x,
      planePoint.y + dragGrabOffset.y - torusCenter.y,
      interactionOffsetLimit[draggedSphere],
    )
    sphereOffsets = {...sphereOffsets, [draggedSphere]: offset}
    if (activeVariant === "hermite" && !hermiteTangentsCustomized) {
      applyHermiteShoulderDefaults()
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    rebuild()
  }

  const finishSphereDrag = (event: MouseEvent): void => {
    if (!draggedSphere) return
    draggedSphere = null
    elements.canvas.style.cursor = ""
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const updateSphereCursor = (event: MouseEvent): void => {
    if (draggedSphere || event.buttons !== 0) return
    elements.canvas.style.cursor =
      sphereAtClient(event.clientX, event.clientY) ? "grab" : ""
  }

  elements.canvas.addEventListener("mousedown", startSphereDrag, true)
  elements.canvas.addEventListener("mousemove", updateSphereCursor, true)
  document.addEventListener("mousemove", moveSphere, true)
  document.addEventListener("mouseup", finishSphereDrag, true)
  elements.canvas.addEventListener("mousemove", requestRenderFromDrag)
  elements.canvas.addEventListener("wheel", requestRenderFromCamera)
  elements.canvas.addEventListener("touchmove", requestRenderFromCamera)

  rebuild()
  return {
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      annotation.dispose()
      elements.addExample.removeEventListener("click", saveCurrentExample)
      for (const cleanup of formulaHighlightCleanups) cleanup()
      elements.canvas.removeEventListener("mousedown", startSphereDrag, true)
      elements.canvas.removeEventListener("mousemove", updateSphereCursor, true)
      document.removeEventListener("mousemove", moveSphere, true)
      document.removeEventListener("mouseup", finishSphereDrag, true)
      elements.canvas.removeEventListener("mousemove", requestRenderFromDrag)
      elements.canvas.removeEventListener("wheel", requestRenderFromCamera)
      elements.canvas.removeEventListener("touchmove", requestRenderFromCamera)
      viewPoint.dispose()
      for (const geometry of geometries) renderer.invalidateGeometry(geometry)
    },
    hide() {
      active = false
      exampleLoadVersion += 1
      annotation.hide()
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
    },
    show(variant) {
      activeVariant = variant
      if (variant === "hermite" && !hermiteControlsInitialized) {
        applyHermiteShoulderDefaults()
      }
      activeFormulaKey = null
      elements.viewport.hidden = false
      active = true
      annotation.show()
      resize()
      rebuild()
      setView("perspective")
      requestRender()
      void loadExamples(variant)
    },
    showOverview() {
      active = false
      activeFormulaKey = null
      elements.viewport.hidden = true
      annotation.hide()
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      void loadExamples(null)
    },
  }
}
