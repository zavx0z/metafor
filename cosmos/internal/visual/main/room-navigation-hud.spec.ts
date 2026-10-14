import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLButtonElement, KeyboardEvent, type DOMComponentConstructor} from "@zavx0z/immersive"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {RoomContextMenuProps, RoomInfoWindowProps, RoomNavigationHUDProps} from "./room-navigation-hud"

test("room HUD follows display/room/chat, public context menu closes before commands and info stays read-only in one Document", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-room-navigation-"))
  const document = createDocument(), host = document.createElement("div"), menuHost = document.createElement("div"), infoHost = document.createElement("div")
  const body = document.createElement("div")
  document.append(body)
  body.append(host, menuHost, infoHost)
  const root = createDomRoot(host), menuRoot = createDomRoot(menuHost), infoRoot = createDomRoot(infoHost)
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const built = await Bun.build({entrypoints: [join(import.meta.dir, "room-navigation-hud.tsx")], outdir: directory, target: "bun",
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
      plugins: [createJsxBunPlugin({cwd: resolve(import.meta.dir, ".."), sourceRoots: [import.meta.dir], styleSourceRootIds: ["@internal/visual"]})]})
    if (!built.success) throw new AggregateError(built.logs, "Room navigation did not compile")
    const module = await import(pathToFileURL(join(directory, "room-navigation-hud.js")).href)
    const HUD = module.RoomNavigationHUD as DOMComponentConstructor<RoomNavigationHUDProps>
    const Context = module.RoomContextMenu as DOMComponentConstructor<RoomContextMenuProps>
    const Info = module.RoomInfoWindow as DOMComponentConstructor<RoomInfoWindowProps>
    const commands: string[] = []
    const agents = [{key: "actor-a", name: "Ада"}, {key: "actor-b", name: "Глеб"}]
    let props: RoomNavigationHUDProps = {view: "overview", canGoBack: false, roomLabel: "Лаборатория", agents, chatOpen: false,
      onBack() {commands.push("back"); props = {...props, chatOpen: false, view: "room"}; render()},
      onEnter() {commands.push("enter"); props = {...props, view: "room"}; render()},
      onAgent(key) {commands.push(key); props = {...props, chatOpen: true, selectedAgentKey: key}; render()},
      onInfo() {commands.push("info")}, onDisplay() {commands.push("display")}}
    const render = () => root.render(HUD, props)
    const settle = async () => {for (let count = 0; count < 5; count++) {root.flush(); menuRoot.flush(); infoRoot.flush(); await Bun.sleep(0)}}
    const button = (scope: typeof host, label: string) => {
      const value = [...scope.querySelectorAll("button")].find(node => node.textContent === label || node.getAttribute("aria-label") === label)
      if (!(value instanceof HTMLButtonElement)) throw new Error(`Ready UI button absent: ${label}`)
      return value
    }
    render()
    await settle()
    expect(host.textContent).toContain("Общий план")
    expect([...host.querySelectorAll("button")].some(value => value.textContent === "Назад")).toBe(false)
    expect(host.textContent).not.toContain("Ада")
    props = {...props, view: "display", canGoBack: true}
    render()
    await settle()
    expect(host.textContent).toContain("Главный дисплей · Лаборатория")
    button(host, "Войти в комнату").click()
    await settle()
    expect(host.textContent).toContain("Комната · Лаборатория")
    expect(host.textContent).toContain("Глеб")
    button(host, "Ада").click()
    await settle()
    expect(host.textContent).toContain("Чат · Ада · Лаборатория")
    expect(host.textContent).not.toContain("Глеб")
    button(host, "Назад").click()
    await settle()
    expect(host.textContent).toContain("Участники комнаты")
    button(host, "Информация").click()
    expect(commands).toEqual(["enter", "actor-a", "back", "info"])
    let menuOpen = true
    const context: RoomContextMenuProps = {open: true, x: 40, y: 50, roomLabel: "Лаборатория", canGoBack: false,
      onClose() {commands.push("close-menu"); menuOpen = false; renderMenu()},
      onDisplay() {commands.push("menu-display")}, onEnter() {commands.push("menu-enter")}, onInfo() {commands.push("menu-info")}, onBack() {commands.push("menu-back")}}
    const renderMenu = () => menuRoot.render(Context, {...context, open: menuOpen})
    renderMenu()
    await settle()
    expect(menuHost.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe("Меню комнаты «Лаборатория»")
    expect(button(menuHost, "Назад").disabled).toBe(true)
    button(menuHost, "Главный дисплей").click()
    await settle()
    expect(commands.slice(-2)).toEqual(["close-menu", "menu-display"])
    menuOpen = true
    renderMenu()
    await settle()
    menuHost.querySelector('[role="menu"]')?.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    await settle()
    expect(menuOpen).toBe(false)
    infoRoot.render(Info, {open: true, roomLabel: "Лаборатория", agents, onOpenChange() {}, atom: {
      kind: "atom", ref: "atom:room", meta: parseMetaAddress("@metafor/room")!, declaration: "#/runtime/roots/0", state: "ready", values: {speed: 1},
      mass: [{ref: "mass:catalog", key: "catalog", format: "json", label: "Каталог", description: null, content: "lazy"}], children: [],
    }})
    await settle()
    expect(infoHost.querySelector('[role="dialog"]')).not.toBeNull()
    expect(infoHost.textContent).toContain("speed: 1")
    expect(infoHost.querySelector("[data-room-info]")?.querySelectorAll("input")).toHaveLength(0)
    button(infoHost, "Mass").click()
    await settle()
    expect(infoHost.textContent).toContain("Каталог · json · mass:catalog")
    expect(document.querySelectorAll("canvas")).toHaveLength(0)
    expect(menuHost.ownerDocument).toBe(host.ownerDocument)
    expect(infoHost.ownerDocument).toBe(host.ownerDocument)
  } finally {root.unmount(); menuRoot.unmount(); infoRoot.unmount(); await rm(directory, {recursive: true, force: true})}
}, 30_000)
