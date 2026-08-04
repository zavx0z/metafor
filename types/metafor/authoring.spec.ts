import {describe, expect, test} from "bun:test"
import {parseMetaAddress, type MetaAddress} from "./graph.ts"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_CREATE_CAPABILITY,
  META_CREATE_METHOD,
  META_MATTER_APPLY_METHOD,
  META_MATTER_WRITE_CAPABILITY,
  validateMetaCreateRequest,
  validateMetaMatterRequest,
  type MetaAuthoringCapability,
  type MetaCreateRequest,
  type MetaMatterRequest,
  type MetaSourceRevision,
} from "./authoring.ts"

const LADA = parseMetaAddress("zavx0z/lada")!
const CHAT = parseMetaAddress("zavx0z/lada-chat")!
const TEST = parseMetaAddress("zavx0z/lada-test")!
const OTHER = parseMetaAddress("zavx0z/other")!
const LADA_REVISION = `sha256:${"1".repeat(64)}` as MetaSourceRevision
const CHAT_REVISION = `sha256:${"2".repeat(64)}` as MetaSourceRevision

const createGrant = (scopes: readonly MetaAddress[] = [TEST]): MetaAuthoringCapability => ({
  capability: META_CREATE_CAPABILITY,
  method: META_CREATE_METHOD,
  scopes,
  operationClass: "create",
  liveState: false,
  gitCommit: false,
})

const matterGrant = (scopes: readonly MetaAddress[] = [LADA, CHAT, TEST]): MetaAuthoringCapability => ({
  capability: META_MATTER_WRITE_CAPABILITY,
  method: META_MATTER_APPLY_METHOD,
  scopes,
  operationClass: "matter",
  liveState: true,
  gitCommit: false,
})

const currentRevision = (address: MetaAddress): MetaSourceRevision | null => {
  if (address === LADA) return LADA_REVISION
  if (address === CHAT) return CHAT_REVISION
  return null
}

const createRequest = (): MetaCreateRequest => ({
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  operationId: "create-lada-test",
  capability: META_CREATE_CAPABILITY,
  address: TEST,
  name: "Lada Test",
  description: "Inert authoring package",
  profile: "empty",
  target: "absent",
})

describe("meta.create proposal validation", () => {
  test("accepts and detaches the closed empty-profile request", () => {
    const input = createRequest()
    const result = validateMetaCreateRequest(input, {capabilities: [createGrant()]})

    expect(result).toEqual({ok: true, value: input})
    if (!result.ok) return
    expect(result.value).not.toBe(input)
  })

  test.each([
    ["unknown field", {...createRequest(), comment: "not contract"}, "unknown_property"],
    ["wrong version", {...createRequest(), contractVersion: 2}, "invalid_literal"],
    ["unsafe operation id", {...createRequest(), operationId: "create test"}, "invalid_operation_id"],
    ["nested address", {...createRequest(), address: "zavx0z/lada/test"}, "invalid_meta_address"],
    ["unapproved profile", {...createRequest(), profile: "default"}, "invalid_literal"],
    ["wrong target precondition", {...createRequest(), target: "replace"}, "invalid_literal"],
  ])("rejects %s", (_label, input, code) => {
    const result = validateMetaCreateRequest(input, {capabilities: [createGrant()]})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  test("rejects missing capability and graph scope before any provider action", () => {
    const noCapability = validateMetaCreateRequest(createRequest(), {capabilities: []})
    const wrongScope = validateMetaCreateRequest(createRequest(), {capabilities: [createGrant([OTHER])]})

    expect(noCapability).toMatchObject({ok: false, issues: [{code: "capability_denied"}]})
    expect(wrongScope).toMatchObject({ok: false, issues: [{code: "scope_denied"}]})
  })

  test("rejects accessors without invoking them", () => {
    let invoked = false
    const input = createRequest() as unknown as Record<string, unknown>
    Object.defineProperty(input, "name", {
      enumerable: true,
      get() {
        invoked = true
        return "Lada Test"
      },
    })

    const result = validateMetaCreateRequest(input, {capabilities: [createGrant()]})
    expect(result.ok).toBe(false)
    expect(invoked).toBe(false)
  })
})

describe("meta.matter.apply proposal validation", () => {
  const validCases: Array<[string, MetaMatterRequest]> = [
    [
      "add",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        child: TEST,
        toParent: LADA,
        revisions: [{address: LADA, revision: LADA_REVISION}],
      },
    ],
    [
      "move",
      {
        contractVersion: 1,
        operationId: "matter-move",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "move",
        child: TEST,
        fromParent: LADA,
        toParent: CHAT,
        revisions: [
          {address: CHAT, revision: CHAT_REVISION},
          {address: LADA, revision: LADA_REVISION},
        ],
      },
    ],
    [
      "remove",
      {
        contractVersion: 1,
        operationId: "matter-remove",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "remove",
        child: TEST,
        fromParent: CHAT,
        revisions: [{address: CHAT, revision: CHAT_REVISION}],
      },
    ],
  ]

  test.each(validCases)("accepts the closed %s operation", (_label, input) => {
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      ...input,
      revisions: [...input.revisions].sort((left, right) => left.address.localeCompare(right.address)),
    } as MetaMatterRequest)
    expect(result.value).not.toBe(input)
    expect(result.value.revisions).not.toBe(input.revisions)
  })

  test("normalizes revision order without mutating the request", () => {
    const revisions = [
      {address: LADA, revision: LADA_REVISION},
      {address: CHAT, revision: CHAT_REVISION},
    ]
    const input = {
      contractVersion: 1,
      operationId: "matter-move",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "move",
      child: TEST,
      fromParent: LADA,
      toParent: CHAT,
      revisions,
    }
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.revisions.map(({address}) => address)).toEqual([LADA, CHAT])
    expect(revisions.map(({address}) => address)).toEqual([LADA, CHAT])
  })

  test.each([
    [
      "unknown field",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        child: TEST,
        toParent: LADA,
        revisions: [{address: LADA, revision: LADA_REVISION}],
        fieldsBinding: {},
      },
      "unknown_property",
    ],
    [
      "unsupported operation",
      {
        contractVersion: 1,
        operationId: "matter-replace",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "replace",
        child: TEST,
        revisions: [],
      },
      "forbidden_operation",
    ],
    [
      "same-parent move",
      {
        contractVersion: 1,
        operationId: "matter-move",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "move",
        child: TEST,
        fromParent: LADA,
        toParent: LADA,
        revisions: [{address: LADA, revision: LADA_REVISION}],
      },
      "forbidden_operation",
    ],
    [
      "missing revision",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        child: TEST,
        toParent: LADA,
        revisions: [],
      },
      "missing_revision",
    ],
    [
      "stale revision",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        child: TEST,
        toParent: LADA,
        revisions: [{address: LADA, revision: CHAT_REVISION}],
      },
      "revision_mismatch",
    ],
    [
      "extra revision",
      {
        contractVersion: 1,
        operationId: "matter-add",
        capability: META_MATTER_WRITE_CAPABILITY,
        operation: "add",
        child: TEST,
        toParent: LADA,
        revisions: [
          {address: LADA, revision: LADA_REVISION},
          {address: CHAT, revision: CHAT_REVISION},
        ],
      },
      "extra_revision",
    ],
  ])("rejects %s", (_label, input, code) => {
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  test("rejects a missing live grant and every out-of-scope Meta", () => {
    const input = {
      contractVersion: 1,
      operationId: "matter-add",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "add",
      child: TEST,
      toParent: LADA,
      revisions: [{address: LADA, revision: LADA_REVISION}],
    }
    const noGrant = validateMetaMatterRequest(input, {capabilities: [], currentRevision})
    const wrongScope = validateMetaMatterRequest(input, {
      capabilities: [matterGrant([LADA])],
      currentRevision,
    })

    expect(noGrant.ok).toBe(false)
    if (!noGrant.ok) expect(noGrant.issues.map(({code}) => code)).toContain("capability_denied")
    expect(wrongScope.ok).toBe(false)
    if (!wrongScope.ok) expect(wrongScope.issues.map(({code}) => code)).toContain("scope_denied")
  })

  test("rejects sparse revision arrays before reading their entries", () => {
    const input = {
      contractVersion: 1,
      operationId: "matter-add",
      capability: META_MATTER_WRITE_CAPABILITY,
      operation: "add",
      child: TEST,
      toParent: LADA,
      revisions: new Array(1),
    }
    const result = validateMetaMatterRequest(input, {
      capabilities: [matterGrant()],
      currentRevision,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map(({code}) => code)).toContain("non_json_value")
  })
})
