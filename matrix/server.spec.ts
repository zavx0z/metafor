import {describe, expect, test} from "bun:test"
import {bridgeUrlWithToken, createMatrixServerStatus, readMatrixBridgeIncomingMessage} from "./server-bridge.ts"

describe("matrix server bridge helpers", () => {
  test("adds bridge token to URL", () => {
    expect(bridgeUrlWithToken("ws://127.0.0.1:3004/matrix/ws", "secret")).toBe(
      "ws://127.0.0.1:3004/matrix/ws?token=secret",
    )
    expect(bridgeUrlWithToken("ws://127.0.0.1:3004/matrix/ws?x=1", "secret")).toBe(
      "ws://127.0.0.1:3004/matrix/ws?x=1&token=secret",
    )
  })

  test("parses snapshot and Force bridge messages", () => {
    const snapshot = {version: 1, wimpIds: [], legacyProcessActorIds: [], runtime: {}, data: {}, strong: {}, weak: {}}
    expect(readMatrixBridgeIncomingMessage(JSON.stringify({type: "matrix-snapshot", version: 1, snapshot}))).toEqual({
      type: "matrix-snapshot",
      version: 1,
      snapshot,
    })
    expect(readMatrixBridgeIncomingMessage(JSON.stringify({
      type: "force",
      parts: [{part: "gluon", op: "replace", path: 17, value: {fields: {"1": "x"}}}],
    }))).toEqual({
      type: "force",
      parts: [{part: "gluon", op: "replace", path: 17, value: {fields: {"1": "x"}}}],
    })
  })

  test("creates status payload", () => {
    expect(createMatrixServerStatus({
      pid: 1,
      startedAt: "2026-06-30T00:00:00.000Z",
      host: "127.0.0.1",
      port: 3005,
      bridgeUrl: "ws://127.0.0.1:3004/matrix/ws",
      socketState: "connected",
      loaded: true,
      snapshotVersion: 1,
      actorCount: 2,
      braneCount: 2,
      fieldCount: 3,
      structuralDirty: false,
      reconnects: 0,
      lastSnapshotAt: "2026-06-30T00:00:01.000Z",
      lastForceAt: null,
      lastError: null,
    })).toMatchObject({
      ok: true,
      runtime: "matrix",
      connected: true,
      loaded: true,
      actorCount: 2,
      braneCount: 2,
      fieldCount: 3,
    })
  })
})
