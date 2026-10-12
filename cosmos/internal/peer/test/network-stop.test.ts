import {expect, test} from "bun:test"
import stop, {type MetaforCosmosInternalPeerProcessStop as Stop} from "../process/stop"
import type {ReleaseNode} from "@cosmos/release/node"

function fixture(options: {idle?: () => Promise<void>, close?: () => Promise<void>} = {}) {
  const events: string[] = []
  const admission = {open: true}
  const lease = {path: "/fixture/mass", signal: new AbortController().signal, async release() {events.push("release")}}
  const node: ReleaseNode = {
    id: "fixture", network: {} as ReleaseNode["network"], snapshot() {throw new Error("not used by cleanup")},
    observe() {throw new Error("not used by cleanup")}, async refreshObservation() {},
    async peer() {throw new Error("not used by cleanup")},
    async whenIdle() {expect(admission.open).toBeFalse(); events.push("idle"); await options.idle?.()},
    async close() {events.push("close"); await options.close?.()},
  }
  const energy: Stop.Input["energy"] = {resource: {node, lease, admission, digest: "fixture", configurationFile: "/fixture/mass/peer.json"}}
  const input: Stop.Input = {energy, signal: new AbortController().signal, requestId: "request-stop"}
  return {events, energy, input, admission}
}

test("Meta stop closes source admission before drain, then participant before Mass lease", async () => {
  const drain = Promise.withResolvers<void>()
  const local = fixture({idle: () => drain.promise})
  const pending = stop(local.input)
  await Bun.sleep(0)
  expect(local.admission.open).toBeFalse()
  expect(local.events).toEqual(["idle"])
  expect(local.energy.resource).toBeDefined()
  drain.resolve()
  expect(await pending).toEqual({ackId: "request-stop", status: "stopped", error: null})
  expect(local.events).toEqual(["idle", "close", "release"])
  expect(local.energy.resource).toBeUndefined()
  expect(await stop(local.input)).toEqual({ackId: "request-stop", status: "stopped", error: null})
  expect(local.events).toEqual(["idle", "close", "release"])
})

test("failed close preserves the resource and lease for the next explicit Meta stop", async () => {
  let closes = 0
  const local = fixture({close: async () => {if (++closes === 1) throw new Error("private token must not reach Fields")}})
  expect(await stop(local.input)).toEqual({ackId: "request-stop", status: "failed", error: "Network cleanup failed"})
  expect(local.energy.resource).toBeDefined()
  expect(local.events).toEqual(["idle", "close"])
  local.input.requestId = "request-stop-again"
  expect(await stop(local.input)).toEqual({ackId: "request-stop-again", status: "stopped", error: null})
  expect(local.events).toEqual(["idle", "close", "idle", "close", "release"])
  expect(local.energy.resource).toBeUndefined()
})

test("a drain failure still closes the participant and releases its lease; destroy shares cleanup", async () => {
  const local = fixture({idle: async () => {throw new Error("source read failed")}})
  expect(await stop(local.input)).toEqual({ackId: "request-stop", status: "failed", error: "Network cleanup failed"})
  expect(local.events).toEqual(["idle", "close", "release"])
  expect(local.energy.resource).toBeUndefined()
  await stop.cleanup({energy: local.energy})
  expect(local.events).toEqual(["idle", "close", "release"])
})
