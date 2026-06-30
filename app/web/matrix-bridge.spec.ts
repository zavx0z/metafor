import {describe, expect, test} from "bun:test"
import {matrixBridgeAuth, readMatrixBridgeMessage} from "./matrix-bridge.ts"

describe("app/web Matrix bridge helpers", () => {
	test("accepts Force bridge messages", () => {
		const message = readMatrixBridgeMessage(JSON.stringify({
			type: "force",
			parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
		}))

		expect(message).toEqual({
			type: "force",
			parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
		})
	})

	test("accepts hello and snapshot request bridge messages", () => {
		expect(readMatrixBridgeMessage(JSON.stringify({
			type: "hello",
			runtime: "matrix",
			pid: 42,
			startedAt: "2026-06-30T00:00:00.000Z",
		}))).toEqual({
			type: "hello",
			runtime: "matrix",
			pid: 42,
			startedAt: "2026-06-30T00:00:00.000Z",
		})
		expect(readMatrixBridgeMessage(JSON.stringify({type: "snapshot-request", reason: "manual"}))).toEqual({
			type: "snapshot-request",
			reason: "manual",
		})
		expect(readMatrixBridgeMessage(JSON.stringify({type: "snapshot-request"}))).toEqual({
			type: "snapshot-request",
		})
	})

	test("rejects malformed Force bridge messages", () => {
		expect(readMatrixBridgeMessage(JSON.stringify({type: "force", parts: null}))).toBeNull()
		expect(readMatrixBridgeMessage("not-json")).toBeNull()
	})

	test("allows loopback bridge when token is not configured", () => {
		const result = matrixBridgeAuth({
			url: new URL("ws://127.0.0.1:3004/matrix/ws"),
			requestHost: "127.0.0.1",
			serverHost: "10.66.0.10",
			token: null,
			headerToken: null,
		})

		expect(result).toEqual({ok: true})
	})

	test("allows bridge from the configured server host address", () => {
		const result = matrixBridgeAuth({
			url: new URL("ws://10.66.0.10:3004/matrix/ws"),
			requestHost: "10.66.0.10",
			serverHost: "10.66.0.10",
			token: null,
			headerToken: null,
		})

		expect(result).toEqual({ok: true})
	})

	test("requires configured bridge token", () => {
		const url = new URL("ws://10.66.0.10:3004/matrix/ws?token=secret")
		expect(matrixBridgeAuth({url, requestHost: "10.66.0.10", serverHost: "10.66.0.10", token: "secret", headerToken: null})).toEqual({ok: true})
		expect(matrixBridgeAuth({url: new URL("ws://10.66.0.10:3004/matrix/ws"), requestHost: "10.66.0.10", serverHost: "10.66.0.10", token: "secret", headerToken: "secret"})).toEqual({ok: true})
		expect(matrixBridgeAuth({url, requestHost: "10.66.0.10", serverHost: "10.66.0.10", token: "other", headerToken: null})).toEqual({
			ok: false,
			reason: "token",
		})
	})

	test("rejects non-loopback bridge when listening on wildcard host without token", () => {
		const result = matrixBridgeAuth({
			url: new URL("ws://0.0.0.0:3004/matrix/ws"),
			requestHost: "10.66.0.10",
			serverHost: "0.0.0.0",
			token: null,
			headerToken: null,
		})

		expect(result).toEqual({ok: false, reason: "loopback"})
	})
})
