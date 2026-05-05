import {BufferAttribute, BufferGeometry} from "../core/BufferGeometry"
import {Object3D} from "../core/Object3D"
import {AtlasTextMaterial} from "../materials/AtlasTextMaterial"

/**
 * AtlasText — текст-Object3D с одной BufferGeometry на N quad'ов (по 4 вершины
 * на символ). Pos+UV. Без stencil-cover пайплайна. Ширина advance берётся
 * из FontAtlas.logicalAdvance — для моноширного шрифта это константа.
 *
 * setText() переписывает атрибуты в существующих BufferAttribute; Renderer
 * увидит изменение через invalidateGeometry (пересоздаст GPUBuffer'ы для
 * этой одной геометрии). Это в разы дешевле, чем пересобирать сотни
 * BufferGeometry для отдельных Text-объектов.
 */
export class AtlasText extends Object3D {
  public readonly isAtlasText: true = true
  public type = "AtlasText"
  public material: AtlasTextMaterial
  public geometry: BufferGeometry = new BufferGeometry()
  /** Текущая длина в символах (после setText). */
  public charCount = 0
  /** Базовый logical font size — масштаб quad'ов от atlas.fontPixelSize. */
  public fontSize: number
  /** Доп. межсимвольный интервал в logical px. */
  public letterSpacing: number

  #text = ""

  constructor(text: string, material: AtlasTextMaterial, fontSize: number, letterSpacing = 0) {
    super()
    this.material = material
    this.fontSize = fontSize
    this.letterSpacing = letterSpacing
    this.setText(text)
  }

  get text(): string {
    return this.#text
  }

  setText(text: string): void {
    this.#text = text
    this.#rebuildGeometry()
  }

  /** Reuse: для смены fontSize без пересоздания AtlasText. */
  setFontSize(fontSize: number): void {
    if (this.fontSize === fontSize) return
    this.fontSize = fontSize
    this.#rebuildGeometry()
  }

  #rebuildGeometry(): void {
    const atlas = this.material.atlas
    const text = this.#text
    const scale = this.fontSize / atlas.fontPixelSize
    // pixelToLogical: соотношение между пикселями атласа и logical px при
    // данном fontSize. atlas.fontPixelSize = logical, atlas.cellPixelW в
    // pixel-атласе = logical * superscale → pixel/logical = superscale.
    // Формально извлекаем из стабильного отношения logicalAdvance к
    // (cellPixelW + 2*pad). Проще — считаем через scale + atlas-resolution.
    const pixelToLogical = atlas.fontPixelSize / atlas.cellPixelH * (atlas.logicalLineHeight / atlas.fontPixelSize)
    void pixelToLogical
    // Делаем проще: pixel→world ratio = scale / superscale.
    // superscale = cellPixelH / logicalLineHeight.
    const superscale = atlas.cellPixelH / atlas.logicalLineHeight
    const pxToWorld = scale / superscale
    const advanceLogical = atlas.logicalAdvance * scale + this.letterSpacing
    const atlasW = atlas.atlasPixelW
    const atlasH = atlas.atlasPixelH

    // Подсчитываем сколько символов реально дадут quad. Пробелы и
    // отсутствующие в атласе кодпоинты не рисуются — но advance прибавляется,
    // чтобы текст не "слипался".
    const codepoints: number[] = []
    for (const ch of text) codepoints.push(ch.codePointAt(0)!)
    let renderable = 0
    for (const cp of codepoints) {
      if (cp === 0x20) continue
      if (atlas.cellOf(cp) !== undefined) renderable++
    }
    this.charCount = codepoints.length

    if (renderable === 0) {
      this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(0), 3))
      this.geometry.setAttribute("uv", new BufferAttribute(new Float32Array(0), 2))
      this.geometry.setIndex(new BufferAttribute(new Uint32Array(0), 1))
      return
    }

    const positions = new Float32Array(renderable * 4 * 3)
    const uvs = new Float32Array(renderable * 4 * 2)
    const indices = new Uint32Array(renderable * 6)

    let pen = 0
    let q = 0
    for (const cp of codepoints) {
      if (cp === 0x20) {
        pen += advanceLogical
        continue
      }
      const cell = atlas.cellOf(cp)
      if (cell === undefined) {
        pen += advanceLogical
        continue
      }

      // Tight bbox: quad точно по реальному рисунку глифа (без прозрачных
      // полей cell). bearingX/bearingY смещают квад относительно pen-точки.
      // Y растёт вверх в world; ascent = bearingY → top quad = baseline +
      // bearingY*pxToWorld.
      const glyphW = cell.pw * pxToWorld
      const glyphH = cell.ph * pxToWorld
      const offX = cell.bearingX * pxToWorld
      const offY = cell.bearingY * pxToWorld
      const x0 = pen + offX
      const x1 = x0 + glyphW
      const y1 = offY
      const y0 = y1 - glyphH

      const u0 = cell.px / atlasW
      const u1 = (cell.px + cell.pw) / atlasW
      const v0 = cell.py / atlasH
      const v1 = (cell.py + cell.ph) / atlasH

      const pBase = q * 4 * 3
      const uBase = q * 4 * 2
      const iBase = q * 6
      const vBase = q * 4

      // 0: TL, 1: TR, 2: BL, 3: BR
      positions[pBase + 0] = x0
      positions[pBase + 1] = y1
      positions[pBase + 2] = 0
      positions[pBase + 3] = x1
      positions[pBase + 4] = y1
      positions[pBase + 5] = 0
      positions[pBase + 6] = x0
      positions[pBase + 7] = y0
      positions[pBase + 8] = 0
      positions[pBase + 9] = x1
      positions[pBase + 10] = y0
      positions[pBase + 11] = 0

      uvs[uBase + 0] = u0
      uvs[uBase + 1] = v0
      uvs[uBase + 2] = u1
      uvs[uBase + 3] = v0
      uvs[uBase + 4] = u0
      uvs[uBase + 5] = v1
      uvs[uBase + 6] = u1
      uvs[uBase + 7] = v1

      indices[iBase + 0] = vBase + 0
      indices[iBase + 1] = vBase + 2
      indices[iBase + 2] = vBase + 1
      indices[iBase + 3] = vBase + 1
      indices[iBase + 4] = vBase + 2
      indices[iBase + 5] = vBase + 3

      q++
      pen += advanceLogical
    }

    this.geometry.setAttribute("position", new BufferAttribute(positions, 3))
    this.geometry.setAttribute("uv", new BufferAttribute(uvs, 2))
    this.geometry.setIndex(new BufferAttribute(indices, 1))
  }
}
