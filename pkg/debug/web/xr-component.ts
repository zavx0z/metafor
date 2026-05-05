/**
 * Component-based UI primitives для Yoga layout.
 *
 * Принципы:
 * - Каждый Component владеет одним Object3D (его layout-узел).
 * - Component.layout — это LayoutProps (flex/padding/gap/...). Yoga через
 *   LayoutManager.update заливает computed-bounds в object.computedLayout
 *   и position в object.position.
 * - Component.mount(font, pixelScale) вызывается ПОСЛЕ layout: компонент
 *   читает this.object.computedLayout и рендерит свой контент (Text/Mesh).
 *   До этого момента глобальные размеры неизвестны.
 * - Дети добавляются через .add(child) — child.object становится child'ом
 *   this.object, рекурсивный layout/mount работает естественно.
 *
 * Карточка строит дерево Component'ов в build() и отдаёт root.
 * XrLayoutCard прогоняет layout + mount.
 */

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type Renderer,
  Text,
  TextMaterial,
  TrueTypeFont,
  type LayoutProps,
} from "@metafor/engine"

export type MountContext = {
  font: TrueTypeFont
  pixelScale: number
  renderer: Renderer | null
}

export abstract class Component {
  readonly object = new Object3D()
  readonly children: Component[] = []

  constructor(layout?: LayoutProps) {
    if (layout !== undefined) this.object.layout = layout
  }

  add(...kids: Component[]): this {
    for (const k of kids) {
      this.children.push(k)
      this.object.add(k.object)
    }
    return this
  }

  /** Вызывается после layout. computedLayout уже заполнен. Создаёт Text/Mesh. */
  protected abstract paint(ctx: MountContext): void

  mount(ctx: MountContext): void {
    this.paint(ctx)
    for (const child of this.children) child.mount(ctx)
  }

  /** Освободить Text/Mesh-геометрии и вернуть Object3D в чистое состояние. */
  unmount(ctx: MountContext): void {
    for (const child of this.children) child.unmount(ctx)
    if (ctx.renderer !== null) {
      for (const obj of this.object.children) {
        const t = obj as Text
        if (t.isText === true) {
          if (t.stencilGeometry !== undefined) ctx.renderer.invalidateGeometry(t.stencilGeometry)
          if (t.coverGeometry !== undefined) ctx.renderer.invalidateGeometry(t.coverGeometry)
          continue
        }
        const m = obj as Mesh
        if (m.geometry !== undefined) ctx.renderer.invalidateGeometry(m.geometry)
      }
    }
    // Срезаем непосредственных Text/Mesh-детей; Component-дети пересобираются
    // из дерева потомков, их object3d-grandchildren уже почищены unmount'ом.
    this.object.children = this.children.map((c) => c.object)
  }
}

/** Чистый контейнер: только flex/padding/gap, без рендеринга. */
export class Box extends Component {
  protected paint(_ctx: MountContext): void {
    void _ctx
  }
}

/** Текст. Высота бокса = fontPx + 4 (cap-padding + descender), baseline = boxH-2. */
export class TextBox extends Component {
  readonly #value: string
  readonly #fontPx: number
  readonly #material: TextMaterial
  readonly #boxH: number

  constructor(value: string, opts: {fontPx: number; material: TextMaterial; boxHeight?: number; layout?: Omit<LayoutProps, "width" | "height">; minWidth?: number}) {
    const fontPx = opts.fontPx
    const boxH = opts.boxHeight ?? fontPx + 4
    const estW = Math.max(opts.minWidth ?? 0, Math.ceil(value.length * fontPx * 0.62))
    super({...(opts.layout ?? {}), width: estW, height: boxH})
    this.#value = value
    this.#fontPx = fontPx
    this.#material = opts.material
    this.#boxH = boxH
  }

  protected paint(ctx: MountContext): void {
    const t = new Text(this.#value, ctx.font, this.#fontPx * ctx.pixelScale, this.#material)
    // Baseline в boxH-2 от TL бокса → ascender (cap) ≈ boxH-2-0.7*fontPx,
    // descender ≈ boxH-2+0.2*fontPx (≤ boxH).
    t.position.x = 0
    t.position.y = -(this.#boxH - 2) * ctx.pixelScale
    t.position.z = 0.001
    t.updateMatrix()
    this.object.add(t)
  }
}

/** Прямоугольник в layout-tree. Размер берётся из computedLayout. */
export class Rect extends Component {
  readonly #color: Color
  readonly #z: number

  constructor(color: Color, layout: LayoutProps, z = 0) {
    super(layout)
    this.#color = color
    this.#z = z
  }

  protected paint(ctx: MountContext): void {
    const cl = this.object.computedLayout
    if (cl === undefined || cl.width <= 0 || cl.height <= 0) return
    const mesh = new Mesh(
      new PlaneGeometry({width: cl.width * ctx.pixelScale, height: cl.height * ctx.pixelScale}),
      new MeshBasicMaterial({color: this.#color}),
    )
    // Object3D origin LayoutManager выставил в (left, -top) parent-frame.
    // PlaneGeometry центрирована в (0,0) mesh'а: сдвигаем на +width/2, -height/2,
    // чтобы видимый прямоугольник занял именно computed-bounds.
    mesh.position.x = (cl.width / 2) * ctx.pixelScale
    mesh.position.y = -(cl.height / 2) * ctx.pixelScale
    mesh.position.z = this.#z
    mesh.updateMatrix()
    this.object.add(mesh)
  }
}

/**
 * Стандартный header карточки: title + опциональный subtitle на одной строке
 * + 1px divider под ним.
 */
export class CardHeader extends Box {
  constructor(opts: {
    title: string
    titleMaterial: TextMaterial
    subtitle?: string
    subtitleMaterial?: TextMaterial
    dividerColor: import("@metafor/engine").Color
    paddingLeft?: number
    paddingRight?: number
  }) {
    super({
      flexDirection: "column",
      paddingLeft: opts.paddingLeft ?? 0,
      paddingRight: opts.paddingRight ?? 0,
    })
    const row = new Box({
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      height: 22,
      paddingTop: 4,
    })
    row.add(new TextBox(opts.title, {fontPx: 13, material: opts.titleMaterial, boxHeight: 18}))
    if (opts.subtitle !== undefined && opts.subtitleMaterial !== undefined) {
      row.add(new TextBox(opts.subtitle, {fontPx: 11, material: opts.subtitleMaterial, boxHeight: 14}))
    }
    const divider = new Rect(opts.dividerColor, {height: 1, alignSelf: "stretch", marginTop: 6})
    this.add(row, divider)
  }
}

/** Box-with-bg: контейнер + автозаливка фона по computed-bounds. */
export class FilledBox extends Box {
  readonly #color: Color
  readonly #z: number

  constructor(layout: LayoutProps, color: Color, z = -0.001) {
    super(layout)
    this.#color = color
    this.#z = z
  }

  protected override paint(ctx: MountContext): void {
    super.paint(ctx)
    const cl = this.object.computedLayout
    if (cl === undefined || cl.width <= 0 || cl.height <= 0) return
    const mesh = new Mesh(
      new PlaneGeometry({width: cl.width * ctx.pixelScale, height: cl.height * ctx.pixelScale}),
      new MeshBasicMaterial({color: this.#color}),
    )
    mesh.position.x = (cl.width / 2) * ctx.pixelScale
    mesh.position.y = -(cl.height / 2) * ctx.pixelScale
    mesh.position.z = this.#z
    mesh.updateMatrix()
    // КРИТИЧНО: использовать Object3D.add() — он выставляет mesh.parent,
    // без которого updateWorldMatrix считает mesh root-level и рендерит
    // его в world-координатах его local-position (т.е. в центре canvas-а).
    // Раньше я делал children.unshift(mesh) и получал дубликат-фантом
    // в editor-area. z-buffer и так держит порядок отрисовки через z.
    this.object.add(mesh)
  }
}
