import {UiSurface, palette, radii} from "@metafor/elements"
import {Button as button} from "@metafor/components"

export class HudProbePane extends UiSurface {
  #clicks = 0

  constructor() {
    super({
      bgColor: palette.bgPanel,
      borderColor: palette.border,
      borderRadiusPx: radii.pane,
      padding: 8,
    })
  }

  protected render(): void {
    this.drawText("HUD", 2, 8, {
      fontPx: 11,
      material: this.materials.cyan,
      maxWidthPx: 46,
    })
    button(this, 46, 2, 142, 30, {
      label: this.#clicks === 0 ? "HUD probe" : `HUD probe ${this.#clicks}`,
      size: "small",
      variant: "outlined",
      tone: "neutral",
      tooltip: "HUD probe",
      action: () => {
        this.#clicks += 1
        this.requestRender()
      },
    })
  }
}
