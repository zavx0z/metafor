import {describe, expect, test} from "bun:test"
import {energyBridgeAuth, readEnergyBridgeMessage} from "./energy-bridge.ts"

const env = {kind: "server", id: "energy-test"} as const

describe("app/web Energy bridge helpers", () => {
	test("accepts hello messages", () => {
		expect(readEnergyBridgeMessage(JSON.stringify({
			type: "hello",
			runtime: "energy",
			env,
			pid: 42,
			startedAt: "2026-06-30T00:00:00.000Z",
		}))).toEqual({
			type: "hello",
			runtime: "energy",
			env,
			pid: 42,
			startedAt: "2026-06-30T00:00:00.000Z",
		})
	})

	test("accepts Force bridge messages", () => {
		expect(readEnergyBridgeMessage(JSON.stringify({
			type: "force",
			parts: [{part: "w+", op: "replace", path: 17, processId: 2, value: {fields: {"3": "done"}}}],
		}))).toEqual({
			type: "force",
			parts: [{part: "w+", op: "replace", path: 17, processId: 2, value: {fields: {"3": "done"}}}],
		})
	})

	test("accepts claim and process result messages", () => {
		expect(readEnergyBridgeMessage(JSON.stringify({
			type: "claim",
			actorId: 17,
			processId: 2,
			token: "run-1",
			env,
			mass: {transport: "websocket", labels: ["server"]},
		}))).toEqual({
			type: "claim",
			actorId: 17,
			processId: 2,
			token: "run-1",
			env,
			mass: {transport: "websocket", labels: ["server"]},
		})
		expect(readEnergyBridgeMessage(JSON.stringify({
			type: "process-result",
			result: {ok: true, actorId: 17, processId: 2, fields: {"3": "done"}},
		}))).toEqual({
			type: "process-result",
			result: {ok: true, actorId: 17, processId: 2, fields: {"3": "done"}},
		})
	})

	test("rejects malformed bridge messages", () => {
		expect(readEnergyBridgeMessage("not-json")).toBeNull()
		expect(readEnergyBridgeMessage(JSON.stringify({type: "hello", runtime: "energy", env: {kind: "server"}, pid: 1, startedAt: "x"}))).toBeNull()
		expect(readEnergyBridgeMessage(JSON.stringify({type: "claim", actorId: 17, processId: 2, token: "t", env, mass: {transport: "adb"}}))).toBeNull()
		expect(readEnergyBridgeMessage(JSON.stringify({type: "process-result", result: {ok: true, actorId: 17, processId: 2}}))).toBeNull()
	})

	test("allows loopback bridge when token is not configured", () => {
		expect(energyBridgeAuth({
			url: new URL("ws://127.0.0.1:3004/energy/ws"),
			requestHost: "127.0.0.1",
			serverHost: "10.66.0.10",
			token: null,
			headerToken: null,
		})).toEqual({ok: true})
	})

	test("requires configured bridge token", () => {
		const url = new URL("ws://10.66.0.10:3004/energy/ws?token=secret")
		expect(energyBridgeAuth({url, requestHost: "10.66.0.10", serverHost: "10.66.0.10", token: "secret", headerToken: null})).toEqual({ok: true})
		expect(energyBridgeAuth({url: new URL("ws://10.66.0.10:3004/energy/ws"), requestHost: "10.66.0.10", serverHost: "10.66.0.10", token: "secret", headerToken: "secret"})).toEqual({ok: true})
		expect(energyBridgeAuth({url, requestHost: "10.66.0.10", serverHost: "10.66.0.10", token: "other", headerToken: null})).toEqual({
			ok: false,
			reason: "token",
		})
	})

	test("rejects non-loopback bridge when listening on wildcard host without token", () => {
		expect(energyBridgeAuth({
			url: new URL("ws://0.0.0.0:3004/energy/ws"),
			requestHost: "10.66.0.10",
			serverHost: "0.0.0.0",
			token: null,
			headerToken: null,
		})).toEqual({ok: false, reason: "loopback"})
	})
})
