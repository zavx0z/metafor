/** @type {Partial<import("./worker-virtual.t").ParticlesConfig>} */
export const line = {
  debug: false,
  layout: "line",

  viewMargin: 0.9,

  // геометрия упаковки
  leafBandWidth: 12,
  firstBandOffset: 12,
  interBandGap: 0,

  // масштаб
  minScale: 0.2,
  maxScale: 1,

  // плавность/углы
  lerpPos: 0.12,
  lerpRadius: 0.18,
  angleSpeedBase: 0.12,
  angleDepthAttenuation: 1,
  angleDistribution: "uniform",

  // орбиты/связи
  drawOrbits: true,
  orbitDash: [0, 0],
  orbitAlpha: 0.22,

  linkMode: "adjacent",
  linkDash: [5, 5],
  linkMaxDist: 180,
  linkBaseAlpha: 1,

  // частицы
  particleRingThickness: 2,
  coreSize: 4,
  nodeSizeBase: 2,
  nodeSizePerDepth: 0,

  // вспышка
  flareDuration: 420,
  flareR0: 10,
  flareR1: 90,
  flareMaxAlpha: 0.6,

  // дрожание
  shakeIntensity: 1.4,
  shakeSpeed: 44.0,
  shakeVariation: 0.8,

  // пульсация
  pulseSpeed: 22.0,
  pulseAmplitude: 0.3,
  pulseBase: 0.7,
  pulseTimeVariation: 0.5,

  // орбита
  orbitLineAt: "center",
  label: { show: false },
}
const nodeSize = 22
const fontSize = 10
/** @type {Partial<import("./worker-virtual.t").ParticlesConfig>} */
export const tree = {
  layout: "tree",
  // частицы
  particleRingThickness: 0,
  coreSize: nodeSize,
  nodeSizeBase: nodeSize,
  nodeSizePerDepth: 0,
  // геометрия упаковки по радиусу
  leafBandWidth: 444,
  firstBandOffset: 0,
  interBandGap: 0,
  // дрожание/пульсация
  shakeIntensity: 0,
  shakeSpeed: 0,
  shakeVariation: 0,

  pulseSpeed: 0.04,
  pulseAmplitude: 0.01,
  pulseBase: 0.2,
  pulseTimeVariation: 0.5,
  label: {
    show: true,
    font: `${fontSize}px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
    color: "rgba(200,230,255,0.95)",
    subColor: "rgba(180,210,235,0.75)",
    shadow: "rgba(0,0,0,0.6)",
    shadowBlur: 2,
    // отступ от нижнего края «ядра» до первой строки
    offsetY: -14,
    // вертикальный шаг между строками
    lineHeight: fontSize,
    // max ширина (мягкое усечение с «…»)
    maxWidth: 80,
  },
}
export const quantum = {
  debug: false,
  layout: "quantum",

  viewMargin: 0.9,

  // геометрия упаковки
  leafBandWidth: 12,
  firstBandOffset: 12,
  interBandGap: 0,

  // масштаб
  minScale: 0.2,
  maxScale: 1,

  // плавность/углы
  lerpPos: 0.12,
  lerpRadius: 0.18,
  angleSpeedBase: 0.12,
  angleDepthAttenuation: 1,
  angleDistribution: "uniform",

  // орбиты/связи
  drawOrbits: true,
  orbitDash: [0, 0],
  orbitAlpha: 0.22,

  linkMode: "adjacent",
  linkDash: [5, 5],
  linkMaxDist: 180,
  linkBaseAlpha: 1,

  // частицы
  particleRingThickness: 2,
  coreSize: 4,
  nodeSizeBase: 2,
  nodeSizePerDepth: 0,

  // вспышка
  flareDuration: 420,
  flareR0: 10,
  flareR1: 90,
  flareMaxAlpha: 0.6,

  // дрожание
  shakeIntensity: 1.4,
  shakeSpeed: 44.0,
  shakeVariation: 0.8,

  // пульсация
  pulseSpeed: 22.0,
  pulseAmplitude: 0.3,
  pulseBase: 0.7,
  pulseTimeVariation: 0.5,

  // орбита
  orbitLineAt: "center",
  label: { show: false },
}
