import {Button, Pane, Typography, type ButtonProps} from "@ui/components"
import {UiSurface, flexColumn, flexRow, palette} from "@ui/elements"
import {playgroundTheme} from "./theme.ts"

export type PlaygroundNavigationItem<Route extends string> = Readonly<{
  id: string
  label: string
  route: Route
  disabled?: boolean
}>

export type PlaygroundNavigationOptions<Route extends string> = Readonly<{
  title: string
  items: readonly PlaygroundNavigationItem<Route>[]
  route: Route
  onNavigate(route: Route): void
}>

export class PlaygroundNavigationSurface<Route extends string> extends UiSurface {
  #options: PlaygroundNavigationOptions<Route>

  constructor(options: PlaygroundNavigationOptions<Route>) {
    super({bgColor: null, borderColor: null})
    this.#options = options
    this.node.name = `PlaygroundNavigationSurface.${options.title}`
  }

  setOptions(options: PlaygroundNavigationOptions<Route>): void {
    this.#options = options
    this.requestRender()
  }

  protected override render(): void {
    drawPanel(this)
    const {title, items, route, onNavigate} = this.#options
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: 18,
      paddingTop: 24,
      paddingBottom: 18,
      gap: 9,
      items: [
        {height: 34, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: title, variant: "title", sx: {textAlign: "center"}})},
        {height: 16, draw: () => {}},
        ...items.map((item) => ({
          height: 38,
          draw: (x: number, y: number, w: number, h: number) => {
            const active = item.route === route
            Button(this, x, y, w, h, {
              children: item.label,
              variant: active ? "contained" : "glass",
              color: "neutral",
              ...activeNavigationStyle(active),
              disabled: item.disabled === true,
              radius: 999,
              fontPx: 11,
              onClick: () => onNavigate(item.route),
            })
          },
        })),
      ],
    })
  }
}

export class PlaygroundDockSurface<Route extends string> extends UiSurface {
  #options: PlaygroundNavigationOptions<Route>

  constructor(options: PlaygroundNavigationOptions<Route>) {
    super({bgColor: null, borderColor: null})
    this.#options = options
    this.node.name = "PlaygroundDockSurface"
  }

  setOptions(options: PlaygroundNavigationOptions<Route>): void {
    this.#options = options
    this.requestRender()
  }

  protected override render(): void {
    drawPanel(this, true)
    const {items, route, onNavigate} = this.#options
    flexRow({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: 24,
      paddingY: 24,
      gap: 10,
      alignItems: "stretch",
      items: items.map((item) => {
        const active = item.route === route
        return {
          width: "1fr" as const,
          height: 42,
          draw: (x: number, y: number, w: number, h: number) => Button(this, x, y, w, h, {
            children: item.label,
            variant: active ? "contained" : "glass",
            color: "neutral",
            ...activeNavigationStyle(active),
            disabled: item.disabled === true,
            radius: 999,
            fontPx: 10,
            onClick: () => onNavigate(item.route),
          }),
        }
      }),
    })
  }
}

export type PlaygroundInfoOptions = Readonly<{
  title: string
  lines: readonly string[]
  status?: string
}>

export class PlaygroundInfoSurface extends UiSurface {
  #options: PlaygroundInfoOptions

  constructor(options: PlaygroundInfoOptions) {
    super({bgColor: null, borderColor: null})
    this.#options = options
    this.node.name = "PlaygroundInfoSurface"
  }

  setOptions(options: PlaygroundInfoOptions): void {
    this.#options = options
    this.requestRender()
  }

  protected override render(): void {
    drawPanel(this)
    const {title, lines, status} = this.#options
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: 24,
      paddingTop: 28,
      paddingBottom: 24,
      gap: 14,
      items: [
        {height: 30, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: title, variant: "title"})},
        {height: 26, draw: () => {}},
        ...lines.map((line) => ({height: 22, draw: (x: number, y: number, w: number, h: number) => Typography(this, x, y, w, h, {children: line, variant: "caption", color: "muted"})})),
        {height: "grow", draw: () => {}},
        status === undefined ? false : {height: 40, draw: (x: number, y: number, w: number, h: number) => Typography(this, x, y, w, h, {children: status, variant: "caption", color: "cyan"})},
      ],
    })
  }
}

export class PlaygroundBackdropSurface extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
    this.node.name = "PlaygroundBackdropSurface"
  }

  protected override render(): void {
    this.drawBackdropGradient({
      base: 0x07101b,
      glowA: {color: "rgba(111,211,255,0.16)", cx: 0.28, cy: 0.18, radius: 0.42},
      glowB: {color: "rgba(82,196,123,0.10)", cx: 0.76, cy: 0.76, radius: 0.42},
      z: -0.18,
    })
  }
}

function drawPanel(surface: UiSurface, dock = false): void {
  Pane(surface, 0, 0, surface.frameWidth, surface.frameHeight, {
    variant: "glass",
    sx: {
      background: playgroundTheme.panelBackground,
      borderColor: dock ? playgroundTheme.dockBorder : playgroundTheme.panelBorder,
      borderRadius: dock ? 34 : playgroundTheme.panelRadius,
      zIndex: -0.12,
    },
  })
}

function activeNavigationStyle(active: boolean): Pick<ButtonProps, "fill" | "border"> {
  return active ? {fill: palette.bgHot, border: palette.cyan} : {}
}
