// ───────────────────────────────────────────────────────────────────────────────
// Particles Worker — 1D/line, 2D/tree и quantum (орбиты) раскладки с орбитами,
// авто-масштабом, плавными переходами и вспышкой при спауне.
//  • tree: у одного родителя все дети на ОДНОЙ орбите (общий пояс = max толщины
//          их поддеревьев), раскладка по дуге вокруг верхней точки.
//  • line: одномерная — дети над родителем (один X), у каждого свой радиус.
//  • quantum: как изначально — у каждого ребёнка свой радиус, вращение по кругу,
//             новые узлы спавнятся в СЛУЧАЙНОЙ фазе.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {import('./worker-virtual.t.js').ParticlesConfig} ParticlesConfig
 * @typedef {import('./worker-virtual.t.js').Particle} Particle
 * @typedef {import('./worker-virtual.t.js').Flare} Flare
 * @typedef {import('./worker-virtual.t.js').Center} Center
 * @typedef {import('./worker-virtual.t.js').LayoutMode} LayoutMode
 * @typedef {import('./worker-virtual.t.js').LinkMode} LinkMode
 * @typedef {import('./worker-virtual.t.js').AngleDistribution} AngleDistribution
 * @typedef {import('./worker-virtual.t.js').OrbitLineAt} OrbitLineAt
 * @typedef {import('./worker-virtual.t.js').TreeConfig} TreeConfig
 * @typedef {import('./worker-virtual.t.js').LabelConfig} LabelConfig
 */
/**
 * @param {string} uuid
 */
function shortUUID(uuid) {
  return uuid.slice(0, 8)
}
// ── Конфиг (можно переопределять через init/set-config) ───────────────────────
/** @type {ParticlesConfig} */
const DEFAULT_CONFIG = {
  // "line" | "tree" | "quantum"
  layout: /** @type {LayoutMode} */ ("tree"),

  // задержка анимации - останавливаем анимацию если патч не приходит за указанное время (ms)
  // 0 = не отслеживать, анимация работает постоянно
  animateDelay: 1000,
  debug: false,

  viewMargin: 0.9,

  // геометрия упаковки по радиусу
  leafBandWidth: 12,
  firstBandOffset: 12,
  interBandGap: 12,

  // масштаб
  minScale: 0.2,
  maxScale: 1,

  // плавность/углы
  lerpPos: 0.12,
  lerpRadius: 0.18,
  angleSpeedBase: 0.12,
  angleDepthAttenuation: 1,

  // стартовое распределение углов (для некоторых режимов)
  angleDistribution: /** @type {AngleDistribution} */ ("uniform"),

  // орбиты/связи
  drawOrbits: true,
  orbitDash: [0, 0],
  orbitAlpha: 0.22,

  // "parent" — соединять родителя с каждым ребёнком (по умолчанию)
  // доступны "adjacent" | "all-siblings" | "none"
  linkMode: /** @type {LinkMode} */ ("parent"),
  linkDash: [5, 5],
  linkMaxDist: 99999,
  linkBaseAlpha: 1,

  // частицы
  particleRingThickness: 2,
  coreSize: 4,
  nodeSizeBase: 2,
  nodeSizePerDepth: 0,

  // вспышка при спауне
  flareDuration: 420,
  flareR0: 10,
  flareR1: 90,
  flareMaxAlpha: 0.6,

  // дрожание/пульсация
  shakeIntensity: 1.4,
  shakeSpeed: 44.0,
  shakeVariation: 0.8,

  pulseAmplitude: 0.3,
  pulseBase: 0.7,
  pulseSpeed: 22.0,
  pulseTimeVariation: 0.5,

  // 2D/tree специфика
  tree: /** @type {TreeConfig} */ ({
    // ширина дуги распределения вокруг верхней точки (радианы)
    spreadRad: Math.PI / 2,
    // минимальный зазор между соседями вдоль дуги (в пикселях)
    marginPx: 8,
    // автомасштаб дуги под количество детей и радиус
    autoSpread: true,
    // нижняя граница углового шага (радианы), null — не ограничивать
    minAngleStepRad: null,
  }),

  // подписи
  label: /** @type {LabelConfig} */ ({
    show: true,
    font: "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "rgba(200,230,255,0.95)",
    subColor: "rgba(180,210,235,0.75)",
    shadow: "rgba(0,0,0,0.6)",
    shadowBlur: 2,
    offsetY: 10,
    lineHeight: 14,
    maxWidth: 160,
  }),
}

// текущий конфиг
let CONFIG = /** @type {ParticlesConfig} */ ({ ...DEFAULT_CONFIG })

// угол «над родителем» (одинаковый X)
const SPAWN_ANGLE = -Math.PI / 2

/** лог с учётом CONFIG.debug */
/** @param {...any} a */
function dlog(.../** @type {any[]} */ a) {
  if (CONFIG.debug) console.log(...a)
}

class ParticlesWorker {
  /**
   * @param {OffscreenCanvas} canvas
   * @param {number} width
   * @param {number} height
   */
  constructor(canvas, width, height) {
    /** @type {OffscreenCanvas} */ this.canvas = canvas
    /** @type {OffscreenCanvasRenderingContext2D} */
    this.ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext("2d"))
    if (!this.ctx) throw new Error("2D context failed")

    /** @type {Map<string, Particle>} */ this.particles = new Map()
    /** @type {Map<string, string[]>} */ this.childrenOf = new Map()
    /** @type {Set<string>}           */ this.justAdded = new Set()
    /** @type {Set<string>}           */ this.pendingFlares = new Set()
    /** @type {Flare[]}               */ this.flares = []

    this.isRunning = false
    this.screenWidth = width
    this.screenHeight = height
    /** @type {BroadcastChannel|null} */ this.broadcastChannel = null

    this.globalScale = 1
    /** @type {Center} */ this.center = { x: width / 2, y: height / 2 }

    // таймеры для animateDelay
    /** @type {number} */ this.lastPatchTime = 0
    /** @type {ReturnType<typeof setTimeout>|null} */ this.animationTimeoutId = null
    /** @type {boolean} */ this.isTrackingActivity = false

    this.setupCanvas()
    this.setupBroadcastChannel()
    this.startAnimation()
  }

  // поля для TS/JSDoc
  /** @type {OffscreenCanvas|undefined} */ canvas
  /** @type {OffscreenCanvasRenderingContext2D|undefined} */ ctx
  /** @type {Map<string, Particle>} */ particles
  /** @type {Map<string, string[]>} */ childrenOf
  /** @type {Set<string>} */ justAdded
  /** @type {Set<string>} */ pendingFlares
  /** @type {Flare[]} */ flares
  /** @type {boolean} */ isRunning
  /** @type {number} */ screenWidth
  /** @type {number} */ screenHeight
  /** @type {BroadcastChannel|null} */ broadcastChannel
  /** @type {number} */ globalScale
  /** @type {{x:number,y:number}} */ center
  /** @type {number} */ lastPatchTime
  /** @type {ReturnType<typeof setTimeout>|null} */ animationTimeoutId
  /** @type {boolean} */ isTrackingActivity

  setupCanvas() {
    if (!this.canvas) return
    this.canvas.width = this.screenWidth
    this.canvas.height = this.screenHeight
    this.center.x = this.canvas.width / 2
    this.center.y = this.canvas.height / 2
  }

  setupBroadcastChannel() {
    this.broadcastChannel = new BroadcastChannel("electromagnetic")
    this.broadcastChannel.onmessage = (event) => {
      /**@type {{data: import("@metafor/atom").Photon}} */
      const { data } = event
      const meta = data?.meta || null
      const atom = data?.atom || null
      const { path } = data || {}
      if (!path || !String(path).startsWith("0")) return

      // сбрасываем таймер анимации при получении патча (если включено отслеживание)
      this.resetAnimationTimer()

      for (const patch of data.impulses || []) {
        if (patch.path === "/" && patch.op === "add") this.addParticle(path, meta, atom)
        else if (patch.path === "/" && patch.op === "remove") this.removeParticle(path)
        else {
          if (meta || atom) this.updateParticleLabels(path, meta, atom)
        }
      }
    }
  }

  /** @param {string} path @param {any} meta @param {any} atom */
  updateParticleLabels(path, meta, atom) {
    const p = this.particles.get(path)
    if (!p) return
    if (meta && typeof meta === "object") {
      p.labelMain = meta.name ?? meta.title ?? meta.label ?? p.labelMain
    } else if (meta != null) {
      p.labelMain = String(meta)
    }
    if (atom != null) p.labelSub = shortUUID(atom)
  }

  // ── построение дерева и геометрии ───────────────────────────────────────────

  /** @param {string} path */
  getParent(path) {
    if (path === "0") return null
    const i = path.lastIndexOf("/")
    return i === -1 ? "0" : path.slice(0, i)
  }

  /** @param {number} depth */
  speedForDepth(depth) {
    return (CONFIG.angleSpeedBase ?? 0.12) / Math.pow(depth + 1, Math.max(0, CONFIG.angleDepthAttenuation ?? 1))
  }

  // равномерная дуга вокруг верхней точки SPAWN_ANGLE
  /** @param {number} n @param {number} orbitRpx */
  buildTreeAngles(n, orbitRpx) {
    if (n <= 0) return []
    if (n === 1) return [SPAWN_ANGLE]

    const tree = CONFIG.tree || {}
    const minStepFromMargin = orbitRpx > 0 ? (tree.marginPx || 8) / Math.max(1, orbitRpx) : 0
    const minStep = Math.max(0.0001, tree.minAngleStepRad != null ? tree.minAngleStepRad : 0, minStepFromMargin)

    let spread = tree.spreadRad || Math.PI / 2
    if (tree.autoSpread) {
      spread = Math.max(spread, minStep * (n - 1))
      spread = Math.min(spread, Math.PI * 2 - 0.001)
    }

    const step = Math.max(spread / (n - 1), minStep)
    const start = SPAWN_ANGLE - (step * (n - 1)) / 2

    const angles = new Array(n)
    for (let i = 0; i < n; i++) angles[i] = start + i * step
    return angles
  }

  rebuildTree() {
    this.childrenOf.clear()
    this.childrenOf.set("0", [])
    for (const [path] of this.particles) if (!this.childrenOf.has(path)) this.childrenOf.set(path, [])

    for (const [path, p] of this.particles) {
      if (path === "0") continue
      const parent = p.parentPath ?? "0"
      if (!this.childrenOf.has(parent)) this.childrenOf.set(parent, [])
      this.childrenOf.get(parent)?.push(path)
    }

    for (const [, arr] of this.childrenOf) {
      arr.sort((a, b) => {
        const as = a.split("/").map(Number),
          bs = b.split("/").map(Number)
        const n = Math.min(as.length, bs.length)
        for (let i = 0; i < n; i++) if (as[i] !== bs[i]) return (as[i] || 0) - (bs[i] || 0)
        return as.length - bs.length
      })
    }
  }

  /** целевые локальные радиусы и глобальный масштаб */
  recomputeTargets() {
    for (const [, p] of this.particles) {
      p.targetOrbitRadius = 0
      p.bandHalf = 0
    }

    /** @param {string} parentPath */
    const packLocal = (parentPath) => {
      const kids = this.childrenOf.get(parentPath) || []
      if (kids.length === 0) return CONFIG.leafBandWidth ?? 12

      const childWidths = kids.map((k) => packLocal(k))

      if (CONFIG.layout === "tree") {
        // все дети на одной орбите: ширина = max ширин поддеревьев детей
        const groupWidth = Math.max(CONFIG.leafBandWidth ?? 12, ...childWidths)
        let offset = CONFIG.firstBandOffset ?? 0
        for (const k of kids) {
          const ch = this.particles.get(k)
          if (!ch) continue
          ch.targetOrbitRadius = offset + groupWidth / 2
          ch.bandHalf = groupWidth / 2
        }
        return offset + groupWidth
      } else {
        // line и quantum: у каждого своя полоса/радиус
        let offset = CONFIG.firstBandOffset ?? 0
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i]
          if (!k) continue
          const bandWidth = childWidths[i] || 0
          const ch = this.particles.get(k)
          if (!ch) continue
          ch.targetOrbitRadius = offset + bandWidth / 2
          ch.bandHalf = bandWidth / 2
          offset += bandWidth + (CONFIG.interBandGap ?? 0)
        }
        return offset
      }
    }
    packLocal("0")

    // масштаб
    let maxExtent = 0
    const dfs = (/** @type {string} */ parentPath, /** @type {number} */ accum) => {
      const kids = this.childrenOf.get(parentPath) || []
      for (const k of kids) {
        const ch = this.particles.get(k)
        if (!ch) continue
        const local = ch.targetOrbitRadius + ch.bandHalf
        const next = accum + local
        if (next > maxExtent) maxExtent = next
        dfs(k, next)
      }
    }
    dfs("0", 0)

    const allowed = Math.min(this.screenWidth, this.screenHeight) * 0.5 * (CONFIG.viewMargin ?? 0.9)
    const scale = allowed / Math.max(1, maxExtent)
    this.globalScale = Math.max(CONFIG.minScale ?? 0.2, Math.min(CONFIG.maxScale ?? 1, scale))
  }

  // ── центрирование дерева ────────────────────────────────────────────────────

  /** центрирует дерево относительно экрана */
  centerTree() {
    if (this.particles.size <= 1) return // только корень или пусто

    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity

    // находим границы дерева
    for (const [, p] of this.particles) {
      if (p.tx < minX) minX = p.tx
      if (p.tx > maxX) maxX = p.tx
      if (p.ty < minY) minY = p.ty
      if (p.ty > maxY) maxY = p.ty
    }

    // вычисляем смещение для центрирования
    const treeWidth = maxX - minX
    const treeHeight = maxY - minY
    const offsetX = this.center.x - (minX + treeWidth / 2)
    const offsetY = this.center.y - (minY + treeHeight / 2)

    // применяем смещение ко всем частицам
    for (const [, p] of this.particles) {
      p.tx += offsetX
      p.ty += offsetY
    }
  }

  // ── жизненный цикл добавления/удаления ──────────────────────────────────────

  /** @param {string} path @param {any} meta @param {any} atom */
  addParticle(path, meta = null, atom = null) {
    if (!this.canvas) return
    const parentPath = this.getParent(path)
    const depth = path === "0" ? 0 : path.split("/").length - 1

    const existed = this.particles.get(path)
    if (!existed) {
      const angle = SPAWN_ANGLE // фиксировано над родителем для line/tree

      /** @type {Particle} */
      const p = {
        x: this.center.x,
        y: this.center.y,
        tx: this.center.x,
        ty: this.center.y,
        orbitRadius: 0,
        targetOrbitRadius: 0,
        bandHalf: 0,
        angle,
        speed: this.speedForDepth(depth),
        depth,
        isCore: path === "0",
        parentPath,
        shakeOffsetX: 0,
        shakeOffsetY: 0,
        shakePhase: Math.random() * Math.PI * 2,
        pulseSeed: Math.random() * Math.PI * 2,
        labelMain: "",
        labelSub: "",
      }
      if (meta != null) p.labelMain = String(meta?.name ?? meta?.title ?? meta?.label ?? meta)
      if (atom != null) p.labelSub = shortUUID(atom)

      this.particles.set(path, p)
      this.justAdded.add(path)
      this.pendingFlares.add(path)
    } else {
      existed.depth = depth
      existed.parentPath = parentPath
      existed.speed = this.speedForDepth(depth)
      if (meta || atom) this.updateParticleLabels(path, meta, atom)
    }

    this.rebuildTree()
    this.recomputeTargets()
    this.snapNewlyAdded()
    if (!this.isRunning) this.startAnimation()
  }

  /** @param {string} path */
  removeParticle(path) {
    this.particles.delete(path)
    this.justAdded.delete(path)
    this.pendingFlares.delete(path)
    this.rebuildTree()
    this.recomputeTargets()
    if (this.particles.size === 0 && this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      if (this.isRunning) this.stopAnimation()
    }

    // Запрашиваем обновленные пути из main потока
    this.requestPathsFromMain()
  }

  /**
   * Запрос путей частиц из main потока
   */
  requestPathsFromMain() {
    self.postMessage({
      type: "request-paths",
      timestamp: Date.now(),
    })
  }

  // мгновенная постановка только что добавленных точек на орбиты
  snapNewlyAdded() {
    if (this.justAdded.size === 0) return

    const placeUsingTargets = (/** @type {string} */ parentPath) => {
      const parent = this.particles.get(parentPath)
      if (!parent) return
      const px = parentPath === "0" ? this.center.x : parent.tx
      const py = parentPath === "0" ? this.center.y : parent.ty
      const kids = this.childrenOf.get(parentPath) || []

      if (CONFIG.layout === "tree" && kids.length > 0) {
        const firstKid = kids[0]
        if (!firstKid) return
        const any = this.particles.get(firstKid)
        const Rpx = any ? any.targetOrbitRadius * this.globalScale : 0
        const angles = this.buildTreeAngles(kids.length, Rpx)
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i]
          if (!k) continue
          const ch = this.particles.get(k)
          if (!ch) continue
          const R = ch.targetOrbitRadius * this.globalScale
          const angle = angles[i] || SPAWN_ANGLE
          ch.tx = px + Math.cos(angle) * R
          ch.ty = py + Math.sin(angle) * R
          if (k) placeUsingTargets(k)
        }
      } else if (CONFIG.layout === "line") {
        for (const k of kids) {
          const ch = this.particles.get(k)
          if (!ch) continue
          const R = ch.targetOrbitRadius * this.globalScale
          ch.tx = px + Math.cos(SPAWN_ANGLE) * R
          ch.ty = py + Math.sin(SPAWN_ANGLE) * R
          if (k) placeUsingTargets(k)
        }
      } else {
        // quantum — по собственному углу
        for (const k of kids) {
          const ch = this.particles.get(k)
          if (!ch) continue
          const R = ch.targetOrbitRadius * this.globalScale
          ch.tx = px + Math.cos(ch.angle) * R
          ch.ty = py + Math.sin(ch.angle) * R
          if (k) placeUsingTargets(k)
        }
      }
    }

    const root = this.particles.get("0")
    if (root) {
      root.tx = this.center.x
      root.ty = this.center.y
    }
    placeUsingTargets("0")

    for (const path of this.justAdded) {
      const p = this.particles.get(path)
      if (!p) continue
      p.orbitRadius = p.targetOrbitRadius
      p.x = p.tx
      p.y = p.ty
    }

    const now = performance.now()
    for (const path of this.pendingFlares) {
      const p = this.particles.get(path)
      if (!p) continue
      this.flares.push({ x: p.x, y: p.y, t0: now })
    }
    this.pendingFlares.clear()
    this.justAdded.clear()
  }

  // ── кадр отрисовки ──────────────────────────────────────────────────────────

  paint() {
    if (!this.ctx || !this.canvas) return
    const now = performance.now()
    const t = now * 0.001

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!this.particles.has("0")) return

    // угловая анимация — крутятся все, но эффект виден только в quantum/tree (в tree — если расширять на 2π)
    for (const [, p] of this.particles) if (!p.isCore) p.angle += p.speed

    const placeAroundTarget = (/** @type {string} */ parentPath) => {
      const parent = this.particles.get(parentPath)
      if (!parent) return
      const px = parent.tx,
        py = parent.ty
      const kids = this.childrenOf.get(parentPath) || []

      if (kids.length > 0 && CONFIG.layout === "tree") {
        for (const k of kids) {
          const ch = this.particles.get(k)
          if (!ch) continue
          ch.orbitRadius += (ch.targetOrbitRadius - ch.orbitRadius) * (CONFIG.lerpRadius || 0.18)
        }
        const firstKid = kids[0]
        const any = firstKid ? this.particles.get(firstKid) : null
        const Rpx = any ? any.orbitRadius * this.globalScale : 0
        const angles = this.buildTreeAngles(kids.length, Rpx)

        for (let i = 0; i < kids.length; i++) {
          const k = kids[i]
          if (!k) continue
          const ch = this.particles.get(k)
          if (!ch) continue
          const R = ch.orbitRadius * this.globalScale
          const angle = angles[i] || SPAWN_ANGLE
          ch.tx = px + Math.cos(angle) * R
          ch.ty = py + Math.sin(angle) * R
          placeAroundTarget(k)
        }
      } else if (CONFIG.layout === "line") {
        for (const k of kids) {
          const ch = this.particles.get(k)
          if (!ch) continue
          ch.orbitRadius += (ch.targetOrbitRadius - ch.orbitRadius) * (CONFIG.lerpRadius || 0.18)
          const R = ch.orbitRadius * this.globalScale
          ch.tx = px + Math.cos(SPAWN_ANGLE) * R
          ch.ty = py + Math.sin(SPAWN_ANGLE) * R
          placeAroundTarget(k)
        }
      } else {
        // quantum
        for (const k of kids) {
          const ch = this.particles.get(k)
          if (!ch) continue
          ch.orbitRadius += (ch.targetOrbitRadius - ch.orbitRadius) * (CONFIG.lerpRadius || 0.18)
          const R = ch.orbitRadius * this.globalScale
          ch.tx = px + Math.cos(ch.angle) * R
          ch.ty = py + Math.sin(ch.angle) * R
          placeAroundTarget(k)
        }
      }
    }

    const root = this.particles.get("0")
    if (root) {
      root.tx = this.center.x
      root.ty = this.center.y
    }
    placeAroundTarget("0")

    // центрирование дерева в режиме tree
    if (CONFIG.layout === "tree") {
      this.centerTree()
    }

    // интерполяция к целям
    for (const [, p] of this.particles) {
      p.x += (p.tx - p.x) * (CONFIG.lerpPos ?? 0.12)
      p.y += (p.ty - p.y) * (CONFIG.lerpPos ?? 0.12)
    }

    // дрожание
    for (const [, p] of this.particles) {
      const shakeTime = t * (CONFIG.shakeSpeed ?? 44.0) + p.shakePhase
      const shakeVariation = 1 + (p.shakePhase % 1) * (CONFIG.shakeVariation ?? 0.8)
      p.shakeOffsetX = Math.sin(shakeTime * shakeVariation) * (CONFIG.shakeIntensity ?? 1.4)
      p.shakeOffsetY = Math.cos(shakeTime * shakeVariation * 1.3) * (CONFIG.shakeIntensity ?? 1.4)
    }

    if (CONFIG.drawOrbits) this.drawAllOrbits()
    this.drawLinks()
    this.drawFlares(now)
    this.drawParticles(t)
    this.drawLabels()
  }

  // ── рисование вспомогательных слоёв ─────────────────────────────────────────

  drawAllOrbits() {
    if (!this.ctx) return
    const ctx = this.ctx
    ctx.lineWidth = 1

    for (const [parent, kids] of this.childrenOf) {
      if (kids.length === 0) continue
      const par = this.particles.get(parent)
      if (!par) continue
      const px = par.x,
        py = par.y

      ctx.setLineDash(CONFIG.orbitDash || [0, 0])
      ctx.strokeStyle = `hsla(200,50%,60%,${CONFIG.orbitAlpha || 0.22})`

      for (const k of kids) {
        const ch = this.particles.get(k)
        if (!ch) continue
        const R = Math.hypot(ch.x - px, ch.y - py)
        ctx.beginPath()
        ctx.arc(px, py, Math.max(1, R), 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }
  }

  drawLinks() {
    if (!this.ctx) return
    if (CONFIG.linkMode === "none") return
    const ctx = this.ctx

    for (const [parent, kids] of this.childrenOf) {
      if (kids.length === 0) continue

      if (CONFIG.linkMode === "parent") {
        const par = this.particles.get(parent)
        if (!par) continue
        for (const kid of kids) {
          const ch = this.particles.get(kid)
          if (!ch) continue
          const dx = par.x - ch.x,
            dy = par.y - ch.y
          const dist = Math.hypot(dx, dy)
          const maxDist = CONFIG.linkMaxDist || 180
          if (dist > maxDist) continue
          const alpha = (CONFIG.linkBaseAlpha || 1) * (1 - dist / maxDist)
          ctx.strokeStyle = `hsla(210,80%,70%,${alpha})`
          ctx.lineWidth = 1
          ctx.setLineDash(CONFIG.linkDash || [5, 5])
          ctx.beginPath()
          ctx.moveTo(par.x, par.y)
          ctx.lineTo(ch.x, ch.y)
          ctx.stroke()
          ctx.setLineDash([])
        }
        continue
      }

      if (kids.length < 2) continue
      /** @type {[Particle,Particle][]} */ const pairs = []
      if (CONFIG.linkMode === "adjacent") {
        for (let i = 0; i < kids.length; i++) {
          const a = this.particles.get(kids[i] || ""),
            b = this.particles.get(kids[(i + 1) % kids.length] || "")
          if (a && b) pairs.push([a, b])
        }
      } else if (CONFIG.linkMode === "all-siblings") {
        for (let i = 0; i < kids.length; i++)
          for (let j = i + 1; j < kids.length; j++) {
            const a = this.particles.get(kids[i] || ""),
              b = this.particles.get(kids[j] || "")
            if (a && b) pairs.push([a, b])
          }
      }

      for (const [a, b] of pairs) {
        const dx = a.x - b.x,
          dy = a.y - b.y
        const dist = Math.hypot(dx, dy)
        const maxDist = CONFIG.linkMaxDist || 180
        if (dist > maxDist) continue
        const alpha = (CONFIG.linkBaseAlpha || 1) * (1 - dist / maxDist)
        ctx.strokeStyle = `hsla(210,80%,70%,${alpha})`
        ctx.lineWidth = 1
        ctx.setLineDash(CONFIG.linkDash || [5, 5])
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }

  /** @param {number} nowMs */
  drawFlares(nowMs) {
    if (!this.ctx) return
    const ctx = this.ctx
    const dur = CONFIG.flareDuration || 420
    if (this.flares.length === 0) return

    const alive = []
    for (const fl of this.flares) {
      const dt = nowMs - fl.t0
      if (dt < 0 || dt > dur) continue
      alive.push(fl)

      const k = dt / dur
      const r0 = CONFIG.flareR0 || 10
      const r1 = CONFIG.flareR1 || 90
      const r = r0 + (r1 - r0) * k
      const a = (CONFIG.flareMaxAlpha || 0.6) * (1 - k)

      const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r)
      g.addColorStop(0, `hsla(200,100%,80%,${a * 0.35})`)
      g.addColorStop(1, `hsla(200,100%,50%,0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(fl.x, fl.y, r, 0, Math.PI * 2)
      ctx.fill()

      ctx.lineWidth = 1.5
      ctx.strokeStyle = `hsla(200,100%,70%,${a})`
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(fl.x, fl.y, r * 0.85, 0, Math.PI * 2)
      ctx.stroke()
    }
    this.flares = alive
  }

  /** @param {number} time */
  drawParticles(time) {
    if (!this.ctx) return
    const ctx = this.ctx
    for (const [path, p] of this.particles) {
      const shakeX = p.x + p.shakeOffsetX
      const shakeY = p.y + p.shakeOffsetY

      const hue = 200 + ((path.charCodeAt(0) * 20) % 40)
      const base = p.isCore
        ? CONFIG.coreSize || 4
        : (CONFIG.nodeSizeBase || 2) + p.depth * (CONFIG.nodeSizePerDepth || 0)
      const timeOffset = p.pulseSeed * (CONFIG.pulseTimeVariation ?? 0.5)
      const pulse =
        Math.sin((time + timeOffset) * (CONFIG.pulseSpeed ?? 22.0) + p.pulseSeed) * (CONFIG.pulseAmplitude ?? 0.3) +
        (CONFIG.pulseBase ?? 0.7)
      const sz = Math.max(1, base * pulse)

      const g1 = ctx.createRadialGradient(shakeX, shakeY, 0, shakeX, shakeY, sz * 3)
      g1.addColorStop(0, `hsla(${hue},100%,80%,0.9)`)
      g1.addColorStop(0.35, `hsla(${hue},80%,60%,0.55)`)
      g1.addColorStop(0.8, `hsla(${hue},50%,40%,0.18)`)
      g1.addColorStop(1, `hsla(${hue},40%,20%,0)`)
      ctx.fillStyle = g1
      ctx.beginPath()
      ctx.arc(shakeX, shakeY, sz * 3, 0, Math.PI * 2)
      ctx.fill()

      const g2 = ctx.createRadialGradient(shakeX, shakeY, 0, shakeX, shakeY, sz)
      g2.addColorStop(0, `hsl(${hue},100%,95%)`)
      g2.addColorStop(0.55, `hsl(${hue},90%,70%)`)
      g2.addColorStop(1, `hsl(${hue},80%,50%)`)
      ctx.fillStyle = g2
      ctx.beginPath()
      ctx.arc(shakeX, shakeY, sz, 0, Math.PI * 2)
      ctx.fill()

      for (let i = 1; i <= 3; i++) {
        const to = p.pulseSeed * (CONFIG.pulseTimeVariation ?? 0.5)
        const rt = (time + to) * (CONFIG.pulseSpeed ?? 22.0) * (1 + i * 0.5) + p.pulseSeed
        const rr = Math.max(1, sz * (1.5 + i * 0.8) + Math.sin(rt) * 5)
        const ra = ((0.3 - i * 0.08) * (Math.sin(rt) + 1)) / 2
        ctx.strokeStyle = `hsla(${hue},70%,60%,${Math.max(0, ra)})`
        ctx.lineWidth = CONFIG.particleRingThickness || 2
        ctx.beginPath()
        ctx.arc(shakeX, shakeY, rr, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  // ── управление анимацией/жизненным циклом ───────────────────────────────────

  startAnimation() {
    dlog("🎬 start")
    this.isRunning = true
    // сбрасываем таймер только если включено отслеживание
    if (this.isTrackingActivity) {
      this.resetAnimationTimer()
    }
    const tick = () => {
      if (!this.isRunning) return
      this.paint()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  stopAnimation() {
    dlog("⏹ stop")
    this.isRunning = false
    this.clearAnimationTimer()
  }

  /**
   * Сбрасывает таймер анимации при получении патча
   */
  resetAnimationTimer() {
    // работаем только если включено отслеживание и delay > 0
    if (!this.isTrackingActivity) return

    this.lastPatchTime = performance.now()
    this.clearAnimationTimer()

    const delay = CONFIG.animateDelay || 0
    if (delay > 0) {
      this.animationTimeoutId = setTimeout(() => {
        if (this.isRunning) {
          dlog("⏰ animation timeout - stopping animation")
          this.stopAnimation()
        }
      }, delay)
    }
  }

  /**
   * Очищает таймер анимации
   */
  clearAnimationTimer() {
    if (this.animationTimeoutId !== null) {
      clearTimeout(this.animationTimeoutId)
      this.animationTimeoutId = null
    }
  }

  destroy() {
    dlog("💥 destroy")
    this.stopAnimation()
    this.clearAnimationTimer()
    this.particles.clear()
    this.childrenOf.clear()
    this.justAdded.clear()
    this.pendingFlares.clear()
    this.flares.length = 0
    if (this.broadcastChannel) {
      this.broadcastChannel.close()
      this.broadcastChannel = null
    }
    this.canvas = /** @type {any} */ (null)
    this.ctx = /** @type {any} */ (null)
  }

  drawLabels() {
    if (!this.ctx || !CONFIG.label?.show) return
    const ctx = this.ctx
    const L = CONFIG.label

    ctx.save()
    ctx.font = L.font || "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    if (L.shadow) {
      ctx.shadowColor = L.shadow
      ctx.shadowBlur = L.shadowBlur ?? 0
    }

    const ellipsize = (/** @type {string} */ text, /** @type {number} */ maxWidth) => {
      if (!text) return ""
      const w = ctx.measureText(text).width
      if (w <= maxWidth) return text
      const ell = "…"
      let lo = 0,
        hi = text.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        const s = text.slice(0, mid) + ell
        if (ctx.measureText(s).width <= maxWidth) lo = mid + 1
        else hi = mid
      }
      return text.slice(0, Math.max(0, lo - 1)) + ell
    }

    for (const [, p] of this.particles) {
      const x = p.x + (p.shakeOffsetX || 0)
      const y0 = p.y + (p.shakeOffsetY || 0) + ((CONFIG.coreSize || 4) + (L.offsetY || 10))
      const main = ellipsize(p.labelMain || "", L.maxWidth || 160)
      const sub = ellipsize(p.labelSub || "", L.maxWidth || 160)
      if (main) {
        ctx.fillStyle = L.color || "rgba(200,230,255,0.95)"
        ctx.fillText(main, x, y0)
      }
      if (sub) {
        ctx.fillStyle = L.subColor || "rgba(180,210,235,0.75)"
        ctx.fillText(sub, x, y0 + (L.lineHeight || 14))
      }
    }

    ctx.restore()
  }
}

/** @type {ParticlesWorker|null} */
let particlesWorker = null

// ───────────────────────────────────────────────────────────────────────────────
// Сообщения из main-потока
// ───────────────────────────────────────────────────────────────────────────────
self.onmessage = function (e) {
  const { type, canvas, width, height, visible, config } = e.data

  if (type === "init") {
    if (config && typeof config === "object") {
      CONFIG = {
        ...DEFAULT_CONFIG,
        ...config,
        tree: { ...(DEFAULT_CONFIG.tree || {}), ...(config.tree || {}) },
        label: { ...(DEFAULT_CONFIG.label || {}), ...(config.label || {}) },
      }
    }
    particlesWorker = new ParticlesWorker(canvas, width, height)
    // Автоматически включаем отслеживание при загрузке, если animateDelay > 0
    if (particlesWorker) {
      particlesWorker.isTrackingActivity = (CONFIG.animateDelay || 0) > 0
      if (particlesWorker.isTrackingActivity) {
        particlesWorker.resetAnimationTimer()
      }
    }
    self.postMessage({ type: "worker-ready" })
  } else if (type === "set-config") {
    if (config && typeof config === "object") {
      const prevDelay = CONFIG.animateDelay || 0
      CONFIG = {
        ...CONFIG,
        ...config,
        tree: { ...(CONFIG.tree || DEFAULT_CONFIG.tree), ...(config.tree || {}) },
        label: { ...(CONFIG.label || DEFAULT_CONFIG.label), ...(config.label || {}) },
      }
      const newDelay = CONFIG.animateDelay || 0
      if (particlesWorker) {
        // Переключаем режим отслеживания при изменении animateDelay
        if (!particlesWorker.isTrackingActivity && newDelay > 0) {
          particlesWorker.isTrackingActivity = true
          particlesWorker.resetAnimationTimer()
        } else if (particlesWorker.isTrackingActivity && newDelay === 0) {
          particlesWorker.isTrackingActivity = false
          particlesWorker.clearAnimationTimer()
          // Убедимся, что анимация продолжает работать без отслеживания
          if (!particlesWorker.isRunning) particlesWorker.startAnimation()
        } else if (particlesWorker.isTrackingActivity && prevDelay !== newDelay && newDelay > 0) {
          // Обновили значение задержки — перезапустим таймер
          particlesWorker.resetAnimationTimer()
        }
        particlesWorker.recomputeTargets()
      }
    }
  } else if (type === "destroy") {
    if (particlesWorker) {
      particlesWorker.destroy()
      particlesWorker = null
    }
  } else if (type === "visibility-change") {
    if (!particlesWorker) return
    if (!visible) particlesWorker.stopAnimation()
    else particlesWorker.startAnimation()
  } else if (type === "resize") {
    if (!particlesWorker || !particlesWorker.canvas || !particlesWorker.ctx) return
    const w = width,
      h = height
    particlesWorker.ctx.clearRect(0, 0, particlesWorker.canvas.width, particlesWorker.canvas.height)
    particlesWorker.canvas.width = w
    particlesWorker.canvas.height = h
    particlesWorker.screenWidth = w
    particlesWorker.screenHeight = h
    particlesWorker.center.x = w / 2
    particlesWorker.center.y = h / 2
    particlesWorker.recomputeTargets()
    particlesWorker.paint()
  } else if (type === "add") {
    if (particlesWorker) {
      particlesWorker.resetAnimationTimer()
      particlesWorker.addParticle(e.data.path, e.data.meta, e.data.atom)
    }
  } else if (type === "remove") {
    if (particlesWorker) {
      particlesWorker.resetAnimationTimer()
      particlesWorker.removeParticle(e.data.path)
    }
  } else if (type === "update-paths") {
    if (particlesWorker) {
      particlesWorker.resetAnimationTimer()
      particlesWorker.particles = new Map()
      e.data.paths.forEach((/** @type {import("@metafor/atom").Self} */ element) => {
        particlesWorker?.addParticle(element.path, element.meta, element.atom)
      })
    }
  } else if (type === "start-tracking") {
    if (particlesWorker) {
      particlesWorker.isTrackingActivity = true
      dlog("🔍 started activity tracking")
      // сбрасываем таймер при включении отслеживания
      particlesWorker.resetAnimationTimer()
    }
  }
}
