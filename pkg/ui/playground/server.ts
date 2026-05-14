/**
 * Bun fullstack dev-server для @metafor/ui playground.
 *
 * Bun.serve по docs.bun.com/docs/bundler/fullstack: импорт HTML →
 * автоматический bundle JS/CSS, hot-reload через development:{hmr:true},
 * routes-API для всех путей.
 *
 * Запуск:
 *   bun run pkg/ui/playground/server.ts
 *   open http://127.0.0.1:7900
 */

import {existsSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import index from "./index.html"

const PORT = Number(process.env["UI_PLAYGROUND_PORT"] ?? 7900)
const PLAYGROUND_DIR = import.meta.dir
const FONT_PATH = join(PLAYGROUND_DIR, "JetBrainsMono-Bold.ttf")
const YOGA_WASM = findYogaWasm() // не используется, но оставим reachable если debug-package полагается

const wsClients = new Set<import("bun").ServerWebSocket<unknown>>()
function broadcastReload(): void {
  for (const ws of wsClients) {
    try {
      ws.send(JSON.stringify({type: "reload"}))
    } catch {}
  }
}

function findYogaWasm(): string | null {
  let dir = import.meta.dir
  for (let i = 0; i < 8; i++) {
    const cand = join(dir, "node_modules/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js")
    if (existsSync(cand)) return cand
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  // development: true тянет HMR-runtime который падает на странице с
  // WebGPU-canvas ("Failed to construct 'URL'"). Object-форма {hmr:false}
  // в Bun 1.3.13 не поддерживается. Поэтому false + reload-роут ниже.
  development: false,
  routes: {
    // Главная — index.html. Bun bundler сам подтянет entry.ts + style.css
    // и заменит script src/href hash'ами.
    "/": index,
    // Каждый demo-роут возвращает тот же index.html — entry.ts сам
    // прочитает window.location.pathname и подберёт demo-модуль.
    "/card": index,
    "/padding": index,
    "/flex": index,
    "/flex-css": index,
    "/grid": index,
    "/text-block": index,
    "/image": index,
    "/button": index,
    "/rounded-button": index,
    "/circle-button": index,
    "/badge": index,
    "/input": index,
    "/divider": index,
    "/scrollbar": index,
    "/scroll-list": index,
    "/theme": index,
    // Шрифт нужен для UiCanvas.
    "/JetBrainsMono-Bold.ttf": () =>
      new Response(Bun.file(FONT_PATH), {
        headers: {"content-type": "font/ttf", "cache-control": "public, max-age=86400"},
      }),
    // POST /reload — sidecar-сигнал клиенту перезагрузиться (cache-bust
    // через query-bump). Аналог /reload в pkg/debug.
    "/reload": {
      POST(): Response {
        broadcastReload()
        return Response.json({ok: true})
      },
    },
    "/ws": (req, server): Response | undefined => {
      const upgraded = server.upgrade(req)
      if (upgraded) return undefined
      return new Response("expected websocket upgrade", {status: 426})
    },
  },
  websocket: {
    open(ws): void {
      wsClients.add(ws)
    },
    close(ws): void {
      wsClients.delete(ws)
    },
    message(): void {
      /* нет команд от клиента */
    },
  },
  fetch(req): Response {
    const url = new URL(req.url)
    return new Response(`not found: ${req.method} ${url.pathname}`, {status: 404})
  },
})

const url = `http://${server.hostname}:${server.port}`
console.log(`[@metafor/ui playground] ${url}`)
console.log(`  Layout:`)
console.log(`    /card             → Card`)
console.log(`    /padding          → Card.padding & drawTextCentered`)
console.log(`    /flex             → flexRow / flexColumn`)
console.log(`    /flex-css         → flexRowCss / flexColumnCss (px/%/fr/grow)`)
console.log(`    /grid             → Multi-card grid`)
console.log(`  Typography:`)
console.log(`    /text-block       → drawTextBlock`)
console.log(`  Media:`)
console.log(`    /image            → drawImage + setBackgroundImage`)
console.log(`  Components:`)
console.log(`    /button           → button widget`)
console.log(`    /rounded-button   → roundedButton widget`)
console.log(`    /circle-button    → circleButton widget`)
console.log(`    /badge            → badge widget`)
console.log(`    /input            → input widget`)
console.log(`    /divider          → divider widget`)
console.log(`    /scrollbar        → scrollbar widget`)
console.log(`    /scroll-list      → ScrollListState + scrollList + edgeFade`)
console.log(`  Reference:`)
console.log(`    /theme            → palette + tones + Z stack`)
void YOGA_WASM
void resolve
