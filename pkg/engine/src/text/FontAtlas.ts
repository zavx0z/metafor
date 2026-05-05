/**
 * FontAtlas — моноширный glyph-atlas в одной RGBA-текстуре.
 *
 * Зачем: per-glyph BufferGeometry (Text.ts через stencil+cover) даёт сотни
 * GPUBuffer'ов на один редактор и копит GPU-память на каждом step debug-UI.
 * Атлас — одна текстура, на каждый символ рендерится один quad с UV в эту
 * текстуру. Геометрия для всего текста собирается в один взмах, BufferGeometry
 * на весь AtlasText — одна.
 *
 * Сейчас целевой шрифт — JetBrainsMono-Bold (моноширный): для всех глифов
 * advanceWidth одинаков, и нам достаточно фиксированной cell-сетки.
 */
export type GlyphCell = {
  /** Левая граница ячейки в атласе, в пикселях (от верх-лево атласа). */
  px: number
  /** Верхняя граница ячейки в атласе, в пикселях. */
  py: number
  /** Ширина ячейки в пикселях (равна для всех глифов в моноширном шрифте). */
  pw: number
  /** Высота ячейки в пикселях. */
  ph: number
}

export type FontAtlasOptions = {
  /** CSS font-family, по которому будет рисовать Canvas2D. Для отрисовки нужно,
   *  чтобы шрифт был уже зарегистрирован (через FontFace API или @font-face). */
  fontFamily: string
  /** Базовый размер шрифта в пикселях. Атлас рисуется в N×fontPixelSize, а
   *  AtlasText на runtime скейлит quad'ы под нужный размер. Чем больше базовый
   *  размер — тем чётче маленький текст (за счёт supersampling). */
  fontPixelSize: number
  /** Множитель supersampling для cell. Cell physical size = fontPixelSize * superscale.
   *  2 даёт приемлемый AA при bilinear filter. */
  superscale?: number
  /** Список Unicode кодпоинтов, которые войдут в атлас. По умолчанию ASCII +
   *  базовая кириллица + несколько служебных символов из xr-overlay. */
  charset?: number[]
}

const DEFAULT_CHARSET: number[] = (() => {
  const out: number[] = []
  // ASCII printable: 0x20..0x7E
  for (let cp = 0x20; cp <= 0x7e; cp++) out.push(cp)
  // Базовая кириллица: 0x0400..0x04FF
  for (let cp = 0x0400; cp <= 0x04ff; cp++) out.push(cp)
  // Служебное: ▶ (execution arrow), … (ellipsis), → (arrow), ✓ (check)
  out.push(0x25b6, 0x2026, 0x2192, 0x2713)
  return out
})()

export class FontAtlas {
  /** ImageBitmap содержит весь атлас, готов к copyExternalImageToTexture. */
  public readonly bitmap: ImageBitmap
  /** Map: codepoint → cell в атласе. Кодпоинты, которых нет, рендерятся как пустой quad. */
  public readonly glyphs: Map<number, GlyphCell>
  /** Размер ячейки в пикселях атласа (моноширный → одинаков для всех). */
  public readonly cellPixelW: number
  public readonly cellPixelH: number
  /** Атлас целиком в пикселях. */
  public readonly atlasPixelW: number
  public readonly atlasPixelH: number
  /** Логический размер шрифта (без supersample). */
  public readonly fontPixelSize: number
  /** Логическая ширина advance (= cellPixelW / superscale). При size = fontPixelSize. */
  public readonly logicalAdvance: number
  /** Логическая высота строки (= cellPixelH / superscale). */
  public readonly logicalLineHeight: number
  /** Y-смещение базовой линии шрифта от верха ячейки (в логических px). */
  public readonly logicalBaseline: number
  /** CSS font-string, которым рисовался атлас. Для дебага. */
  public readonly fontCss: string

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
    fontCss: string
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
    this.fontCss = init.fontCss
  }

  /**
   * Возвращает glyph cell для кодпоинта или undefined, если не в атласе.
   * Caller должен либо пропустить, либо нарисовать fallback (например '?').
   */
  cellOf(codepoint: number): GlyphCell | undefined {
    return this.glyphs.get(codepoint)
  }

  /**
   * Создаёт атлас. Должен вызываться в browser-окружении (нужны OffscreenCanvas/
   * HTMLCanvasElement и Canvas2D 2D-context).
   *
   * Шрифт уже должен быть загружен и доступен по fontFamily — caller сам
   * управляет FontFace / @font-face. Это намеренно: разные UI могут
   * по-своему подгружать шрифт (через FontFace API, через CSS, через preload).
   */
  static async create(options: FontAtlasOptions): Promise<FontAtlas> {
    const fontPx = options.fontPixelSize
    const superscale = options.superscale ?? 2
    const charset = options.charset ?? DEFAULT_CHARSET
    // Cell-высота — fontPx с запасом на хвосты + по супер-сэмплу.
    const cellPixelH = Math.ceil(fontPx * 1.3 * superscale)
    // Размер шрифта в Canvas2D: ~75% от высоты ячейки.
    const drawFontPx = Math.round(cellPixelH * 0.75)

    // Замеряем реальный advance моноширного шрифта через ctx.measureText.
    // Без точного замера cell-width не совпадает с шириной глифа: либо
    // зазоры между буквами (cellW > advance), либо обрезание (cellW < advance).
    // Берём максимум из нескольких широких символов с +1px запасом.
    const probeCanvas = createCanvas(8, 8)
    const probeCtx = probeCanvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null
    if (probeCtx === null) throw new Error("FontAtlas: 2D context unavailable")
    probeCtx.font = `${drawFontPx}px ${options.fontFamily}`
    let measured = 0
    for (const sample of ["M", "W", "0", "→"]) {
      const w = probeCtx.measureText(sample).width
      if (w > measured) measured = w
    }
    const cellPixelW = Math.max(1, Math.ceil(measured) + 1)

    const cols = 16
    const rows = Math.ceil(charset.length / cols)
    // POT для совместимости со старыми GPU-драйверами и аккуратного UV.
    const atlasW = nextPowerOfTwo(cellPixelW * cols)
    const atlasH = nextPowerOfTwo(cellPixelH * rows)

    const canvas = createCanvas(atlasW, atlasH)
    const ctx = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null
    if (ctx === null) throw new Error("FontAtlas: 2D context unavailable")

    const fontCss = `${drawFontPx}px ${options.fontFamily}`
    ctx.font = fontCss
    ctx.fillStyle = "#ffffff"
    ctx.textBaseline = "alphabetic"
    ctx.textAlign = "left"
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, atlasW, atlasH)

    // Базовая линия в ячейке: примерно 80% сверху, чтобы спускающиеся хвосты
    // (g, y, p, q, ц, щ) умещались.
    const baselineWithinCell = Math.round(cellPixelH * 0.78)

    const glyphs = new Map<number, GlyphCell>()
    for (let i = 0; i < charset.length; i++) {
      const cp = charset[i]!
      const col = i % cols
      const row = Math.floor(i / cols)
      const px = col * cellPixelW
      const py = row * cellPixelH
      const ch = String.fromCodePoint(cp)
      // Рисуем у левого края ячейки. Для моноширного шрифта advance стабильный,
      // но визуальная ширина (bbox) глифа меньше cellPixelW — это нормально,
      // UV-quad берёт всю ячейку.
      ctx.fillText(ch, px, py + baselineWithinCell)
      glyphs.set(cp, {px, py, pw: cellPixelW, ph: cellPixelH})
    }

    const bitmap = await canvasToImageBitmap(canvas, atlasW, atlasH)

    return new FontAtlas({
      bitmap,
      glyphs,
      cellPixelW,
      cellPixelH,
      atlasPixelW: atlasW,
      atlasPixelH: atlasH,
      fontPixelSize: fontPx,
      logicalAdvance: cellPixelW / superscale,
      logicalLineHeight: cellPixelH / superscale,
      logicalBaseline: baselineWithinCell / superscale,
      fontCss,
    })
  }
}

function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1
  let p = 1
  while (p < value) p <<= 1
  return p
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h)
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    return c
  }
  throw new Error("FontAtlas: no canvas implementation (need browser env)")
}

async function canvasToImageBitmap(canvas: AnyCanvas, w: number, h: number): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "undefined") {
    throw new Error("FontAtlas: createImageBitmap unavailable")
  }
  // OffscreenCanvas → transferToImageBitmap дёшево; HTMLCanvas → createImageBitmap.
  const oc = canvas as OffscreenCanvas
  if (typeof oc.transferToImageBitmap === "function") return oc.transferToImageBitmap()
  return createImageBitmap(canvas as CanvasImageSource, 0, 0, w, h)
}
