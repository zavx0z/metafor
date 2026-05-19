/**
 * Component: drawImage + setBackgroundImage.
 *
 * Текстуры через @metafor/engine ImageMaterial. Card.drawImage(src, x, y, w, h)
 * рисует текстуру в указанном rect'е; Card.setBackgroundImage({src, fit,
 * opacity, viewBox, scale}) задаёт фоновую картинку Card-а с поддержкой crop
 * через viewBox и масштаба внутри Card.
 */

import {Card, type UiCanvas, palette, divider, frame} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"
import type {ImageFit} from "@metafor/engine"

type Sample = "checker" | "gradient" | "stripes"

// Сэмплы — inline SVG как data: URL.
// Важно: <svg> ОБЯЗАТЕЛЬНО должен иметь width/height attribute на самом
// элементе (а не только viewBox), иначе createImageBitmap в Chromium
// отказывается декодировать blob — "The source image could not be decoded".
const SAMPLES: Record<Sample, string> = {
  checker: svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#0e1320"/>
  <g fill="#6fd3ff">
    ${[...Array(10).keys()].flatMap(j => [...Array(10).keys()].map(i =>
      (i + j) % 2 === 0 ? `<rect x="${i*20}" y="${j*20}" width="20" height="20"/>` : "")).join("")}
  </g>
  <text x="100" y="108" font-family="monospace" font-size="14" font-weight="700"
        text-anchor="middle" fill="#0e1320">checker</text>
</svg>`),
  gradient: svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5c9bff"/>
      <stop offset="50%" stop-color="#c597ff"/>
      <stop offset="100%" stop-color="#ff7f6f"/>
    </linearGradient>
  </defs>
  <rect width="320" height="200" fill="url(#g)"/>
  <text x="160" y="110" font-family="monospace" font-size="18" font-weight="700"
        text-anchor="middle" fill="#0e1320">gradient 320×200</text>
</svg>`),
  stripes: svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">
  ${[...Array(20).keys()].map(i =>
    `<rect x="${i*20}" y="0" width="20" height="100" fill="${i%2 ? "#52c47b" : "#0e1320"}"/>`).join("")}
  <text x="200" y="56" font-family="monospace" font-size="14" font-weight="700"
        text-anchor="middle" fill="#fff">stripes 400×100</text>
</svg>`),
}

function svgDataUrl(svg: string): string {
  // base64 надёжнее utf-8: не зависит от наличия запрещённых символов в URL
  // и нормально парсится TextureLoader через fetch → blob → createImageBitmap.
  const b64 = btoa(unescape(encodeURIComponent(svg.trim())))
  return `data:image/svg+xml;base64,${b64}`
}

class ImageCard extends Card {
  /** Snapshot последнего применённого bg-стейта, чтобы не звать setBackgroundImage
   *  на каждый render — это вызовет infinite-loop (setBackgroundImage → requestRender). */
  #lastBgKey = ""

  constructor(
    private readonly p: {
      sample: () => Sample
      fit: () => ImageFit
      opacity: () => number
      width: () => number
      height: () => number
      useViewBox: () => boolean
      vbX: () => number
      vbY: () => number
      vbW: () => number
      vbH: () => number
      bgSample: () => Sample
      bgFit: () => ImageFit
      bgOpacity: () => number
      bgScale: () => number
      showBg: () => boolean
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  /** Синхронизировать bg-image с текущими параметрами. Должен вызываться
   *  ИЗВНЕ render() (например, в response на params.onChange), потому что
   *  setBackgroundImage сам зовёт requestRender → render. */
  applyBgState(): void {
    const showBg = this.p.showBg()
    const key = showBg
      ? `1:${this.p.bgSample()}:${this.p.bgFit()}:${this.p.bgOpacity().toFixed(3)}:${this.p.bgScale().toFixed(3)}`
      : "0"
    if (key === this.#lastBgKey) return
    this.#lastBgKey = key
    if (showBg) {
      this.setBackgroundImage({
        src: SAMPLES[this.p.bgSample()],
        fit: this.p.bgFit(),
        opacity: this.p.bgOpacity(),
        scale: this.p.bgScale(),
      })
    } else {
      this.setBackgroundImage(null)
    }
  }

  protected render(): void {
    this.drawText("drawImage + setBackgroundImage", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const w = Math.min(this.p.width(), this.rectW - 32)
    const h = Math.min(this.p.height(), this.rectH - 100)
    const x = 16
    const y = 60

    this.drawText(`drawImage: fit="${this.p.fit()}" opacity=${this.p.opacity().toFixed(2)}`, 16, this.rectH - 22, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })

    const viewBox = this.p.useViewBox()
      ? {x: this.p.vbX(), y: this.p.vbY(), w: this.p.vbW(), h: this.p.vbH()}
      : undefined

    this.drawImage(SAMPLES[this.p.sample()], x, y, w, h, {
      fit: this.p.fit(),
      opacity: this.p.opacity(),
      ...(viewBox !== undefined ? {viewBox} : {}),
    })

    // Граница чтобы видеть rect картинки.
    frame(this, x, y, w, h, {color: palette.cyan, z: 0.00006})
  }
}

export default function imageDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Image",
    description:
      "Card.drawImage(src, x, y, w, h, opts) рисует текстуру в указанном rect'е. Card.setBackgroundImage({src, fit, opacity, viewBox, scale}) задаёт фон Card. Текстура подгружается через @metafor/engine TextureLoader (fetch + ImageBitmap → GPU texture).",
    breadcrumb: "Media / Image",
  })

  params.group({title: "drawImage — src"})
  const sample = params.select<Sample>("sample", {
    label: "src",
    description: "Тестовое изображение (inline SVG как data: URL).",
    default: "gradient",
    options: ["checker", "gradient", "stripes"],
  })

  params.group({title: "drawImage — fit & alpha"})
  const fit = params.select<ImageFit>("fit", {
    label: "fit",
    description: 'cover — заполнить весь rect, обрезая лишнее. contain — вписать целиком, оставляя letterbox.',
    default: "cover",
    options: ["cover", "contain"],
  })
  const opacity = params.number("opacity", {
    label: "opacity",
    description: "Прозрачность от 0 до 1.",
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
  })

  params.group({title: "drawImage — geometry"})
  const width = params.number("width", {
    label: "width",
    description: "Ширина rect'а изображения в px.",
    default: 320,
    min: 50,
    max: 700,
    step: 10,
    unit: "px",
  })
  const height = params.number("height", {
    label: "height",
    description: "Высота rect'а изображения в px.",
    default: 200,
    min: 30,
    max: 500,
    step: 10,
    unit: "px",
  })

  params.group({title: "drawImage — viewBox (crop)"})
  const useViewBox = params.boolean("useViewBox", {
    label: "useViewBox",
    description: "Применить sub-rect crop к исходной текстуре (x, y, w, h в долях 0..1).",
    default: false,
  })
  const vbX = params.number("vbX", {
    label: "viewBox.x",
    description: "X-смещение crop'а в долях ширины (0..1).",
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
  })
  const vbY = params.number("vbY", {
    label: "viewBox.y",
    description: "Y-смещение crop'а в долях высоты (0..1).",
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
  })
  const vbW = params.number("vbW", {
    label: "viewBox.w",
    description: "Ширина crop'а в долях (0..1). 1 = вся ширина.",
    default: 1,
    min: 0.05,
    max: 1,
    step: 0.05,
  })
  const vbH = params.number("vbH", {
    label: "viewBox.h",
    description: "Высота crop'а в долях (0..1).",
    default: 1,
    min: 0.05,
    max: 1,
    step: 0.05,
  })

  params.group({title: "setBackgroundImage"})
  const showBg = params.boolean("showBg", {
    label: "showBg",
    description: "Включить bg-image у Card (рендерится под всем контентом).",
    default: false,
  })
  const bgSample = params.select<Sample>("bgSample", {
    label: "bg src",
    description: "Картинка для bg.",
    default: "checker",
    options: ["checker", "gradient", "stripes"],
  })
  const bgFit = params.select<ImageFit>("bgFit", {
    label: "bg fit",
    description: 'cover/contain для bg-image.',
    default: "cover",
    options: ["cover", "contain"],
  })
  const bgOpacity = params.number("bgOpacity", {
    label: "bg opacity",
    description: "Прозрачность bg-image.",
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
  })
  const bgScale = params.number("bgScale", {
    label: "bg scale",
    description: "Масштаб bg-image внутри Card (0..1). 1 — заполнить весь Card, 0.8 — 80% размера с полем по краям.",
    default: 1,
    min: 0.2,
    max: 1,
    step: 0.05,
  })

  const card = new ImageCard({
    sample,
    fit,
    opacity,
    width,
    height,
    useViewBox,
    vbX,
    vbY,
    vbW,
    vbH,
    bgSample,
    bgFit,
    bgOpacity,
    bgScale,
    showBg,
  })
  canvas.addCard(card, ({w, h}) => ({x: 24, y: 24, w: w - 48, h: Math.max(360, h - 48)}))
  card.applyBgState()

  params.onChange(() => {
    card.applyBgState()
    canvas.relayout()
  })
}
