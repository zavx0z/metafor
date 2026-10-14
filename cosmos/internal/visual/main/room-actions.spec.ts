import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, Event, HTMLButtonElement, HTMLInputElement, HTMLSelectElement, InputEvent, type DOMComponentConstructor} from "@zavx0z/immersive"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import type {RoomActionCreated, RoomActionsProps} from "./room-actions"
import {createCosmosConversationDirectoryClient} from "../../../release/main/conversations"

test("готовые HUD действия создают именованного Agent и CAS группу только после явного ввода", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-room-actions-"))
  const document = createDocument(), host = document.createElement("div")
  document.append(host)
  const root = createDomRoot(host)
  const roomScope = {verseId: "verse-test", atomRef: "atom:room"}
  const scope = {...roomScope, agentRef: "agent:first"}
  const actor = {scope, profile: {version: 1 as const, scope, revision: 0, name: "Первый", gender: "male" as const}}
  const calls: Array<{action: string; scope: unknown; name?: string; expectedRevision?: number; title?: string; members?: string[]}> = []
  const clientDirectory = createCosmosConversationDirectoryClient({fetcher: (async (path, init) => {
    expect(path).toBe("/conversations")
    const request = JSON.parse(String(init?.body))
    calls.push(request)
    let result: unknown
    if (request.action === "agent.create") {
      const created = {...roomScope, agentRef: "agent:second"}
      result = {scope: created, profile: {...actor.profile, scope: created, name: request.name}}
    } else if (request.action === "group.list") result = {version: 1, scope: roomScope, revision: 11, groups: []}
    else if (request.action === "group.create") result = {version: 1, scope: roomScope, revision: 12, groups: [{id: "group:one", title: request.title, members: request.members}]}
    else throw new Error(`Unexpected room operation: ${request.action}`)
    return Response.json({ok: true, result})
  }) as typeof fetch})
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const entrypoint = join(import.meta.dir, "room-actions.tsx")
    const agentRoot = resolve(import.meta.dir, "../../../../standard/agent")
    const chatRoot = resolve(dirname(Bun.resolveSync("@zavx0z/chat/composer", agentRoot)), "../../..")
    const preferencesRoot = dirname(Bun.resolveSync("@zavx0z/storybook-chat-preferences", agentRoot))
    const timelineRoot = resolve(dirname(Bun.resolveSync("@zavx0z/storybook-chat-view/timeline", agentRoot)), "..")
    const settingsRoot = dirname(Bun.resolveSync("@zavx0z/storybook-app-web-page-shell-execution-settings", import.meta.dir))
    const browserRoot = dirname(Bun.resolveSync("@zavx0z/storybook-app-web-page-shell-execution-settings-browser-preview", import.meta.dir))
    const built = await Bun.build({entrypoints: [entrypoint], outdir: directory, target: "bun", conditions: ["internal:main", "metafor:main"],
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
      plugins: [createJsxBunPlugin({cwd: resolve(import.meta.dir, ".."),
        sourceRoots: [import.meta.dir, agentRoot, chatRoot, preferencesRoot, timelineRoot, browserRoot, settingsRoot],
        styleSourceRootIds: ["@internal/visual", "@metafor/agent", "@zavx0z/chat", "@zavx0z/storybook-chat-preferences", "@zavx0z/storybook-chat-view", "@zavx0z/storybook-app-web-page-shell-execution-settings-browser-preview", "@zavx0z/storybook-app-web-page-shell-execution-settings"]})]})
    if (!built.success) throw new AggregateError(built.logs, "RoomActions did not compile")
    const View = (await import(pathToFileURL(join(directory, "room-actions.js")).href)).RoomActions as DOMComponentConstructor<RoomActionsProps>
    const created: RoomActionCreated[] = []
    const chats: unknown[] = []
    const agentSelections: unknown[] = []
    let props: RoomActionsProps = {roomScope, actors: [actor], clientDirectory, visible: true,
      connections: [{id: "one", label: "Browser A", enabled: true}, {id: "two", label: "Browser B", enabled: true}],
      async onCreateAgent(scope, name, connectionId) {agentSelections.push({scope, name, connectionId}); return {agent: await clientDirectory.createAgent(scope, name), configurationError: "Войдите в браузер для продолжения"}},
      onCreated(value) {created.push(value); if (value.kind === "agent") {props = {...props, actors: [...props.actors, value.agent]}; render()}},
      onCreateChat(scope, label) {chats.push({scope, label})}}
    const render = () => root.render(View, props)
    const settle = async () => {for (let i = 0; i < 7; i++) {root.flush(); await Bun.sleep(0)}}
    const button = (label: string) => {
      const value = [...host.querySelectorAll("button")].find(value => value.textContent === label)
      if (!(value instanceof HTMLButtonElement)) throw new Error(`Room button absent: ${label}`)
      return value
    }
    const typeName = async (name: string) => {
      const input = [...host.querySelectorAll('[role="dialog"] input')].find(value => value instanceof HTMLInputElement && value.type !== "checkbox")
      if (!(input instanceof HTMLInputElement)) throw new Error("Ready TextField is absent")
      input.value = name
      input.dispatchEvent(new InputEvent("input", {bubbles: true, data: name}))
      await settle()
    }
    render()
    await settle()
    expect(calls).toEqual([])
    button("Добавить агента").click()
    await settle()
    expect(button("Создать").disabled).toBe(true)
    await typeName("Исследователь")
    expect(button("Создать").disabled).toBe(true)
    const connection = host.querySelector('[role="dialog"] select')
    if (!(connection instanceof HTMLSelectElement)) throw new Error("Agent connection selector is absent")
    connection.value = "two"
    connection.dispatchEvent(new Event("change", {bubbles: true}))
    await settle()
    button("Создать").click()
    button("Создать").click()
    await settle()
    expect(calls.filter(value => value.action === "agent.create")).toEqual([{action: "agent.create", scope: roomScope, name: "Исследователь"}])
    expect(agentSelections).toEqual([{scope: roomScope, name: "Исследователь", connectionId: "two"}])
    expect(created[0]).toMatchObject({kind: "agent", agent: {profile: {name: "Исследователь"}}})
    expect(host.textContent).toContain("Войдите в браузер для продолжения")
    button("Добавить группу").click()
    await settle()
    expect(calls.filter(value => value.action === "group.list")).toHaveLength(1)
    await typeName("Команда")
    const member = host.querySelector('input[type="checkbox"]')
    if (!(member instanceof HTMLInputElement)) throw new Error("Ready member checkbox is absent")
    member.click()
    await settle()
    button("Создать").click()
    await settle()
    expect(calls.find(value => value.action === "group.create")).toEqual({action: "group.create", scope: roomScope, expectedRevision: 11, title: "Команда", members: [scope.agentRef]})
    expect(created[1]).toMatchObject({kind: "group", groups: {revision: 12}})
    expect(host.textContent).toContain("Команда · Первый")
    button("Добавить чат").click()
    await settle()
    expect(button("Создать").disabled).toBe(true)
    expect(chats).toEqual([])
    const chatActor = host.querySelector('[role="dialog"] select')
    if (!(chatActor instanceof HTMLSelectElement)) throw new Error("Chat actor SelectField is absent")
    expect(props.actors.some(actor => actor.scope.agentRef === chatActor.value)).toBe(false)
    chatActor.value = scope.agentRef
    chatActor.dispatchEvent(new Event("change", {bubbles: true}))
    await settle()
    button("Создать").click()
    await settle()
    expect(chats).toEqual([{scope, label: undefined}])
    expect(calls.some(value => value.action === "prompt")).toBe(false)
    expect(host.querySelectorAll("canvas")).toHaveLength(0)
    props = {...props, visible: false}
    render()
    await settle()
    expect(host.querySelectorAll("button")).toHaveLength(0)
    props = {...props, visible: true, clientDirectory: null}
    render()
    await settle()
    expect(host.querySelectorAll("button")).toHaveLength(0)
  } finally {root.unmount(); clientDirectory.dispose(); await rm(directory, {recursive: true, force: true})}
}, 35_000)
