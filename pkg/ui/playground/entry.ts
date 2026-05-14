/**
 * Playground entry. URL-роуты соответствуют demo-модулям в ./demos/*.ts.
 * Каждое demo экспортирует default async function ({canvas, params}) — там
 * создаются UiCanvas, регистрируются параметры и добавляются cards.
 */

import {UiCanvas} from "@metafor/ui"
import {ParamsPanel} from "./params.ts"
import cardDemo from "./demos/card.ts"
import flexDemo from "./demos/flex.ts"
import flexCssDemo from "./demos/flex-css.ts"
import buttonDemo from "./demos/button.ts"
import roundedButtonDemo from "./demos/rounded-button.ts"
import circleButtonDemo from "./demos/circle-button.ts"
import badgeDemo from "./demos/badge.ts"
import inputDemo from "./demos/input.ts"
import dividerDemo from "./demos/divider.ts"
import scrollDemo from "./demos/scroll.ts"
import scrollbarDemo from "./demos/scrollbar.ts"
import notiStackDemo from "./demos/noti-stack.ts"
import gridDemo from "./demos/grid.ts"
import paddingDemo from "./demos/padding.ts"
import textBlockDemo from "./demos/text-block.ts"
import imageDemo from "./demos/image.ts"
import themeDemo from "./demos/theme.ts"

export type DemoCtx = {canvas: UiCanvas; params: ParamsPanel}
type DemoFn = (ctx: DemoCtx) => void | Promise<void>

type NavEntry = {slug: string; label: string; demo: DemoFn}
type NavGroup = {title: string; entries: NavEntry[]}

const nav: NavGroup[] = [
  {
    title: "Layout",
    entries: [
      {slug: "card", label: "Card", demo: cardDemo},
      {slug: "padding", label: "Padding", demo: paddingDemo},
      {slug: "flex", label: "Flex", demo: flexDemo},
      {slug: "flex-css", label: "Flex CSS", demo: flexCssDemo},
      {slug: "grid", label: "Multi-Card Grid", demo: gridDemo},
    ],
  },
  {
    title: "Typography",
    entries: [{slug: "text-block", label: "Text Block", demo: textBlockDemo}],
  },
  {
    title: "Media",
    entries: [{slug: "image", label: "Image", demo: imageDemo}],
  },
  {
    title: "Components",
    entries: [
      {slug: "button", label: "Button", demo: buttonDemo},
      {slug: "rounded-button", label: "Rounded Button", demo: roundedButtonDemo},
      {slug: "circle-button", label: "Circle Button", demo: circleButtonDemo},
      {slug: "badge", label: "Badge", demo: badgeDemo},
      {slug: "input", label: "Input", demo: inputDemo},
      {slug: "divider", label: "Divider", demo: dividerDemo},
      {slug: "scrollbar", label: "Scrollbar", demo: scrollbarDemo},
      {slug: "scroll-list", label: "Scroll List", demo: scrollDemo},
      {slug: "noti-stack", label: "Noti Stack", demo: notiStackDemo},
    ],
  },
  {
    title: "Reference",
    entries: [{slug: "theme", label: "Theme & Palette", demo: themeDemo}],
  },
]

const demos = new Map<string, DemoFn>()
for (const g of nav) for (const e of g.entries) demos.set(e.slug, e.demo)

const stageCanvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
const navEl = document.getElementById("nav")
const titleEl = document.getElementById("doc-title")
const ledeEl = document.getElementById("doc-lede")
const breadcrumbEl = document.getElementById("doc-breadcrumb")
const propsBody = document.getElementById("props-body")
const tocEl = document.getElementById("toc-list")

if (
  stageCanvas === null ||
  navEl === null ||
  titleEl === null ||
  ledeEl === null ||
  breadcrumbEl === null ||
  propsBody === null ||
  tocEl === null
) {
  throw new Error("playground DOM не готов")
}

for (const group of nav) {
  const groupEl = document.createElement("div")
  groupEl.className = "nav-group"
  const titleNode = document.createElement("p")
  titleNode.className = "nav-group-title"
  titleNode.textContent = group.title
  groupEl.append(titleNode)
  for (const entry of group.entries) {
    const a = document.createElement("a")
    a.href = `/${entry.slug}`
    a.dataset["demo"] = entry.slug
    a.textContent = entry.label
    a.addEventListener("click", (event) => {
      event.preventDefault()
      history.pushState({demo: entry.slug}, "", `/${entry.slug}`)
      void selectDemo(entry.slug)
    })
    groupEl.append(a)
  }
  navEl.append(groupEl)
}

const paramsPanel = new ParamsPanel({
  body: propsBody,
  titleEl,
  ledeEl,
  breadcrumbEl,
  tocEl,
})

let activeUi: UiCanvas | null = null
let activeCleanup: (() => void) | null = null

async function selectDemo(name: string): Promise<void> {
  const demo = demos.get(name)
  if (demo === undefined) {
    paramsPanel.reset({title: `Unknown route: /${name}`, description: "Выберите компонент в левой панели."})
    return
  }

  if (activeUi !== null) {
    activeCleanup?.()
    activeCleanup = null
    activeUi.dispose()
    activeUi = null
  }
  paramsPanel.reset({title: "", description: ""})

  activeUi = await UiCanvas.create(stageCanvas!)
  await demo({canvas: activeUi, params: paramsPanel})

  const ro = new ResizeObserver(() => activeUi?.handleResize())
  const resizeHandler = (): void => activeUi?.handleResize()
  ro.observe(stageCanvas!)
  requestAnimationFrame(() => activeUi?.handleResize())
  setTimeout(() => activeUi?.handleResize(), 100)
  window.addEventListener("resize", resizeHandler)
  activeCleanup = () => {
    ro.disconnect()
    window.removeEventListener("resize", resizeHandler)
  }

  for (const link of navEl!.querySelectorAll<HTMLAnchorElement>("a[data-demo]")) {
    link.classList.toggle("active", link.dataset["demo"] === name)
  }
}

function routeName(): string {
  const path = window.location.pathname.replace(/^\//, "")
  return path === "" ? "card" : path
}

window.addEventListener("popstate", () => void selectDemo(routeName()))

function attachReloadSocket(): void {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
  const ws = new WebSocket(url)
  ws.addEventListener("message", (e) => {
    try {
      const msg = JSON.parse(typeof e.data === "string" ? e.data : "") as {type?: string}
      if (msg.type === "reload") {
        const next = new URL(window.location.href)
        next.searchParams.set("_r", String(Date.now()))
        window.location.replace(next.toString())
      }
    } catch {}
  })
  ws.addEventListener("close", () => setTimeout(attachReloadSocket, 1500))
}
attachReloadSocket()

void selectDemo(routeName())
