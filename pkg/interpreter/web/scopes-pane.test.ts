import {expect, test} from "bun:test"

const storage = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
})

const {formatScopeDetailCode, propertySnapshotMapFromProtocolResponse} = await import("./scopes-pane.ts")

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

test("scope detail formatter renders lazily loaded array object children", () => {
  const properties = propertySnapshotMapFromProtocolResponse({
    result: [
      {
        name: "0",
        enumerable: true,
        value: {
          type: "object",
          className: "Object",
          description: "Object",
          objectId: "token-0",
          preview: {
            type: "object",
            description: "Object",
            properties: [
              {name: "type", type: "string", value: "keyword"},
              {name: "text", type: "string", value: "const"},
              {name: "line", type: "number", value: "12"},
            ],
          },
        },
      },
      {
        name: "1",
        enumerable: true,
        value: {
          type: "object",
          className: "Object",
          description: "Object",
          objectId: "token-1",
          preview: {
            type: "object",
            description: "Object",
            properties: [
              {name: "type", type: "string", value: "identifier"},
              {name: "text", type: "string", value: "tokens"},
            ],
          },
        },
      },
      {name: "length", enumerable: false, value: {type: "number", value: 2}},
    ],
  })

  expect(properties["0"]?.objectId).toBe("token-0")
  expect(properties["length"]?.value).toBe(2)

  const code = formatScopeDetailCode("tokens", {
    type: "object",
    subtype: "array",
    description: "Array(2)",
    objectId: "tokens-array",
    properties,
  })

  expect(code).toContain("tokens: [")
  expect(code).toContain("Object {\n    type: \"keyword\"\n    text: \"const\"\n    line: 12\n  }")
  expect(code).toContain("Object {\n    type: \"identifier\"\n    text: \"tokens\"\n  }")
  expect(code).not.toContain("[[Preview]]")
})
