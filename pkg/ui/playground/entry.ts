/**
 * Playground entry. URL-роуты соответствуют demo-модулям в ./demos/*.ts.
 * Каждый demo экспортирует default async function ({canvas}) которая
 * создаёт UiCanvas и регистрирует карточки.
 */

import {UiCanvas} from "@metafor/ui"
import cardDemo from "./demos/card.ts"
import flexDemo from "./demos/flex.ts"
import widgetsDemo from "./demos/widgets.ts"
import scrollDemo from "./demos/scroll.ts"
import gridDemo from "./demos/grid.ts"

type DemoFn = (ctx: {canvas: UiCanvas}) => void | Promise<void>

const demos: Record<string, DemoFn> = {
  card: cardDemo,
  flex: flexDemo,
  widgets: widgetsDemo,
  scroll: scrollDemo,
  grid: gridDemo,
}

const stageCanvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
const labelEl = document.getElementById("demo-label")
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("nav.demos a"))

if (stageCanvas === null || labelEl === null) {
  throw new Error("playground DOM не готов")
}

let activeUi: UiCanvas | null = null
let activeCleanup: (() => void) | null = null

async function selectDemo(name: string): Promise<void> {
  const demo = demos[name]
  if (demo === undefined) {
    labelEl!.textContent = `unknown demo: ${name}`
    return
  }
  labelEl!.textContent = name

  // Чистим прошлый canvas-state.
  if (activeUi !== null) {
    activeCleanup?.()
    activeCleanup = null
    activeUi.dispose()
    activeUi = null
  }

  activeUi = await UiCanvas.create(stageCanvas!)
  await demo({canvas: activeUi})

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

  for (const link of navLinks) {
    link.classList.toggle("active", link.dataset.demo === name)
  }
}

function routeName(): string {
  const path = window.location.pathname.replace(/^\//, "")
  return path === "" ? "card" : path
}

for (const link of navLinks) {
  link.addEventListener("click", (event) => {
    event.preventDefault()
    const name = link.dataset.demo
    if (name === undefined) return
    history.pushState({demo: name}, "", `/${name}`)
    void selectDemo(name)
  })
}

window.addEventListener("popstate", () => void selectDemo(routeName()))

// Sidecar reload: ws://host/ws → server бросает {type:"reload"}, мы перезагружаем
// страницу с cache-bust (без HMR, чтобы не ломать WebGPU canvas).
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
