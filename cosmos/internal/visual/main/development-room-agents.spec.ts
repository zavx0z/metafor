import {expect, test} from "bun:test"
import {createDocument, type HTMLElement} from "@zavx0z/immersive"
import {createDevelopmentRoomAgents} from "./development-room-agents"
import {developmentActorId, type DevelopmentRoomPorts} from "./development-room-ports"

test("two executor identities in one visited Package keep one Chat each across wall, fullscreen and mode switch", async () => {
  const document = createDocument()
  const parking = document.createElement("div"), window = document.createElement("div")
  const firstWall = document.createElement("div"), secondWall = document.createElement("div")
  const calls: string[] = [], hosts = new Map<string, {element: HTMLElement; disposed: boolean}>()
  const ports: DevelopmentRoomPorts = {
    content: async () => {throw new Error("not used")},
    agents: {
      async list(name) {
        calls.push(`list:${name}`)
        return name === "@fixture/root" ? [{executorId: "one", label: "Первый"}, {executorId: "two", label: "Второй"}] : []
      },
      async create(name, label) {calls.push(`create:${name}:${label}`); return {executorId: "three", label}},
    },
    chat({address, executorId}) {
      calls.push(`chat:${address}:${executorId}`)
      const element = document.createElement("div")
      const entry = {element, disposed: false}
      hosts.set(executorId, entry)
      return {element, moveTo(target) {target.append(element)}, setVisible(value) {element.hidden = !value}, dispose() {entry.disposed = true; element.remove()}}
    },
  }
  const model = createDevelopmentRoomAgents(ports, name => name === "@fixture/root" ? "/cosmos/root" : "/cosmos/child")
  try {
    model.bindParking(parking)
    model.setRoom("@fixture/root")
    model.setActive(true)
    await model.visit("@fixture/root")
    expect(calls.filter(value => value.startsWith("list:"))).toEqual(["list:@fixture/root"])
    expect(model.getSnapshot().agents.map(agent => agent.executorId)).toEqual(["one", "two"])
    model.bindWall(developmentActorId("@fixture/root", "one"), firstWall)
    model.bindWall(developmentActorId("@fixture/root", "two"), secondWall)
    expect(firstWall.firstChild).toBe(hosts.get("one")!.element)
    expect(secondWall.firstChild).toBe(hosts.get("two")!.element)
    model.bindWindow(window)
    expect(model.open("one")).toBe(true)
    expect(window.firstChild).toBe(hosts.get("one")!.element)
    expect(secondWall.firstChild).toBe(hosts.get("two")!.element)
    model.close()
    expect(firstWall.firstChild).toBe(hosts.get("one")!.element)
    model.setActive(false)
    expect(parking.childNodes).toHaveLength(2)
    model.setActive(true)
    expect(firstWall.firstChild).toBe(hosts.get("one")!.element)
    expect(secondWall.firstChild).toBe(hosts.get("two")!.element)
    expect(calls.filter(value => value.startsWith("chat:"))).toHaveLength(2)
    expect(hosts.get("one")!.disposed).toBe(false)
    await model.visit("@fixture/root")
    expect(calls.filter(value => value.startsWith("list:"))).toEqual(["list:@fixture/root", "list:@fixture/root"])
    expect(calls.filter(value => value.startsWith("chat:"))).toHaveLength(2)
  } finally {model.dispose()}
  expect(hosts.get("one")!.disposed).toBe(true)
  expect(hosts.get("two")!.disposed).toBe(true)
})

test("unvisited rooms do not list or create agents", async () => {
  const calls: string[] = []
  const ports = {content: async () => {throw new Error("not used")},
    agents: {async list(name: string) {calls.push(name); return []}, async create() {throw new Error("must not create")}},
    chat() {throw new Error("must not create Chat")}} as unknown as DevelopmentRoomPorts
  const model = createDevelopmentRoomAgents(ports, name => name)
  try {
    model.setRoom("@fixture/root")
    await expect(model.create("Новый")).rejects.toThrow("Сначала войдите")
    expect(calls).toEqual([])
    await model.visit("@fixture/root")
    expect(calls).toEqual(["@fixture/root"])
  } finally {model.dispose()}
})
