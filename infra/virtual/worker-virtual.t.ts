/**
 * Режим рисования связей между детьми одного родителя
 * - "none"        — не рисовать связи
 * - "adjacent"    — соединять соседние по индексу
 * - "all-siblings"— соединять каждую пару
 * - "parent"      — соединять родителя с каждым ребенком
 */
export type LinkMode = "none" | "adjacent" | "all-siblings" | "parent"

/**
 * Распределение начальных углов детей
 * - "uniform" — равномерно по индексу
 * - "golden"  — «золотой угол» (лучше заполняет круг при большом числе детей)
 * - "vertical" — вертикальное выстраивание снизу вверх
 */
export type AngleDistribution = "uniform" | "golden" | "vertical"

/**
 * Режим раскладки частиц
 * - "line" — одномерная (все дети над родителем, один X)
 * - "tree" — древовидная (братья равномерно по дуге, но на одной орбите)
 */
export type LayoutMode = "line" | "tree"

/**
 * Где рисовать орбиту:
 * - "center" — по центру полосы (проходит через точку)
 * - "outer"  — по внешней границе полосы (внешний радиус)
 * - "inner"  — по внутренней границе полосы (внутренний радиус)
 * - "band"   — рисовать саму полосу: две окружности (inner и outer)
 */
export type OrbitLineAt = "inner" | "center" | "outer" | "band"

/**
 * Конфиг визуализации (все расстояния — в «радиальных юнитах» до масштабирования)
 */
export interface ParticlesConfig {
  /** Режим раскладки частиц */
  layout?: LayoutMode
  /** Включить console-логи */
  debug?: boolean
  /** Доля от половины меньшей стороны экрана (0..1) */
  viewMargin?: number
  /** Полная ширина «полосы» для ЛИСТА (узел без детей) */
  leafBandWidth?: number
  /** Отступ от центра родителя до внутренней кромки ПЕРВОЙ орбиты */
  firstBandOffset?: number
  /** Зазор между соседними орбитами детей одного родителя */
  interBandGap?: number
  /** Нижний предел масштаба */
  minScale?: number
  /** Верхний предел масштаба */
  maxScale?: number
  /** Интерполяция позиции (0..1) */
  lerpPos?: number
  /** Интерполяция локального радиуса орбиты (0..1) */
  lerpRadius?: number
  /** Базовая угловая скорость (рад/кадр) */
  angleSpeedBase?: number
  /** speed = base / (depth+1)^attenuation */
  angleDepthAttenuation?: number
  /** Стратегия стартовых углов */
  angleDistribution?: AngleDistribution
  /** Рисовать орбиты */
  drawOrbits?: boolean
  /** Штрих-паттерн орбит, напр. [8,10] */
  orbitDash?: number[]
  /** Прозрачность линий орбит (0..1) */
  orbitAlpha?: number
  /** Режим связей между детьми */
  linkMode?: LinkMode
  /** Штрих-паттерн связей */
  linkDash?: number[]
  /** Максимальная длина связи */
  linkMaxDist?: number
  /** Базовая непрозрачность связи */
  linkBaseAlpha?: number
  /** Толщина «энергетических колец» */
  particleRingThickness?: number
  /** Размер ядра (root) */
  coreSize?: number
  /** База размера точки */
  nodeSizeBase?: number
  /** Надбавка к размеру за уровень */
  nodeSizePerDepth?: number
  /** Где рисовать орбиту */
  orbitLineAt?: OrbitLineAt
  /** Длительность вспышки при спауне (мс) */
  flareDuration?: number
  /** Стартовый радиус вспышки (px) */
  flareR0?: number
  /** Финальный радиус вспышки (px) */
  flareR1?: number
  /** Максимальная прозрачность вспышки (0..1) */
  flareMaxAlpha?: number
  /** Интенсивность дрожания (px) */
  shakeIntensity?: number
  /** Скорость дрожания */
  shakeSpeed?: number
  /** Вариация скорости между частицами */
  shakeVariation?: number
  /** Скорость пульсации */
  pulseSpeed?: number
  /** Амплитуда пульсации (0..1) */
  pulseAmplitude?: number
  /** Базовая величина пульсации (0..1) */
  pulseBase?: number
  /** Вариация времени между частицами (0..1) */
  pulseTimeVariation?: number
  /** Параметры для режима tree */
  tree?: TreeConfig
  /** Конфигурация подписей */
  label?: LabelConfig
  /** Задержка анимации - останавливаем анимацию если патч не приходит за указанное время (ms) */
  animateDelay?: number
}

/**
 * Конфигурация подписей частиц
 */
export interface LabelConfig {
  /** Показывать подписи */
  show?: boolean
  /** Шрифт подписей */
  font?: string
  /** Цвет основной подписи */
  color?: string
  /** Цвет дополнительной подписи */
  subColor?: string
  /** Цвет тени */
  shadow?: string
  /** Размытие тени */
  shadowBlur?: number
  /** Отступ от нижнего края частицы до первой строки */
  offsetY?: number
  /** Вертикальный шаг между строками */
  lineHeight?: number
  /** Максимальная ширина (мягкое усечение с «…») */
  maxWidth?: number
}

/**
 * Конфигурация для режима tree
 */
export interface TreeConfig {
  /** Ширина дуги распределения вокруг верхней точки (радианы) */
  spreadRad?: number
  /** Минимальный зазор между соседями вдоль дуги (в пикселях) */
  marginPx?: number
  /** Автомасштаб дуги под количество детей и радиус */
  autoSpread?: boolean
  /** Нижняя граница углового шага (радианы), null — не ограничивать */
  minAngleStepRad?: number | null
}

/**
 * Внутреннее состояние частицы
 */
export interface Particle {
  /** Текущая позиция X */
  x: number
  /** Текущая позиция Y */
  y: number
  /** Целевая позиция X */
  tx: number
  /** Целевая позиция Y */
  ty: number
  /** Сглаженный локальный радиус (от родителя до центра полосы) */
  orbitRadius: number
  /** Целевой локальный радиус (центр полосы) */
  targetOrbitRadius: number
  /** Половина ширины «полосы» */
  bandHalf: number
  /** Угол относительно родителя */
  angle: number
  /** Угловая скорость */
  speed: number
  /** Глубина (root=0) */
  depth: number
  /** Является ли корневой частицей */
  isCore: boolean
  /** Путь к родителю */
  parentPath: string | null
  /** Смещение дрожания по X */
  shakeOffsetX: number
  /** Смещение дрожания по Y */
  shakeOffsetY: number
  /** Фаза дрожания для уникальности */
  shakePhase: number
  /** Seed для пульсации (уникальная фаза) */
  pulseSeed: number
  /** Основная подпись (из meta) */
  labelMain: string
  /** Дополнительная подпись (Atom id) */
  labelSub: string
}

/**
 * Вспышка при спауне частицы
 */
export interface Flare {
  /** Позиция X */
  x: number
  /** Позиция Y */
  y: number
  /** Время старта (мс) */
  t0: number
}

/**
 * Центр экрана
 */
export interface Center {
  x: number
  y: number
}
