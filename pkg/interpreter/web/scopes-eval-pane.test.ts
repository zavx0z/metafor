import {expect, test} from "bun:test"

const storage = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
})

const {formatScopeDetailCode} = await import("./scopes-eval-pane.ts")

test("scope detail formatter preserves function source newlines", () => {
  const code = formatScopeDetailCode("MetaFor", {
    type: "function",
    description: "function MetaFor(name) {\\n  return name\\n}",
    objectId: "{\"injectedScriptId\":1,\"id\":27}",
    enumerable: true,
    configurable: false,
    writable: false,
    isOwn: true,
  })

  expect(code).toContain("MetaFor: ƒ MetaFor(name)")
  expect(code).toContain("[[FunctionSource]]\n    function MetaFor(name) {\n      return name\n    }")
  expect(code).toContain("objectId: {\n      injectedScriptId: 1,\n      id: 27\n    }")
  expect(code).not.toContain("const MetaFor")
  expect(code).not.toContain("\\n")
  expect(code).not.toContain("\\\"")
})

test("scope detail formatter renders multiline string values as multiline literals", () => {
  const code = formatScopeDetailCode("message", {
    type: "string",
    value: "first\\nsecond",
  })

  expect(code).toContain("message: `first\nsecond`")
  expect(code).not.toContain("\\n")
})

test("scope detail formatter renders remote object preview from protocol data", () => {
  const code = formatScopeDetailCode("event", {
    type: "object",
    className: "MessageEvent",
    description: "MessageEvent",
    preview: {
      type: "object",
      description: "MessageEvent",
      properties: [
        {name: "data", type: "undefined", value: "undefined"},
        {name: "type", type: "string", value: "message"},
      ],
    },
    objectId: "{\"injectedScriptId\":1,\"id\":12}",
  })

  expect(code).toContain("event: MessageEvent")
  expect(code).toContain("[[Preview]]\n    data: undefined\n    type: \"message\"")
  expect(code).toContain("[[Remote]]")
  expect(code).not.toContain("const event")
})
