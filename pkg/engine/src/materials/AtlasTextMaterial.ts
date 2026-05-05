import {Color} from "../math"
import {FontAtlas} from "../text/FontAtlas"
import {Material, type MaterialParameters} from "./Material"

export interface AtlasTextMaterialParameters extends MaterialParameters {
  /** Атлас глифов. Один атлас разделяется между всеми материалами с тем же шрифтом. */
  atlas: FontAtlas
  /** Цвет текста. По умолчанию белый. */
  color?: number | Color
  /** Прозрачность, перемножается с alpha-каналом семплированной текстуры. */
  opacity?: number
}

/**
 * Материал для AtlasText: цвет умножается на alpha-канал семплированного
 * глифа из FontAtlas. RGB-канал атласа не используется (атлас рендерится в
 * белом → alpha несёт форму). Renderer заранее создаёт GPUTexture+Sampler
 * один раз для атласа, материал держит только ссылку на атлас и color.
 */
export class AtlasTextMaterial extends Material {
  public readonly isAtlasTextMaterial: true = true
  public atlas: FontAtlas
  public color: Color
  public opacity: number

  constructor(parameters: AtlasTextMaterialParameters) {
    super(parameters)
    this.atlas = parameters.atlas
    this.color = new Color(parameters.color ?? 0xffffff)
    this.opacity = parameters.opacity ?? 1.0
  }
}
