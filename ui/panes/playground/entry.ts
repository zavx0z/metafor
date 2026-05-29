import {Color, TextMaterial} from "@metafor/engine"
import {UiRuntime, UiSurface, flexColumn, h2, h3, p, palette, type UiSurfaceRect} from "@ui/elements"
import {autoButtonWidth, Button, Pane, type ButtonColor, type ButtonProps} from "@ui/components"
import {EditorPane, LogViewerPane, NotiStack, TerminalPane, type NotiStackBounds, type NotiStackTheme} from "@ui/panes"
import {tokenizeTypeScript} from "../editor/languages/typescript.ts"
import {createEditorTokenMaterials, renderEditorTokenizedLine} from "../editor/token-renderer.ts"
import {VirtualRouter} from "../../playground/virtual-router.ts"
import {panesPlaygroundLayout} from "./layout.ts"

type PaneCatalog = "EditorPane" | "TerminalPane" | "LogViewerPane" | "NotiStack"
type EditorSection = "Editing" | "Highlighting" | "Selection" | "Scroll"
type TerminalSection = "Basic" | "ANSI" | "Scroll" | "Input"
type LogViewerSection = "Basic" | "Wrap" | "Levels" | "Scroll"
type NotiSection = "Basic" | "Actions" | "Layout"
type EditorLanguageRoute = "typescript" | "javascript" | "html" | "css" | "plaintext"
type EditorSelectionRoute = "menu" | "right-click" | "shift-cursor" | "double-click"
type EditorScrollRoute = "vertical" | "horizontal"
type LogViewerWrapRoute = "wrap" | "no-wrap"
type LogViewerScrollRoute = "vertical" | "horizontal" | "no-vertical" | "no-horizontal" | "both" | "none"
type EditorRoute =
  | "editor/editing"
  | "editor/highlighting"
  | `editor/highlighting/${EditorLanguageRoute}`
  | "editor/selection"
  | `editor/selection/${EditorSelectionRoute}`
  | "editor/scroll"
  | `editor/scroll/${EditorScrollRoute}`
type TerminalRoute = "terminal/basic" | "terminal/ansi" | "terminal/scroll" | "terminal/input"
type LogViewerRoute =
  | "log-viewer/basic"
  | "log-viewer/wrap"
  | `log-viewer/wrap/${LogViewerWrapRoute}`
  | "log-viewer/levels"
  | "log-viewer/scroll"
  | `log-viewer/scroll/${LogViewerScrollRoute}`
type NotiRoute = "notistack/basic" | "notistack/actions" | "notistack/layout"
type PanesRoute = EditorRoute | TerminalRoute | LogViewerRoute | NotiRoute
type EditorAction = "focus" | "copy" | "cut" | "selectAll"
type TerminalAction = "demo" | "ansi" | "scroll" | "focus" | "clear"
type LogViewerAction = "append" | "levels" | "scroll" | "clear"
type NotiActionName = "basic" | "action" | "stacked" | "clear"
type LogViewerProps = {wrapLines: boolean; scrollX: boolean; scrollY: boolean}

const EDITOR_SECTIONS: readonly EditorSection[] = ["Editing", "Highlighting", "Selection", "Scroll"]
const TERMINAL_SECTIONS: readonly TerminalSection[] = ["Basic", "ANSI", "Scroll", "Input"]
const LOG_VIEWER_SECTIONS: readonly LogViewerSection[] = ["Basic", "Wrap", "Levels", "Scroll"]
const NOTI_SECTIONS: readonly NotiSection[] = ["Basic", "Actions", "Layout"]
const PANES_NAV: readonly PaneCatalog[] = ["EditorPane", "TerminalPane", "LogViewerPane", "NotiStack"]
const EDITOR_LANGUAGE_ROUTES: readonly EditorLanguageRoute[] = ["typescript", "javascript", "html", "css", "plaintext"]
const EDITOR_SELECTION_ROUTES: readonly EditorSelectionRoute[] = ["menu", "right-click", "shift-cursor", "double-click"]
const EDITOR_SCROLL_ROUTES: readonly EditorScrollRoute[] = ["vertical", "horizontal"]
const EDITOR_ROUTES: readonly EditorRoute[] = [
  "editor/editing",
  "editor/highlighting",
  ...EDITOR_LANGUAGE_ROUTES.map((language) => `editor/highlighting/${language}` as const),
  "editor/selection",
  ...EDITOR_SELECTION_ROUTES.map((route) => `editor/selection/${route}` as const),
  "editor/scroll",
  ...EDITOR_SCROLL_ROUTES.map((route) => `editor/scroll/${route}` as const),
]
const TERMINAL_ROUTES: readonly TerminalRoute[] = ["terminal/basic", "terminal/ansi", "terminal/scroll", "terminal/input"]
const LOG_VIEWER_ROUTES: readonly LogViewerRoute[] = [
  "log-viewer/basic",
  "log-viewer/wrap",
  "log-viewer/wrap/wrap",
  "log-viewer/wrap/no-wrap",
  "log-viewer/levels",
  "log-viewer/scroll",
  "log-viewer/scroll/vertical",
  "log-viewer/scroll/horizontal",
  "log-viewer/scroll/no-vertical",
  "log-viewer/scroll/no-horizontal",
  "log-viewer/scroll/both",
  "log-viewer/scroll/none",
]
const NOTI_ROUTES: readonly NotiRoute[] = ["notistack/basic", "notistack/actions", "notistack/layout"]
const PANES_ROUTES: readonly PanesRoute[] = [...EDITOR_ROUTES, ...TERMINAL_ROUTES, ...LOG_VIEWER_ROUTES, ...NOTI_ROUTES]
const EDITOR_LANGUAGE_LABELS: Record<EditorLanguageRoute, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  html: "HTML",
  css: "CSS",
  plaintext: "Plaintext",
}
const LAYOUT_Z = -0.12
const CODE_TOKEN_MATERIALS = createEditorTokenMaterials()
const CODE_FALLBACK_MATERIAL = new TextMaterial({color: palette.muted})

type PanesScreenOpts = {
  onRouteChange?: (route: PanesRoute) => void
  onEditorAction?: (action: EditorAction) => void
  onTerminalAction?: (action: TerminalAction) => void
  onLogViewerAction?: (action: LogViewerAction) => void
  onNotiAction?: (action: NotiActionName) => void
}

type DockItem = {
  label: string
  active?: boolean
  color?: ButtonColor
  onClick: () => void
}

class PanesScreen extends UiSurface {
  readonly #router = new VirtualRouter<PanesRoute>(PANES_ROUTES, "terminal/basic", {mode: "path"})
  readonly #unsubscribe: () => void
  readonly #onRouteChange: ((route: PanesRoute) => void) | undefined
  readonly #onEditorAction: ((action: EditorAction) => void) | undefined
  readonly #onTerminalAction: ((action: TerminalAction) => void) | undefined
  readonly #onLogViewerAction: ((action: LogViewerAction) => void) | undefined
  readonly #onNotiAction: ((action: NotiActionName) => void) | undefined
  #route: PanesRoute = this.#router.current
  #selectionBufferState: "idle" | "copied" | "error" = "idle"

  constructor(opts: PanesScreenOpts = {}) {
    super({bgColor: null, borderColor: null})
    this.#onRouteChange = opts.onRouteChange
    this.#onEditorAction = opts.onEditorAction
    this.#onTerminalAction = opts.onTerminalAction
    this.#onLogViewerAction = opts.onLogViewerAction
    this.#onNotiAction = opts.onNotiAction
    this.#unsubscribe = this.#router.subscribe((route) => {
      this.#route = route
      if (!route.startsWith("editor/selection")) this.#selectionBufferState = "idle"
      this.#onRouteChange?.(route)
      this.requestRender()
    })
  }

  get currentRoute(): PanesRoute {
    return this.#route
  }

  setEditorSelectionClipboardResult(ok: boolean): void {
    this.#selectionBufferState = ok ? "copied" : "error"
    this.requestRender()
  }

  override dispose(): void {
    this.#unsubscribe()
    this.#router.dispose()
    super.dispose()
  }

  protected render(): void {
    const layout = panesPlaygroundLayout(this.rectW, this.rectH)
    const {stageX, stageY, catalogW, sectionW, previewW, previewH, paramsW, stageH, dockH, gap, sectionX, previewX, paramsX} = layout
    this.#catalog(stageX, stageY, catalogW, stageH)
    this.#sectionPanel(sectionX, stageY, sectionW, stageH)
    this.#preview(previewX, stageY, previewW, previewH)
    this.#dock(previewX, stageY + previewH + gap, previewW, dockH)
    this.#parameters(paramsX, stageY, paramsW, stageH)
  }

  #catalog(x: number, y: number, w: number, h: number): void {
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 36, zIndex: LAYOUT_Z},
    })
    h3(this, x, y + 28, w, 24, {children: "Panes", style: {fontSize: 15, textAlign: "center"}})
    const pad = 18
    const top = y + 76
    const rowH = 38
    const gap = 9
    Pane(this, x + pad, top, w - pad * 2, h - 94, {
      key: "panes:catalog",
      scrollContentHeight: PANES_NAV.length * (rowH + gap) - gap,
      sx: {background: null, borderColor: null, borderRadius: 0, padding: 0, overflowY: "auto"},
      children: (ctx) => {
        for (const [i, label] of PANES_NAV.entries()) {
          const rowY = top + i * (rowH + gap) - ctx.scrollTop
          if (rowY + rowH < top || rowY > top + ctx.viewportHeight) continue
          const active = this.#currentPane() === label
          Button(this, x + pad, rowY, w - pad * 2 - (ctx.contentHeight > ctx.viewportHeight ? 14 : 0), rowH, {
            children: label,
            variant: active ? "contained" : "glass",
            color: "neutral",
            ...activeNavStyle(active),
            radius: 999,
            fontPx: 11,
            onClick: () => this.#goPane(label),
          })
        }
      },
    })
  }

  #sectionPanel(x: number, y: number, w: number, h: number): void {
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 36, zIndex: LAYOUT_Z},
    })
    const current = this.#currentPane()
    h3(this, x, y + 28, w, 24, {children: current, style: {fontSize: 15, textAlign: "center"}})
    if (current === "EditorPane") {
      this.#sectionList(x, y + 76, w, h - 94, EDITOR_SECTIONS, (section) => this.#editorSection() === section, (section) => this.#goEditorSection(section))
      return
    }
    if (current === "TerminalPane") {
      this.#sectionList(x, y + 76, w, h - 94, TERMINAL_SECTIONS, (section) => this.#terminalSection() === section, (section) => this.#goTerminalSection(section))
      return
    }
    if (current === "LogViewerPane") {
      this.#sectionList(x, y + 76, w, h - 94, LOG_VIEWER_SECTIONS, (section) => this.#logViewerSection() === section, (section) => this.#goLogViewerSection(section))
      return
    }
    this.#sectionList(x, y + 76, w, h - 94, NOTI_SECTIONS, (section) => this.#notiSection() === section, (section) => this.#goNotiSection(section))
  }

  #sectionList<T extends string>(
    panelX: number,
    listY: number,
    panelW: number,
    listH: number,
    sections: readonly T[],
    isActive: (section: T) => boolean,
    onSelect: (section: T) => void,
  ): void {
    const pad = 18
    const rowH = 38
    const gap = 9
    Pane(this, panelX + pad, listY, panelW - pad * 2, Math.max(rowH, listH), {
      key: `panes:sections:${this.#currentPane()}`,
      scrollContentHeight: sections.length * (rowH + gap) - gap,
      sx: {background: null, borderColor: null, borderRadius: 0, padding: 0, overflowY: "auto"},
      children: (ctx) => {
        for (const [i, section] of sections.entries()) {
          const rowY = listY + i * (rowH + gap) - ctx.scrollTop
          if (rowY + rowH < listY || rowY > listY + ctx.viewportHeight) continue
          const active = isActive(section)
          Button(this, panelX + pad, rowY, panelW - pad * 2 - (ctx.contentHeight > ctx.viewportHeight ? 14 : 0), rowH, {
            children: section,
            variant: active ? "contained" : "glass",
            color: "neutral",
            ...activeNavStyle(active),
            radius: 999,
            fontPx: 11,
            onClick: () => onSelect(section),
          })
        }
      },
    })
  }

  #preview(x: number, y: number, w: number, h: number): void {
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(8, 13, 22, 0.72)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 38, zIndex: LAYOUT_Z},
    })
    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    if (this.#currentPane() === "EditorPane") this.#editorPreview(x, y, w, h)
    else if (this.#currentPane() === "TerminalPane") this.#terminalPreview(x, y, w, h)
    else if (this.#currentPane() === "LogViewerPane") this.#logViewerPreview(x, y, w, h)
    else this.#notiPreview(x, y, w, h)
    this.popClip()
  }

  #editorPreview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    if (this.#editorSection() === "Highlighting") {
      renderHeader(this, x, w, pad, y + 34, "Syntax source pane", [
        "EditorPane is a focusable source editor with pluggable language highlighters.",
        "The mounted surface below is imported from @ui/panes.",
      ])
    } else if (this.#editorSection() === "Selection") {
      renderHeader(this, x, w, pad, y + 34, "Selection surface", [
        "Selection, copy/cut, context menu state, and cursor routing stay inside the pane.",
        "The dock drives route states for repeatable interaction variants.",
      ])
    } else if (this.#editorSection() === "Scroll") {
      renderHeader(this, x, w, pad, y + 34, "Editor scrolling", [
        "Long source and long lines use the built-in scroll state.",
        "The preview mounts the same reusable pane surface used by apps.",
      ])
    } else {
      renderHeader(this, x, w, pad, y + 34, "Editable code pane", [
        "Typing, navigation, undo history, and save callbacks are exposed through one API.",
        "No DOM layout is used as the source of text geometry.",
      ])
    }
  }

  #terminalPreview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    if (this.#terminalSection() === "ANSI") {
      renderHeader(this, x, w, pad, y + 34, "ANSI rendering", [
        "TerminalPane parses SGR colors, cursor moves, erase commands, and scrollback.",
        "Transport adapters only call write() and receive input from onInput().",
      ])
    } else if (this.#terminalSection() === "Scroll") {
      renderHeader(this, x, w, pad, y + 34, "Scrollback terminal", [
        "Output history renders through the shared elements scroll primitive.",
        "Autoscroll is preserved while the user is already at the bottom.",
      ])
    } else if (this.#terminalSection() === "Input") {
      renderHeader(this, x, w, pad, y + 34, "Input adapter", [
        "Keyboard, paste, arrows, and control sequences leave through the universal API.",
        "The playground echoes input locally; any PTY or interpreter can replace that adapter.",
      ])
    } else {
      renderHeader(this, x, w, pad, y + 34, "TerminalPane", [
        "A reusable WebGPU terminal pane for PTY, interpreter output, logs, and agents.",
        "The terminal owns buffer state, ANSI parsing, cursor, resize metrics, and rendering.",
      ])
    }
  }

  #logViewerPreview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    if (this.#logViewerSection() === "Levels") {
      renderHeader(this, x, w, pad, y + 34, "Log levels", [
        "LogViewerPane keeps ANSI output, scrollback, selection, and copy behavior.",
        "It has no input adapter, prompt state, or terminal cursor.",
      ])
    } else if (this.#logViewerSection() === "Wrap") {
      renderHeader(this, x, w, pad, y + 34, "Line wrapping", [
        "Wrap is a LogViewerPane capability; the dock switches its variants.",
        "No wrap keeps long entries on one visual row and clips unless horizontal scroll is enabled.",
      ])
    } else if (this.#logViewerSection() === "Scroll") {
      renderHeader(this, x, w, pad, y + 34, "Output scrollback", [
        "Long logs reuse the same virtualized text surface as TerminalPane.",
        "The public API stays focused on write(), writeln(), clear(), and selection.",
      ])
    } else {
      renderHeader(this, x, w, pad, y + 34, "LogViewerPane", [
        "Output-only pane for build logs, interpreters, background jobs, and agents.",
        "No transport or server contract is embedded in the UI component.",
      ])
    }
  }

  #notiPreview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    if (this.#notiSection() === "Actions") {
      renderHeader(this, x, w, pad, y + 34, "Action toasts", [
        "NotiStack is a controller that mounts individual notification panes into UiRuntime.",
        "Primary and secondary actions are rendered with the shared Button component.",
      ])
    } else if (this.#notiSection() === "Layout") {
      renderHeader(this, x, w, pad, y + 34, "Stack layout", [
        "Each toast owns a precise runtime rect, so empty space between items does not catch clicks.",
        "Use the dock to repopulate the stack with several notifications.",
      ])
    } else {
      renderHeader(this, x, w, pad, y + 34, "NotiStack", [
        "Reusable overlay notifications live in @ui/panes alongside editor and terminal.",
        "The preview controls the real stack mounted over this playground.",
      ])
    }
    const rows = contentRows(y, h, {headerH: 118, demoH: 214, codeH: 0})
    const cardW = Math.min(520, w - pad * 2)
    const cardH = 184
    const cardX = x + (w - cardW) / 2
    const cardY = rows.demoY + (214 - cardH) / 2
    Pane(this, cardX, cardY, cardW, cardH, {
      variant: "outlined",
      sx: {background: "rgba(4, 8, 14, 0.32)", borderColor: "rgba(111, 211, 255, 0.20)", borderRadius: 24, padding: 0},
    })
    h3(this, cardX + 28, cardY + 28, cardW - 56, 24, {children: "UiRuntime overlay stack", style: {fontSize: 18}})
    p(this, cardX + 28, cardY + 68, cardW - 56, 22, {children: "Push notifications from the dock; the actual panes render inside this panel.", style: {fontSize: 13, color: "muted"}})
    p(this, cardX + 28, cardY + 100, cardW - 56, 22, {children: "The stack itself is not server-bound and receives all actions as callbacks.", style: {fontSize: 13, color: "muted"}})
  }

  #dock(x: number, y: number, w: number, h: number): void {
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 34, zIndex: LAYOUT_Z},
    })
    if (this.#currentPane() === "EditorPane") {
      this.#editorDock(x, y, w, h)
      return
    }
    if (this.#currentPane() === "TerminalPane") {
      this.#terminalDock(x, y, w, h)
      return
    }
    if (this.#currentPane() === "LogViewerPane") {
      this.#logViewerDock(x, y, w, h)
      return
    }
    this.#notiDock(x, y, w, h)
  }

  #editorDock(x: number, y: number, w: number, h: number): void {
    const section = this.#editorSection()
    if (section === "Highlighting") {
      const activeLanguage = routeEditorLanguageFromRoute(this.#route)
      this.#buttonRow(x, y, w, h, EDITOR_LANGUAGE_ROUTES.map((language) => ({
        label: EDITOR_LANGUAGE_LABELS[language],
        active: activeLanguage === language,
        onClick: () => this.#goEditorLanguage(language),
      })))
      return
    }
    if (section === "Selection") {
      this.#buttonRow(x, y, w, h, [
        {
          label: this.#selectionBufferState === "copied" ? "Copied" : this.#selectionBufferState === "error" ? "Failed" : "Copy",
          active: this.#selectionBufferState === "copied",
          color: this.#selectionBufferState === "error" ? "error" : "neutral",
          onClick: () => this.#onEditorAction?.("copy"),
        },
        {label: "Cut", onClick: () => this.#onEditorAction?.("cut")},
        {label: "Menu", active: this.#route === "editor/selection/menu", onClick: () => this.#router.go("editor/selection/menu")},
        {label: "Right click", active: this.#route === "editor/selection/right-click", onClick: () => this.#router.go("editor/selection/right-click")},
        {label: "Shift", active: this.#route === "editor/selection/shift-cursor", onClick: () => this.#router.go("editor/selection/shift-cursor")},
        {label: "Double", active: this.#route === "editor/selection/double-click", onClick: () => this.#router.go("editor/selection/double-click")},
      ])
      return
    }
    if (section === "Scroll") {
      this.#buttonRow(x, y, w, h, [
        {label: "Vertical", active: editorScrollModeFromRoute(this.#route) === "vertical", onClick: () => this.#router.go("editor/scroll/vertical")},
        {label: "Horizontal", active: editorScrollModeFromRoute(this.#route) === "horizontal", onClick: () => this.#router.go("editor/scroll/horizontal")},
      ])
      return
    }
    this.#buttonRow(x, y, w, h, [
      {label: "Focus editor", active: true, color: "success", onClick: () => this.#onEditorAction?.("focus")},
      {label: "Select all", onClick: () => this.#onEditorAction?.("selectAll")},
    ])
  }

  #terminalDock(x: number, y: number, w: number, h: number): void {
    const section = this.#terminalSection()
    const items: readonly DockItem[] =
      section === "ANSI"
        ? [
          {label: "Palette", active: true, color: "primary", onClick: () => this.#onTerminalAction?.("ansi")},
          {label: "Clear", onClick: () => this.#onTerminalAction?.("clear")},
        ]
        : section === "Scroll"
          ? [
            {label: "Append lines", active: true, color: "primary", onClick: () => this.#onTerminalAction?.("scroll")},
            {label: "Clear", onClick: () => this.#onTerminalAction?.("clear")},
          ]
          : section === "Input"
            ? [
              {label: "Focus terminal", active: true, color: "success", onClick: () => this.#onTerminalAction?.("focus")},
              {label: "Clear", onClick: () => this.#onTerminalAction?.("clear")},
            ]
            : [
              {label: "Demo output", active: true, color: "primary", onClick: () => this.#onTerminalAction?.("demo")},
              {label: "Clear", onClick: () => this.#onTerminalAction?.("clear")},
            ]
    this.#buttonRow(x, y, w, h, items)
  }

  #logViewerDock(x: number, y: number, w: number, h: number): void {
    const section = this.#logViewerSection()
    if (section === "Wrap") {
      const wrapMode = logViewerWrapRouteFromRoute(this.#route)
      this.#buttonRow(x, y, w, h, [
        {label: "Wrap", active: wrapMode === "wrap", color: "primary", onClick: () => this.#router.go("log-viewer/wrap/wrap")},
        {label: "No wrap", active: wrapMode === "no-wrap", color: "primary", onClick: () => this.#router.go("log-viewer/wrap/no-wrap")},
      ])
      return
    }
    if (section === "Scroll") {
      const detail = logViewerScrollDockRouteFromRoute(this.#route)
      this.#buttonRow(x, y, w, h, [
        {label: "Scroll vertical", active: detail === "vertical", color: "primary", onClick: () => this.#router.go("log-viewer/scroll/vertical")},
        {label: "Scroll horizontal", active: detail === "horizontal", color: "primary", onClick: () => this.#router.go("log-viewer/scroll/horizontal")},
        {label: "No vertical", active: detail === "no-vertical", color: "neutral", onClick: () => this.#router.go("log-viewer/scroll/no-vertical")},
        {label: "No horizontal", active: detail === "no-horizontal", color: "neutral", onClick: () => this.#router.go("log-viewer/scroll/no-horizontal")},
      ])
      return
    }
    const items: readonly DockItem[] =
      section === "Levels"
        ? [
          {label: "Append levels", active: true, color: "primary", onClick: () => this.#onLogViewerAction?.("levels")},
          {label: "Clear", onClick: () => this.#onLogViewerAction?.("clear")},
        ]
        : [
          {label: "Append entry", active: true, color: "primary", onClick: () => this.#onLogViewerAction?.("append")},
          {label: "Clear", onClick: () => this.#onLogViewerAction?.("clear")},
        ]
    this.#buttonRow(x, y, w, h, items)
  }

  #notiDock(x: number, y: number, w: number, h: number): void {
    const section = this.#notiSection()
    const items: readonly DockItem[] =
      section === "Actions"
        ? [
          {label: "Action toast", active: true, color: "primary", onClick: () => this.#onNotiAction?.("action")},
          {label: "Clear", onClick: () => this.#onNotiAction?.("clear")},
        ]
        : section === "Layout"
          ? [
            {label: "Stacked", active: true, color: "primary", onClick: () => this.#onNotiAction?.("stacked")},
            {label: "Clear", onClick: () => this.#onNotiAction?.("clear")},
          ]
          : [
            {label: "Push toast", active: true, color: "primary", onClick: () => this.#onNotiAction?.("basic")},
            {label: "Clear", onClick: () => this.#onNotiAction?.("clear")},
          ]
    this.#buttonRow(x, y, w, h, items)
  }

  #buttonRow(x: number, y: number, w: number, h: number, items: readonly DockItem[]): void {
    if (items.length === 0) return
    const gap = 12
    const buttonH = 42
    const idealWidths = items.map((item) => Math.max(94, autoButtonWidth(this, item.label, 10, 24)))
    const idealW = idealWidths.reduce((sum, width) => sum + width, 0) + gap * (idealWidths.length - 1)
    const maxW = w - 48
    const compact = idealW > maxW
    const itemWidths = compact ? items.map(() => Math.max(72, (maxW - gap * (items.length - 1)) / items.length)) : idealWidths
    const rowW = itemWidths.reduce((sum, width) => sum + width, 0) + gap * (itemWidths.length - 1)
    let itemX = x + (w - rowW) / 2
    for (const [i, item] of items.entries()) {
      const itemW = itemWidths[i]!
      const active = item.active === true
      Button(this, itemX, y + (h - buttonH) / 2, itemW, buttonH, {
        children: item.label,
        variant: active ? "contained" : "glass",
        color: item.color ?? "neutral",
        ...activeNavStyle(active),
        radius: 999,
        fontPx: compact ? 9 : 10,
        onClick: item.onClick,
      })
      itemX += itemW + gap
    }
  }

  #parameters(x: number, y: number, w: number, h: number): void {
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 36, zIndex: LAYOUT_Z},
    })
    const pad = 24
    h3(this, x + pad, y + 30, w - pad * 2, 24, {children: this.#currentPane(), style: {fontSize: 15}})
    p(this, x + pad, y + 70, w - pad * 2, 22, {children: "Route", style: {fontSize: 11, color: "muted"}})
    codeBlock(this, x + pad, y + 104, w - pad * 2, this.#codeLines())
  }

  #codeLines(): readonly string[] {
    if (this.#currentPane() === "EditorPane") {
      return [
        `import {EditorPane} from "@ui/panes"`,
        ``,
        `const editor = new EditorPane({`,
        `  languageId: "${editorLanguageId(editorLanguageFromRoute(this.#route))}",`,
        `  path: "${editorLanguagePath(editorLanguageFromRoute(this.#route))}" })`,
      ]
    }
    if (this.#currentPane() === "TerminalPane") {
      return [
        `import {TerminalPane} from "@ui/panes"`,
        ``,
        `const term = new TerminalPane({`,
        `  onInput: adapter.write,`,
        `  onResize: adapter.resize })`,
        `term.write(outputBytes)`,
      ]
    }
    if (this.#currentPane() === "LogViewerPane") {
      const props = logViewerPropsFromRoute(this.#route)
      return [
        `import {LogViewerPane} from "@ui/panes"`,
        ``,
        `const logs = new LogViewerPane({`,
        `  title: "Build logs",`,
        `  wrapLines: ${String(props.wrapLines)},`,
        `  scrollY: ${String(props.scrollY)},`,
        `  scrollX: ${String(props.scrollX)},`,
        `  maxScrollback: 5000 })`,
        `logs.write(logOutput)`,
      ]
    }
    return [
      `import {NotiStack} from "@ui/panes"`,
      ``,
      `const stack = new NotiStack(ui, {`,
      `  theme, layout: {bounds: previewRect}`,
      `})`,
      `stack.push({title, body, primary})`,
      `stack.clear()`,
    ]
  }

  #currentPane(): PaneCatalog {
    if (this.#route.startsWith("editor/")) return "EditorPane"
    if (this.#route.startsWith("terminal/")) return "TerminalPane"
    if (this.#route.startsWith("log-viewer/")) return "LogViewerPane"
    return "NotiStack"
  }

  #goPane(pane: PaneCatalog): void {
    if (pane === "EditorPane") this.#router.go("editor/editing")
    else if (pane === "TerminalPane") this.#router.go("terminal/basic")
    else if (pane === "LogViewerPane") this.#router.go("log-viewer/basic")
    else this.#router.go("notistack/basic")
  }

  #editorSection(): EditorSection {
    if (this.#route.startsWith("editor/highlighting")) return "Highlighting"
    if (this.#route.startsWith("editor/selection")) return "Selection"
    if (this.#route.startsWith("editor/scroll")) return "Scroll"
    return "Editing"
  }

  #terminalSection(): TerminalSection {
    if (this.#route === "terminal/ansi") return "ANSI"
    if (this.#route === "terminal/scroll") return "Scroll"
    if (this.#route === "terminal/input") return "Input"
    return "Basic"
  }

  #logViewerSection(): LogViewerSection {
    if (this.#route.startsWith("log-viewer/wrap")) return "Wrap"
    if (this.#route === "log-viewer/levels") return "Levels"
    if (this.#route.startsWith("log-viewer/scroll")) return "Scroll"
    return "Basic"
  }

  #notiSection(): NotiSection {
    if (this.#route === "notistack/actions") return "Actions"
    if (this.#route === "notistack/layout") return "Layout"
    return "Basic"
  }

  #goEditorSection(section: EditorSection): void {
    if (section === "Highlighting") this.#router.go("editor/highlighting")
    else if (section === "Selection") this.#router.go("editor/selection")
    else if (section === "Scroll") this.#router.go("editor/scroll")
    else this.#router.go("editor/editing")
  }

  #goTerminalSection(section: TerminalSection): void {
    if (section === "ANSI") this.#router.go("terminal/ansi")
    else if (section === "Scroll") this.#router.go("terminal/scroll")
    else if (section === "Input") this.#router.go("terminal/input")
    else this.#router.go("terminal/basic")
  }

  #goLogViewerSection(section: LogViewerSection): void {
    if (section === "Wrap") this.#router.go("log-viewer/wrap")
    else if (section === "Levels") this.#router.go("log-viewer/levels")
    else if (section === "Scroll") this.#router.go("log-viewer/scroll")
    else this.#router.go("log-viewer/basic")
  }

  #goNotiSection(section: NotiSection): void {
    if (section === "Actions") this.#router.go("notistack/actions")
    else if (section === "Layout") this.#router.go("notistack/layout")
    else this.#router.go("notistack/basic")
  }

  #goEditorLanguage(language: EditorLanguageRoute): void {
    this.#router.go(`editor/highlighting/${language}`)
  }
}

function activeNavStyle(active: boolean): Pick<ButtonProps, "fill" | "border"> {
  if (!active) return {}
  return {fill: palette.bgHot, border: palette.cyan}
}

function renderHeader(host: UiSurface, x: number, w: number, pad: number, y: number, title: string, lines: readonly string[]): void {
  h2(host, x + pad, y, w - pad * 2, 34, {children: title, style: {fontSize: 24}})
  for (const [i, line] of lines.entries()) {
    p(host, x + pad, y + 48 + i * 24, w - pad * 2, 22, {children: line, style: {fontSize: 13, color: "muted"}})
  }
}

function contentRows(
  y: number,
  h: number,
  heights: {
    headerH: number
    demoH: number
    codeH: number
  },
): {headerY: number; demoY: number; codeY: number} {
  const rows = {
    headerY: y + 34,
    demoY: y + 34 + heights.headerH,
    codeY: y + h - 42 - heights.codeH,
  }
  flexColumn({
    x: 0,
    y,
    w: 1,
    h,
    paddingTop: 34,
    paddingBottom: 42,
    justifyContent: "space-between",
    items: [
      {height: heights.headerH, draw: (_x, rowY) => { rows.headerY = rowY }},
      {height: heights.demoH, draw: (_x, rowY) => { rows.demoY = rowY }},
      {height: heights.codeH, draw: (_x, rowY) => { rows.codeY = rowY }},
    ],
  })
  return rows
}

function codeBlockHeight(lines: readonly string[]): number {
  return 16 + lines.length * 18
}

function codeBlock(host: UiSurface, x: number, y: number, w: number, lines: readonly string[]): void {
  const lineH = 18
  const h = codeBlockHeight(lines)
  Pane(host, x, y, w, h, {
    variant: "glass",
    sx: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 17},
  })
  const tokens = tokenizeTypeScript([...lines])
  host.pushClip(x + 14, y + 7, Math.max(1, w - 28), Math.max(1, h - 14))
  for (const [i, line] of lines.entries()) {
    renderEditorTokenizedLine({
      pane: host,
      text: line,
      tokens: tokens[i] ?? [],
      startX: x + 14,
      y: y + 8 + i * lineH,
      fontPx: 10,
      maxPx: Math.max(1, w - 28),
      materials: CODE_TOKEN_MATERIALS,
      fallbackMaterial: CODE_FALLBACK_MATERIAL,
    })
  }
  host.popClip()
}

function editorPaneRectForPreview(x: number, y: number, w: number, h: number): UiSurfaceRect {
  const top = y + 142
  const inset = 56
  return {
    x: x + inset,
    y: top,
    w: Math.max(260, w - inset * 2),
    h: Math.max(220, h - 190),
  }
}

function terminalPaneRectForPreview(x: number, y: number, w: number, h: number): UiSurfaceRect {
  const top = y + 142
  const inset = 56
  return {
    x: x + inset,
    y: top,
    w: Math.max(320, w - inset * 2),
    h: Math.max(220, h - 190),
  }
}

function editorPaneRectForCanvas(w: number, h: number): UiSurfaceRect {
  const layout = panesPlaygroundLayout(w, h)
  return editorPaneRectForPreview(layout.previewX, layout.stageY, layout.previewW, layout.previewH)
}

function terminalPaneRectForCanvas(w: number, h: number): UiSurfaceRect {
  const layout = panesPlaygroundLayout(w, h)
  return terminalPaneRectForPreview(layout.previewX, layout.stageY, layout.previewW, layout.previewH)
}

function notiStackBoundsForCanvas(w: number, h: number): NotiStackBounds {
  const layout = panesPlaygroundLayout(w, h)
  const inset = 28
  const headerH = 128
  return {
    x: layout.previewX + inset,
    y: layout.stageY + headerH,
    w: Math.max(1, layout.previewW - inset * 2),
    h: Math.max(1, layout.previewH - headerH - inset),
  }
}

function hiddenRect(): UiSurfaceRect {
  return {x: 0, y: 0, w: 1, h: 1, visible: false}
}

function editorLanguageFromRoute(route: PanesRoute): EditorLanguageRoute {
  return routeEditorLanguageFromRoute(route) ?? "typescript"
}

function routeEditorLanguageFromRoute(route: PanesRoute): EditorLanguageRoute | null {
  if (route === "editor/highlighting/typescript") return "typescript"
  if (route === "editor/highlighting/javascript") return "javascript"
  if (route === "editor/highlighting/html") return "html"
  if (route === "editor/highlighting/css") return "css"
  if (route === "editor/highlighting/plaintext") return "plaintext"
  return null
}

function editorScrollModeFromRoute(route: PanesRoute): EditorScrollRoute {
  return route === "editor/scroll/horizontal" ? "horizontal" : "vertical"
}

function editorLanguageId(language: EditorLanguageRoute): string {
  return language
}

function editorLanguagePath(language: EditorLanguageRoute): string {
  if (language === "javascript") return "panes/demo.js"
  if (language === "html") return "panes/demo.html"
  if (language === "css") return "panes/demo.css"
  if (language === "plaintext") return "panes/demo.txt"
  return "panes/demo.ts"
}

function editorSurfaceScenario(route: PanesRoute): string | null {
  if (route === "editor/editing") return "editing"
  if (route.startsWith("editor/highlighting")) return `highlighting:${editorLanguageFromRoute(route)}`
  if (route.startsWith("editor/selection")) return `selection:${route}`
  if (route.startsWith("editor/scroll")) return `scroll:${editorScrollModeFromRoute(route)}`
  return null
}

function terminalSurfaceScenario(route: PanesRoute): TerminalRoute | null {
  return route.startsWith("terminal/") ? route as TerminalRoute : null
}

function logViewerSurfaceScenario(route: PanesRoute): LogViewerRoute | null {
  return route.startsWith("log-viewer/") ? route as LogViewerRoute : null
}

function logViewerWrapRouteFromRoute(route: PanesRoute): LogViewerWrapRoute {
  return route === "log-viewer/wrap/no-wrap" ? "no-wrap" : "wrap"
}

function logViewerScrollDockRouteFromRoute(route: PanesRoute): LogViewerScrollRoute | "overview" {
  if (route === "log-viewer/scroll/vertical") return "vertical"
  if (route === "log-viewer/scroll/horizontal") return "horizontal"
  if (route === "log-viewer/scroll/no-vertical") return "no-vertical"
  if (route === "log-viewer/scroll/no-horizontal") return "no-horizontal"
  if (route === "log-viewer/scroll/both") return "both"
  if (route === "log-viewer/scroll/none") return "none"
  return "overview"
}

function logViewerScrollPropsFromRoute(route: PanesRoute): Pick<LogViewerProps, "scrollX" | "scrollY"> {
  if (route === "log-viewer/scroll") return {scrollX: true, scrollY: true}
  if (route === "log-viewer/scroll/vertical") return {scrollX: false, scrollY: true}
  if (route === "log-viewer/scroll/horizontal") return {scrollX: true, scrollY: false}
  if (route === "log-viewer/scroll/no-vertical") return {scrollX: true, scrollY: false}
  if (route === "log-viewer/scroll/no-horizontal") return {scrollX: false, scrollY: true}
  if (route === "log-viewer/scroll/both") return {scrollX: true, scrollY: true}
  if (route === "log-viewer/scroll/none") return {scrollX: false, scrollY: false}
  return {scrollX: false, scrollY: true}
}

function logViewerPropsFromRoute(route: PanesRoute): LogViewerProps {
  const scroll = route.startsWith("log-viewer/scroll") ? logViewerScrollPropsFromRoute(route) : {scrollX: false, scrollY: true}
  return {
    wrapLines: logViewerWrapRouteFromRoute(route) === "wrap",
    ...scroll,
  }
}

function logViewerScrollStatusLabel(route: PanesRoute): string {
  const detail = logViewerScrollDockRouteFromRoute(route)
  if (detail === "vertical") return "y scroll"
  if (detail === "horizontal") return "x scroll"
  if (detail === "no-vertical") return "no vertical"
  if (detail === "no-horizontal") return "no horizontal"
  if (detail === "none") return "no scroll"
  return "xy scroll"
}

function logViewerScrollDemoFromRoute(route: PanesRoute): string {
  const detail = logViewerScrollDockRouteFromRoute(route)
  if (detail === "horizontal") return LOG_VIEWER_SCROLL_WIDE_SHORT_DEMO
  if (detail === "no-horizontal" || detail === "both" || detail === "overview") return LOG_VIEWER_SCROLL_WIDE_TALL_DEMO
  return LOG_VIEWER_SCROLL_SHORT_DEMO
}

function notiSurfaceScenario(route: PanesRoute): NotiRoute | null {
  return route.startsWith("notistack/") ? route as NotiRoute : null
}

function applyEditorRoute(editor: EditorPane, route: PanesRoute): void {
  if (route === "editor/editing") {
    editor.setLanguage({languageId: "typescript", path: "panes/editable.ts"})
    editor.setTitle("Editable source")
    editor.setText(EDITOR_EDITING_SOURCE)
    setEditorCursorAt(editor, EDITOR_EDITING_SOURCE, "TerminalPane", "Terminal".length)
    return
  }
  if (route.startsWith("editor/selection")) {
    editor.setLanguage({languageId: "typescript", path: "panes/selection.ts"})
    editor.setTitle("Selection source")
    editor.setText(EDITOR_SELECTION_SOURCE)
    if (route === "editor/selection/shift-cursor") selectEditorFragment(editor, EDITOR_SELECTION_SOURCE, "extendSelection", "start")
    else if (route === "editor/selection/double-click") selectEditorFragment(editor, EDITOR_SELECTION_SOURCE, "double click")
    else selectEditorFragment(editor, EDITOR_SELECTION_SOURCE, "\"copy\" | \"cut\" | \"selectAll\"")
    return
  }
  if (route.startsWith("editor/scroll")) {
    const mode = editorScrollModeFromRoute(route)
    editor.setLanguage({languageId: "typescript", path: `panes/scroll-${mode}.ts`})
    editor.setTitle(mode === "horizontal" ? "Horizontal scroll" : "Vertical scroll")
    if (mode === "horizontal") {
      editor.setText(EDITOR_SCROLL_HORIZONTAL_SOURCE)
      setEditorCursorAtLineEnd(editor, EDITOR_SCROLL_HORIZONTAL_SOURCE, "const longTrace")
      return
    }
    editor.setText(EDITOR_SCROLL_VERTICAL_SOURCE)
    editor.setCursor(34, 2)
    return
  }
  const language = editorLanguageFromRoute(route)
  editor.setLanguage({languageId: editorLanguageId(language), path: editorLanguagePath(language)})
  editor.setTitle(`${EDITOR_LANGUAGE_LABELS[language]} source`)
  editor.setText(editorDemoSource(language))
}

function applyTerminalRoute(terminal: TerminalPane, route: PanesRoute): void {
  terminal.reset()
  terminal.setTitle("TerminalPane")
  if (route === "terminal/ansi") {
    terminal.setStatus("connected", "ansi")
    terminal.write(TERMINAL_ANSI_DEMO)
    return
  }
  if (route === "terminal/scroll") {
    terminal.setStatus("running", "scrollback")
    terminal.write(TERMINAL_SCROLL_DEMO)
    return
  }
  if (route === "terminal/input") {
    terminal.setStatus("connected", "input")
    terminal.write(TERMINAL_INPUT_DEMO)
    return
  }
  terminal.setStatus("connected", "demo")
  terminal.write(TERMINAL_BASIC_DEMO)
}

function applyLogViewerRoute(logViewer: LogViewerPane, route: PanesRoute): void {
  const props = logViewerPropsFromRoute(route)
  const scrollDetail = logViewerScrollDockRouteFromRoute(route)
  const needsWideLog = scrollDetail === "horizontal" || scrollDetail === "no-horizontal" || scrollDetail === "both" || scrollDetail === "overview"
  logViewer.setTitle("LogViewerPane")
  logViewer.setWrapLines(props.wrapLines)
  logViewer.setScrollX(props.scrollX)
  logViewer.setScrollY(props.scrollY)
  logViewer.setTerminalSize(needsWideLog ? 180 : 80, 24)
  logViewer.reset()
  if (route.startsWith("log-viewer/wrap")) {
    logViewer.setStatus("connected", props.wrapLines ? "wrap" : "clip")
    logViewer.write(props.wrapLines ? LOG_VIEWER_WRAP_DEMO : LOG_VIEWER_NOWRAP_DEMO)
    return
  }
  if (route === "log-viewer/levels") {
    logViewer.setStatus("running", "levels")
    logViewer.write(LOG_VIEWER_LEVELS_DEMO)
    return
  }
  if (route.startsWith("log-viewer/scroll")) {
    logViewer.setStatus("running", logViewerScrollStatusLabel(route))
    logViewer.write(logViewerScrollDemoFromRoute(route))
    return
  }
  logViewer.setStatus("connected", "output")
  logViewer.write(LOG_VIEWER_BASIC_DEMO)
}

function setEditorCursorAt(editor: EditorPane, source: string, fragment: string, offset = 0): void {
  const pos = editorPositionForFragment(source, fragment)
  if (pos === null) {
    editor.setCursor(0, 0)
    return
  }
  editor.setCursor(pos.line, pos.col + offset)
}

function selectEditorFragment(editor: EditorPane, source: string, fragment: string, focus: "start" | "end" = "end"): void {
  const pos = editorPositionForFragment(source, fragment)
  if (pos === null) {
    editor.setSelection(0, 0, 0, 0)
    return
  }
  if (focus === "start") {
    editor.setSelection(pos.line, pos.col + fragment.length, pos.line, pos.col)
    return
  }
  editor.setSelection(pos.line, pos.col, pos.line, pos.col + fragment.length)
}

function setEditorCursorAtLineEnd(editor: EditorPane, source: string, prefix: string): void {
  const lines = source.split("\n")
  const line = lines.findIndex((item) => item.startsWith(prefix))
  if (line < 0) {
    editor.setCursor(0, 0)
    return
  }
  editor.setCursor(line, lines[line]?.length ?? 0)
}

function editorPositionForFragment(source: string, fragment: string): {line: number; col: number} | null {
  const index = source.indexOf(fragment)
  if (index < 0) return null
  const prefixLines = source.slice(0, index).split("\n")
  return {
    line: prefixLines.length - 1,
    col: prefixLines[prefixLines.length - 1]?.length ?? 0,
  }
}

function editorDemoSource(language: EditorLanguageRoute): string {
  return EDITOR_DEMO_SOURCES[language]
}

function terminalInputLabel(data: string): string {
  return data
    .replaceAll("\x1b", "<ESC>")
    .replaceAll("\r", "<CR>")
    .replaceAll("\n", "<LF>")
    .replaceAll("\t", "<TAB>")
}

const TERMINAL_BASIC_DEMO = [
  "\x1b[36mMetaFor TerminalPane\x1b[0m",
  "",
  "Transport-independent API:",
  "  write(data)             -> append output",
  "  onInput(data, source)   -> keyboard bytes",
  "  onResize({cols, rows})  -> terminal geometry",
  "",
  "$ bun --filter @ui/panes typecheck",
  "\x1b[32mExited with code 0\x1b[0m",
  "$ ",
].join("\r\n")

const TERMINAL_ANSI_DEMO = [
  "\x1b[1mANSI color table\x1b[0m",
  "",
  Array.from({length: 8}, (_, i) => `\x1b[3${i}m fg${i} \x1b[0m`).join(" "),
  Array.from({length: 8}, (_, i) => `\x1b[9${i}m bright${i} \x1b[0m`).join(" "),
  "",
  Array.from({length: 8}, (_, i) => `\x1b[4${i};97m bg${i} \x1b[0m`).join(" "),
  "",
  "\x1b[38;2;111;211;255mtruecolor cyan\x1b[0m  \x1b[38;5;214m256-color orange\x1b[0m",
  "\x1b[7minverse video\x1b[0m  normal text",
  "",
  "$ ",
].join("\r\n")

const TERMINAL_SCROLL_DEMO = Array.from({length: 72}, (_, i) => {
  const n = String(i + 1).padStart(2, "0")
  const color = i % 4 === 0 ? "\x1b[36m" : i % 4 === 1 ? "\x1b[32m" : i % 4 === 2 ? "\x1b[33m" : "\x1b[35m"
  return `${color}${n}\x1b[0m scrollback line ${n}: output history stays inside TerminalPane`
}).join("\r\n") + "\r\n$ "

const TERMINAL_INPUT_DEMO = [
  "\x1b[36mInput route\x1b[0m",
  "Click the terminal and type. Enter submits the local playground prompt.",
  "Ctrl+C leaves through onInput(); drag selection and Cmd+C copy terminal text.",
  "",
  "$ ",
].join("\r\n")

const LOG_VIEWER_BASIC_DEMO = [
  "\x1b[36mMetaFor LogViewerPane\x1b[0m",
  "",
  "Output-only API:",
  "  write(data)    -> append log output",
  "  writeln(line)  -> append one log line",
  "  clear()        -> reset visible output",
  "",
  "\x1b[32m[ok]\x1b[0m bun --filter @ui/panes typecheck",
  "\x1b[90m[info]\x1b[0m LogViewerPane has no input adapter or cursor.",
].join("\r\n")

const LOG_VIEWER_LEVELS_DEMO = [
  "\x1b[90m[debug]\x1b[0m loaded ui theme palette",
  "\x1b[36m[info]\x1b[0m  compiling panes playground",
  "\x1b[33m[warn]\x1b[0m  optional source map skipped",
  "\x1b[32m[ok]\x1b[0m    emitted webgpu bundle",
  "\x1b[31m[error]\x1b[0m simulated failure row for color contrast",
].join("\r\n")

const LOG_VIEWER_WRAP_DEMO = [
  "\x1b[36mMetaFor LogViewerPane: wrapLines=true\x1b[0m",
  "",
  "Long log records wrap into the visible pane width, so every part of the entry remains readable without horizontal scrolling.",
  "\x1b[90m[trace]\x1b[0m request=6f8a9b3c component=interpreter duration=243ms payload=\"this long structured log line wraps through the pane instead of being clipped\"",
  "\x1b[32m[ok]\x1b[0m renderer kept vertical scrollback as the primary log navigation",
].join("\r\n")

const LOG_VIEWER_NOWRAP_DEMO = [
  "\x1b[36mMetaFor LogViewerPane: wrapLines=false\x1b[0m",
  "",
  "Long log records are clipped by the pane width. There is no horizontal scroll state to manage.",
  "\x1b[90m[trace]\x1b[0m request=6f8a9b3c component=interpreter duration=243ms payload=\"this very long structured log line stays on one row and clips at the right edge\"",
  "\x1b[32m[ok]\x1b[0m renderer kept vertical scrollback only",
].join("\r\n")

const LOG_VIEWER_SCROLL_SHORT_DEMO = Array.from({length: 96}, (_, i) => {
  const n = String(i + 1).padStart(3, "0")
  const level = i % 5 === 0 ? "\x1b[33mwarn\x1b[0m" : i % 7 === 0 ? "\x1b[31merror\x1b[0m" : "\x1b[36minfo\x1b[0m"
  return `${n} ${level} worker:${(i % 4) + 1} streamed log line ${n}`
}).join("\r\n")

const LOG_VIEWER_SCROLL_WIDE_SHORT_DEMO = logViewerWideScrollDemo(18)
const LOG_VIEWER_SCROLL_WIDE_TALL_DEMO = logViewerWideScrollDemo(96)

function logViewerWideScrollDemo(lines: number): string {
  return Array.from({length: lines}, (_, i) => {
    const n = String(i + 1).padStart(3, "0")
    const level = i % 5 === 0 ? "\x1b[33mwarn\x1b[0m" : i % 7 === 0 ? "\x1b[31merror\x1b[0m" : "\x1b[36minfo\x1b[0m"
    return `${n} ${level} worker:${(i % 4) + 1} streamed log line ${n} request=6f8a9b3c component=interpreter payload=\"wide log content extends past the pane edge\"`
  }).join("\r\n")
}

const EDITOR_EDITING_SOURCE = `import {EditorPane, TerminalPane, NotiStack} from "@ui/panes"

const terminal = new TerminalPane({
  title: "Agent shell",
  onInput: (data) => adapter.write(data),
  onResize: (size) => adapter.resize(size),
})

terminal.write("$ bun run dev\\r\\n")
`

const EDITOR_SELECTION_SOURCE = `type SelectionAction = "copy" | "cut" | "selectAll"

export function editorSelection(action: SelectionAction, extendSelection: boolean) {
  if (extendSelection) return "shift cursor"
  return action
}

export const gesture = "double click"
`

const EDITOR_SCROLL_VERTICAL_SOURCE = Array.from({length: 48}, (_, i) => {
  const line = String(i + 1).padStart(2, "0")
  return `export const verticalStep${line} = "scroll keeps line ${line} reachable inside EditorPane"`
}).join("\n")

const EDITOR_SCROLL_HORIZONTAL_SOURCE = `type ScrollAxis = "vertical" | "horizontal"

const longTrace = "horizontal scroll keeps a very long diagnostics line readable while the caret stays inside the EditorPane surface and the dock remains usable for mode switching"

export function scrollAxis(shiftKey: boolean): ScrollAxis {
  return shiftKey ? "horizontal" : "vertical"
}
`

const EDITOR_DEMO_SOURCES: Record<EditorLanguageRoute, string> = {
  typescript: `import {EditorPane} from "@ui/panes"

const editor = new EditorPane({
  title: "Demo source",
  path: "panes/demo.ts",
  fontPx: 12,
  linePx: 17,
})

editor.setText("export const pane = \\"EditorPane\\"")
`,
  javascript: `import {TerminalPane} from "@ui/panes"

const term = new TerminalPane({title: "Local shell"})
term.write("$ cd pkg/interpreter\\r\\n")
`,
  html: `<!doctype html>
<section class="pane-preview">
  <h1>EditorPane</h1>
  <script type="module" src="./entry.js"></script>
</section>
`,
  css: `.pane-preview {
  display: grid;
  gap: 12px;
  color: #f7fbff;
  padding: 18px;
}
`,
  plaintext: `EditorPane

Plain text route keeps tokenization optional.
Use it for logs, notes, and raw source snapshots.
`,
}

const notiTheme: NotiStackTheme = {
  panel: new Color(6 / 255, 12 / 255, 21 / 255, 0.96),
  accent: new Color(111 / 255, 211 / 255, 255 / 255, 0.72),
  accentBorder: new Color(166 / 255, 232 / 255, 255 / 255, 0.92),
  surfaceBorder: new Color(111 / 255, 211 / 255, 255 / 255, 0.46),
  surfaceTint: new Color(166 / 255, 232 / 255, 255 / 255, 1),
  matTitle: new TextMaterial({color: palette.cyan}),
  matBody: new TextMaterial({color: new Color("#f4f7fb")}),
  matFooter: new TextMaterial({color: palette.muted}),
  matPrimaryLabel: new TextMaterial({color: new Color("#07111c")}),
  matSecondaryLabel: new TextMaterial({color: palette.cyan}),
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiRuntime.create(canvas)
let activeRoute: PanesRoute = "terminal/basic"
let screen: PanesScreen | null = null
const editor = new EditorPane({
  title: "Panes source",
  path: "panes/demo.ts",
  fontPx: 12,
  linePx: 17,
})
let terminalPrompt = ""
const terminal = new TerminalPane({
  title: "TerminalPane",
  status: "demo",
  statusKind: "connected",
  fontPx: 12,
  linePx: 17,
  onInput: (data) => handleTerminalInput(data),
  onResize: ({cols, rows}) => terminal.setStatus("connected", `${cols}x${rows}`),
})
const logViewer = new LogViewerPane({
  title: "LogViewerPane",
  status: "output",
  statusKind: "connected",
  fontPx: 12,
  linePx: 17,
})
const stack = new NotiStack(ui, {
  theme: notiTheme,
  layout: {
    bounds: ({w, h}) => notiStackBoundsForCanvas(w, h),
    sidePad: {min: 24, pct: 0.03},
    bottomGap: {min: 22, pct: 0.04},
    minWidth: 320,
    maxWidth: 420,
    minHeight: 104,
    surfaceOpacity: 0.88,
    surfaceTintOpacity: 0.08,
    position: "top-right",
    bodyFontPx: 15,
    titleFontPx: 15,
    footerFontPx: 12,
    btnFontPx: 12,
    btnH: 34,
  },
})
let appliedEditorScenario: string | null = null
let appliedTerminalScenario: TerminalRoute | null = null
let appliedLogViewerScenario: LogViewerRoute | null = null
let appliedNotiScenario: NotiRoute | null = null

const syncEditorRoute = (route: PanesRoute): void => {
  const scenario = editorSurfaceScenario(route)
  if (scenario === null || scenario === appliedEditorScenario) return
  applyEditorRoute(editor, route)
  appliedEditorScenario = scenario
}

const syncTerminalRoute = (route: PanesRoute): void => {
  const scenario = terminalSurfaceScenario(route)
  if (scenario === null || scenario === appliedTerminalScenario) return
  terminalPrompt = ""
  applyTerminalRoute(terminal, route)
  appliedTerminalScenario = scenario
}

const syncLogViewerRoute = (route: PanesRoute): void => {
  const scenario = logViewerSurfaceScenario(route)
  if (scenario === null || scenario === appliedLogViewerScenario) return
  applyLogViewerRoute(logViewer, route)
  appliedLogViewerScenario = scenario
}

const syncNotiRoute = (route: PanesRoute): void => {
  const scenario = notiSurfaceScenario(route)
  if (scenario === null) {
    if (appliedNotiScenario !== null) {
      stack.clear()
      appliedNotiScenario = null
    }
    return
  }
  if (scenario === appliedNotiScenario) return
  stack.clear()
  appliedNotiScenario = scenario
}

const syncEditorFocus = (route: PanesRoute): void => {
  if (!route.startsWith("editor/")) return
  ui.setFocused(editor)
  ui.inputProxy?.focus()
}

const syncTerminalFocus = (route: PanesRoute): void => {
  if (!route.startsWith("terminal/")) return
  terminal.focus()
}

async function runEditorAction(action: EditorAction): Promise<void> {
  if (action === "focus") {
    syncEditorFocus(activeRoute)
    return
  }
  if (action === "selectAll") {
    editor.selectAll()
    syncEditorFocus(activeRoute)
    return
  }
  const ok = action === "copy" ? await editor.copySelectionToClipboard() : await editor.cutSelectionToClipboard()
  screen?.setEditorSelectionClipboardResult(ok)
}

function runTerminalAction(action: TerminalAction): void {
  if (action === "clear") {
    terminalPrompt = ""
    terminal.clear()
    terminal.write("$ ")
    terminal.focus()
    return
  }
  if (action === "focus") {
    terminal.focus()
    return
  }
  if (action === "ansi") {
    terminalPrompt = ""
    terminal.reset()
    terminal.write(TERMINAL_ANSI_DEMO)
    terminal.focus()
    return
  }
  if (action === "scroll") {
    terminal.write("\r\n")
    const start = terminal.toText().split("\n").length + 1
    for (let i = 0; i < 18; i++) terminal.writeln(`\x1b[36m${String(start + i).padStart(3, "0")}\x1b[0m appended terminal output`)
    terminal.write("$ ")
    terminal.focus()
    return
  }
  terminalPrompt = ""
  terminal.reset()
  terminal.write(TERMINAL_BASIC_DEMO)
  terminal.focus()
}

function runLogViewerAction(action: LogViewerAction): void {
  if (action === "clear") {
    logViewer.clear()
    return
  }
  if (action === "levels") {
    logViewer.writeln(`\x1b[90m[debug]\x1b[0m ${new Date().toLocaleTimeString()} cache probe completed`)
    logViewer.writeln(`\x1b[36m[info]\x1b[0m  renderer accepted ${logViewer.getTerminalSize().cols} columns`)
    logViewer.writeln(`\x1b[32m[ok]\x1b[0m    pane output appended`)
    return
  }
  if (action === "scroll") {
    const start = logViewer.toText().split("\n").filter((line) => line.length > 0).length + 1
    for (let i = 0; i < 18; i++) {
      const n = String(start + i).padStart(3, "0")
      logViewer.writeln(`${n} \x1b[36minfo\x1b[0m streamed background job event ${n}`)
    }
    return
  }
  if (!logViewerPropsFromRoute(activeRoute).wrapLines) {
    logViewer.writeln(`\x1b[36m[info]\x1b[0m ${new Date().toLocaleTimeString()} very long one-line log payload is clipped by LogViewerPane because wrapLines is false and horizontal scroll is disabled`)
    return
  }
  logViewer.writeln(`\x1b[36m[info]\x1b[0m ${new Date().toLocaleTimeString()} appended output-only log entry`)
}

function handleTerminalInput(data: string): void {
  if (data === "\r") {
    terminal.write("\r\n")
    if (terminalPrompt.trim().length > 0) terminal.writeln(`\x1b[90mplayground adapter received:\x1b[0m ${terminalPrompt}`)
    terminalPrompt = ""
    terminal.write("$ ")
    return
  }
  if (data === "\x7f") {
    if (terminalPrompt.length === 0) return
    terminalPrompt = terminalPrompt.slice(0, -1)
    terminal.write("\b \b")
    return
  }
  if (data === "\x03") {
    terminalPrompt = ""
    terminal.write("^C\r\n$ ")
    return
  }
  if (data.startsWith("\x1b")) {
    terminal.write(`\r\n\x1b[90mkey:\x1b[0m ${terminalInputLabel(data)}\r\n$ ${terminalPrompt}`)
    return
  }
  terminalPrompt += data
  terminal.write(data)
}

function pushNotification(action: NotiActionName): void {
  if (action === "clear") {
    stack.clear()
    return
  }
  if (action === "stacked") {
    stack.clear()
    stack.push({
      id: "panes-stack-build",
      title: "Build finished",
      body: "Typecheck completed for @ui/panes.",
      footer: "workspace ui/panes",
    })
    stack.push({
      id: "panes-stack-terminal",
      title: "Terminal ready",
      body: "Universal onInput/onResize adapter is attached.",
      footer: "TerminalPane",
    })
    stack.push({
      id: "panes-stack-editor",
      title: "Editor mounted",
      body: "EditorPane is active in the playground preview.",
      footer: "EditorPane",
    })
    return
  }
  if (action === "action") {
    stack.push({
      id: "panes-action-toast",
      title: "Interpreter request",
      body: "Attach this notification to any app-level callback.",
      footer: "NotiStack action toast",
      primary: {label: "Run", action: () => pushNotification("basic")},
      secondary: {label: "Dismiss", action: () => stack.dismiss("panes-action-toast")},
    })
    return
  }
  stack.push({
    id: "panes-basic-toast",
    title: "Panes playground",
    body: "EditorPane, TerminalPane, and NotiStack are available from @ui/panes.",
    footer: "Reusable UI surfaces",
  })
}

screen = new PanesScreen({
  onRouteChange: (route) => {
    activeRoute = route
    syncEditorRoute(route)
    syncTerminalRoute(route)
    syncLogViewerRoute(route)
    syncNotiRoute(route)
    editor.setSelectionMenuOpen(route === "editor/selection/menu")
    editor.setSelectionContextMenuEnabled(route === "editor/selection/right-click")
    ui.relayout()
    syncEditorFocus(route)
    syncTerminalFocus(route)
  },
  onEditorAction: (action) => {
    void runEditorAction(action)
  },
  onTerminalAction: runTerminalAction,
  onLogViewerAction: runLogViewerAction,
  onNotiAction: pushNotification,
})
activeRoute = screen.currentRoute
ui.addSurface(screen, ({w, h}) => ({x: 0, y: 0, w, h}))
ui.addSurface(editor, ({w, h}) => activeRoute.startsWith("editor/") ? editorPaneRectForCanvas(w, h) : hiddenRect())
ui.addSurface(terminal, ({w, h}) => activeRoute.startsWith("terminal/") ? terminalPaneRectForCanvas(w, h) : hiddenRect())
ui.addSurface(logViewer, ({w, h}) => activeRoute.startsWith("log-viewer/") ? terminalPaneRectForCanvas(w, h) : hiddenRect())
ui.handleResize()
syncEditorRoute(activeRoute)
syncTerminalRoute(activeRoute)
syncLogViewerRoute(activeRoute)
syncNotiRoute(activeRoute)
editor.setSelectionMenuOpen(activeRoute === "editor/selection/menu")
editor.setSelectionContextMenuEnabled(activeRoute === "editor/selection/right-click")
syncEditorFocus(activeRoute)
syncTerminalFocus(activeRoute)
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
