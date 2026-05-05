/**
 * FontAtlas — атлас глифов в формате Signed Distance Field (SDF).
 *
 * Зачем SDF: bilinear-rasterized атлас (предыдущая итерация) на маленьких
 * масштабах даёт блюр, а на больших — пикселизацию. SDF хранит для каждого
 * пикселя расстояние до ближайшего края глифа; в шейдере применяется
 * smoothstep вокруг distance=0.5 → идеально гладкие края на любом масштабе,
 * без блюра. Один атлас работает на любых fontSize.
 *
 * Реализация SDF — `tiny-sdf` (Mapbox): browser-side EDT (Euclidean Distance
 * Transform) Felzenszwalb-Huttenlocher, без WASM. Каждый глиф рисуется
 * ctx.fillText в свой временный canvas, EDT даёт RGBA с distance в R/G/B
 * (alpha=255). Атлас собирается в один большой canvas копированием
 * per-glyph ImageData в координаты cell.
 *
 * Шрифт целевой — JetBrainsMono-Bold (моноширный): для всех глифов
 * advanceWidth одинаков, cell-сетка фиксированная.
 */
// tiny-sdf — Mapbox EDT SDF generator. Типы задаются в text/tiny-sdf.d.ts.
/// <reference path="./tiny-sdf.d.ts" />
import TinySDF from "tiny-sdf"

export type GlyphCell = {
  /** Левая граница cell в атласе, в пикселях. */
  px: number
  /** Верхняя граница cell в атласе, в пикселях. */
  py: number
  /** Ширина cell — для всех глифов одинаковая (TinySDF size). */
  pw: number
  /** Высота cell — для всех одинаковая. */
  ph: number
  /** Сдвиг "пера" (pen-x) от левого края cell. У TinySDF буква начинается на
   *  buffer-px от левого края cell (см. tiny-sdf: ctx.fillText(char, buffer, middle)).
   *  AtlasText использует bearingX чтобы pen-x в логической координате
   *  попадал на видимое начало буквы. */
  bearingX: number
  /** Сдвиг "верха" cell от baseline. TinySDF ставит букву на y = middle
   *  (центр cell), значит baseline ≈ middle, верх cell на расстоянии
   *  middle от baseline. */
  bearingY: number
}

export type FontAtlasOptions = {
  /** CSS font-family, по которому рисует Canvas2D. Шрифт уже должен быть
   *  загружен (через FontFace API или @font-face) — caller сам управляет. */
  fontFamily: string
  /** Логический размер шрифта в пикселях, на котором текст «читается» в UI.
   *  AtlasText на runtime скейлит quad'ы под желаемый fontSize.  */
  fontPixelSize: number
  /** Размер глифа внутри SDF-cell. Чем больше — тем плавнее smoothstep на
   *  больших масштабах, но больше памяти. По умолчанию 32 (рабочий компромисс). */
  glyphPixelSize?: number
  /** Buffer вокруг глифа в SDF-cell, чтобы distance field имел градиент
   *  «снаружи» буквы. Default 4. */
  buffer?: number
  /** Радиус distance transform: расстояния, превышающие radius, обрезаются
   *  в SDF (сохраняются с минимумом). Default 8. */
  radius?: number
  /** Cutoff: в каком значении SDF считается «контуром» глифа (0..1). 0.25
   *  — стандарт для tiny-sdf. */
  cutoff?: number
  /** Список Unicode кодпоинтов в атласе. По умолчанию ASCII + кириллица + спец. */
  charset?: number[]
}

const DEFAULT_CHARSET: number[] = (() => {
  const out: number[] = []
  for (let cp = 0x20; cp <= 0x7e; cp++) out.push(cp)
  for (let cp = 0x0400; cp <= 0x04ff; cp++) out.push(cp)
  out.push(0x25b6, 0x2026, 0x2192, 0x2713)
  return out
})()

export class FontAtlas {
  /** ImageBitmap содержит весь атлас, готов к copyExternalImageToTexture. */
  public readonly bitmap: ImageBitmap
  /** Map: codepoint → cell в атласе. */
  public readonly glyphs: Map<number, GlyphCell>
  /** Размер ячейки в пикселях атласа. */
  public readonly cellPixelW: number
  public readonly cellPixelH: number
  /** Атлас целиком в пикселях. */
  public readonly atlasPixelW: number
  public readonly atlasPixelH: number
  /** Логический размер шрифта (без supersample). */
  public readonly fontPixelSize: number
  /** Логическая ширина advance моноширного шрифта при fontSize = fontPixelSize. */
  public readonly logicalAdvance: number
  /** Логическая высота строки. */
  public readonly logicalLineHeight: number
  /** Y-смещение базовой линии шрифта от верха ячейки (в логических px). */
  public readonly logicalBaseline: number
  /** SDF-параметры для шейдера. radius — реальная distance до края.
   *  cutoff — значение SDF на контуре. buffer — отступ внутри cell. */
  public readonly sdfRadius: number
  public readonly sdfCutoff: number
  public readonly sdfBuffer: number

  private constructor(init: {
    bitmap: ImageBitmap
    glyphs: Map<number, GlyphCell>
    cellPixelW: number
    cellPixelH: number
    atlasPixelW: number
    atlasPixelH: number
    fontPixelSize: number
    logicalAdvance: number
    logicalLineHeight: number
    logicalBaseline: number
    sdfRadius: number
    sdfCutoff: number
    sdfBuffer: number
  }) {
    this.bitmap = init.bitmap
    this.glyphs = init.glyphs
    this.cellPixelW = init.cellPixelW
    this.cellPixelH = init.cellPixelH
    this.atlasPixelW = init.atlasPixelW
    this.atlasPixelH = init.atlasPixelH
    this.fontPixelSize = init.fontPixelSize
    this.logicalAdvance = init.logicalAdvance
    this.logicalLineHeight = init.logicalLineHeight
    this.logicalBaseline = init.logicalBaseline
    this.sdfRadius = init.sdfRadius
    this.sdfCutoff = init.sdfCutoff
    this.sdfBuffer = init.sdfBuffer
  }

  cellOf(codepoint: number): GlyphCell | undefined {
    return this.glyphs.get(codepoint)
  }

  /**
   * Создаёт SDF-атлас. Должен вызываться в browser-окружении (Canvas2D + tiny-sdf).
   * Шрифт уже должен быть загружен и доступен по fontFamily.
   */
  static async create(options: FontAtlasOptions): Promise<FontAtlas> {
    if (typeof document === "undefined") {
      throw new Error("FontAtlas: tiny-sdf requires browser document for canvas")
    }
    const fontPx = options.fontPixelSize
    const glyphPx = options.glyphPixelSize ?? 32
    const buffer = options.buffer ?? 4
    const radius = options.radius ?? 8
    const cutoff = options.cutoff ?? 0.25
    const charset = options.charset ?? DEFAULT_CHARSET

    // tiny-sdf создаёт собственный canvas glyphPx + 2*buffer.
    const sdfCellSize = glyphPx + buffer * 2
    const tinySdf = new TinySDF(glyphPx, buffer, radius, cutoff, options.fontFamily)

    // Замеряем реальный advance моноширного шрифта (без buffer'а):
    // ctx.measureText("M").width при том же fontSize, что использует tiny-sdf.
    const probeCanvas = document.createElement("canvas")
    probeCanvas.width = sdfCellSize
    probeCanvas.height = sdfCellSize
    const probeCtx = probeCanvas.getContext("2d")
    if (probeCtx === null) throw new Error("FontAtlas: 2D context unavailable")
    probeCtx.font = `${glyphPx}px ${options.fontFamily}`
    const measuredAdvance = probeCtx.measureText("M").width

    const cols = 16
    const rows = Math.ceil(charset.length / cols)
    const atlasW = nextPowerOfTwo(sdfCellSize * cols)
    const atlasH = nextPowerOfTwo(sdfCellSize * rows)

    const canvas = document.createElement("canvas")
    canvas.width = atlasW
    canvas.height = atlasH
    const ctx = canvas.getContext("2d")
    if (ctx === null) throw new Error("FontAtlas: 2D context unavailable for atlas")
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, atlasW, atlasH)

    const glyphs = new Map<number, GlyphCell>()
    for (let i = 0; i < charset.length; i++) {
      const cp = charset[i]!
      const col = i % cols
      const row = Math.floor(i / cols)
      const cellX = col * sdfCellSize
      const cellY = row * sdfCellSize
      const ch = String.fromCodePoint(cp)
      const sdfImage = tinySdf.draw(ch)
      ctx.putImageData(sdfImage, cellX, cellY)
      glyphs.set(cp, {
        px: cellX,
        py: cellY,
        pw: sdfCellSize,
        ph: sdfCellSize,
        // tiny-sdf рисует букву на (buffer, middle) — pen-x от левого края cell
        // равен buffer; AtlasText сдвигает quad на -buffer чтобы pen-x совпадал
        // с видимым началом буквы. Quad размером cell (включая buffer-зону)
        // — за пределами буквы SDF→0, текст "сам схватывается" smoothstep'ом.
        bearingX: -buffer,
        // tiny-sdf ставит baseline на y=middle. cell-верх находится "middle" px
        // выше baseline. AtlasText сдвигает quad вверх на этот offset.
        bearingY: Math.round(sdfCellSize / 2),
      })
    }

    const bitmap = await createImageBitmap(canvas)

    // Логическая шкала: в SDF-cell глиф размером glyphPx (logical эквивалент
    // = options.fontPixelSize). Pixel→logical ratio = fontPx / glyphPx.
    const pixelToLogical = fontPx / glyphPx

    return new FontAtlas({
      bitmap,
      glyphs,
      cellPixelW: sdfCellSize,
      cellPixelH: sdfCellSize,
      atlasPixelW: atlasW,
      atlasPixelH: atlasH,
      fontPixelSize: fontPx,
      logicalAdvance: measuredAdvance * pixelToLogical,
      logicalLineHeight: sdfCellSize * pixelToLogical,
      logicalBaseline: (sdfCellSize / 2) * pixelToLogical,
      sdfRadius: radius,
      sdfCutoff: cutoff,
      sdfBuffer: buffer,
    })
  }
}

function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1
  let p = 1
  while (p < value) p <<= 1
  return p
}
