import {describe, expect, test} from "bun:test"
import {
  hamiltonianBrowserNodeId,
  hamiltonianBrowserRuntimeName,
  hamiltonianPageNodeId,
  hamiltonianWindowNodeId,
  parseLocalHamiltonianWindowAction,
} from "./orchestration.js"

describe("Hamiltonian local orchestration actions", () => {
  test("identifies the observed browser runtime without calling it a profile", () => {
    expect(hamiltonianBrowserNodeId("device/1")).toBe("browser:device%2F1")
    expect(hamiltonianBrowserRuntimeName("Mozilla/5.0 Chrome/140.0 Safari/537.36")).toBe("Chrome")
    expect(hamiltonianBrowserRuntimeName("Mozilla/5.0 Chrome/140.0 YaBrowser/25.8")).toBe("Yandex Browser")
    expect(hamiltonianBrowserRuntimeName("Mozilla/5.0 Version/18.0 Safari/605.1.15")).toBe("Safari")
  })

  test("accepts only an allowlisted action addressed to the exact local page", () => {
    const nodeId = hamiltonianWindowNodeId("device/1", "tab 1")
    expect(nodeId).toBe("window:device%2F1:tab%201")
    expect(parseLocalHamiltonianWindowAction({nodeId, actionId: "reconnect"}, "device/1", "tab 1"))
      .toEqual({nodeId, actionId: "reconnect"})
    expect(parseLocalHamiltonianWindowAction({nodeId: "window:other:tab%201", actionId: "reconnect"}, "device/1", "tab 1"))
      .toBeNull()
    expect(parseLocalHamiltonianWindowAction({nodeId, actionId: "invented-action"}, "device/1", "tab 1"))
      .toBeNull()
    expect(parseLocalHamiltonianWindowAction({nodeId}, "device/1", "tab 1")).toBeNull()
    expect(parseLocalHamiltonianWindowAction(null, "device/1", "tab 1")).toBeNull()
    const pageNodeId = hamiltonianPageNodeId("page/1")
    expect(parseLocalHamiltonianWindowAction(
      {nodeId: pageNodeId, actionId: "reload"},
      "device/1",
      "tab 1",
      "page/1",
    )).toEqual({nodeId: pageNodeId, actionId: "reload"})
    const serviceWorkerNodeId = "service-worker:stable"
    expect(parseLocalHamiltonianWindowAction(
      {nodeId: serviceWorkerNodeId, actionId: "enable-push"},
      "device/1",
      "tab 1",
      "page/1",
      serviceWorkerNodeId,
    )).toEqual({nodeId: serviceWorkerNodeId, actionId: "enable-push"})
    expect(parseLocalHamiltonianWindowAction(
      {nodeId: serviceWorkerNodeId, actionId: "reload"},
      "device/1",
      "tab 1",
      "page/1",
      serviceWorkerNodeId,
    )).toBeNull()
  })
})
