import {expect, test} from "bun:test"
import type {ClientViewInspection} from "@metafor/types/cosmos/client"
import type {DevelopmentCatalog} from "../../../release/shared/development"
import {isClientInspection} from "../../../release/shared/clients"
import {selectSourcePackage} from "./development-room-client"
import {inspectDevelopmentRoom} from "./development-room-inspection"
import type {DevelopmentRoomSnapshot} from "./development-room-scene"
import type {DevelopmentRoomAgentsSnapshot} from "./development-room-agents"

const catalog: DevelopmentCatalog = {schema: "cosmos:development/v1", workspaceId: "fixture", rootPackage: "@fixture/root", revision: "one", dependencies: [],
  packages: [
    {name: "@fixture/root", label: "Root", address: "/root", owner: null, ownerName: null, resolution: "source", writable: true},
    {name: "external-lib", label: "External", address: "/external", owner: null, ownerName: null, resolution: "external", writable: false},
  ]}
const base: ClientViewInspection = {mode: "agents", status: "ready", error: null, selected: {officeId: "office", agentRef: "atom:4"},
  offices: [{id: "office", label: "Quantum", agents: ["agent"]}], text: "Quantum text", controls: []}

test("Cosmos inspect projects only the selected Package and bounded exact executor identities", () => {
  const scene: DevelopmentRoomSnapshot = {catalog, selectedPackage: catalog.packages[0]!, view: "room", canGoBack: true,
    error: null, geometryNodes: []}
  const participants = Array.from({length: 66}, (_, index) => ({executorId: `executor-${index}`, label: `Агент ${index}`}))
  const agents: DevelopmentRoomAgentsSnapshot = {packageName: "@fixture/root", agents: participants, loading: false,
    error: null, selectedActorId: null, chatOpen: false}
  const view = inspectDevelopmentRoom(base, scene, agents, null)
  expect(view.mode).toBe("cosmos")
  expect(view.offices).toEqual([])
  expect(view.selected).toBeNull()
  expect(view.sourceRoom).toMatchObject({packageName: "@fixture/root", resolution: "source", view: "room", participantsTruncated: true})
  expect(view.sourceRoom?.participants).toHaveLength(64)
  expect(view.sourceRoom?.participants[0]).toEqual({executorId: "executor-0", label: "Агент 0"})
  expect(isClientInspection({schema: "cosmos/client-inspection/v1", version: 1, status: {visible: true, focused: true,
    boot: {phase: "ready", trace: []}}, viewport: {width: 1200, height: 800, devicePixelRatio: 1}, view})).toBe(true)
  const external = inspectDevelopmentRoom(base, {...scene, selectedPackage: catalog.packages[1]!, view: "overview"}, agents, "unavailable")
  expect(external.status).toBe("error")
  expect(external.sourceRoom).toMatchObject({packageName: "external-lib", resolution: "external", view: "overview", participants: []})
  expect(inspectDevelopmentRoom(base, scene, {...agents, loading: true}, null).status).toBe("loading")
  expect(inspectDevelopmentRoom(base, scene, {...agents, error: "Участники недоступны"}, null)).toMatchObject({status: "error", error: "Участники недоступны"})
  expect(inspectDevelopmentRoom(base, {...scene, error: "Сохраните черновики"}, agents, null)).toMatchObject({status: "error", error: "Сохраните черновики"})
  expect(inspectDevelopmentRoom(base, scene, {...agents, packageName: "previous", error: "Старая ошибка"}, null).status).toBe("ready")
})

test("package selection resolves exact assigned source identity before calling release routing", () => {
  const routed: string[] = []
  const navigate = (name: string) => routed.push(name)
  selectSourcePackage(catalog, "@fixture/root", navigate)
  expect(routed).toEqual(["@fixture/root"])
  expect(() => selectSourcePackage(catalog, "external-lib", navigate)).toThrow("absent")
  expect(() => selectSourcePackage(catalog, "@fixture/missing", navigate)).toThrow("absent")
  expect(() => selectSourcePackage(null, "@fixture/root", navigate)).toThrow("absent")
  expect(routed).toEqual(["@fixture/root"])
})
