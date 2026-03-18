import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { Address } from "@dark/types/dark"
import type { Binding, Wimp, WimpID } from "@dark/types"
import { parse, type NodeMeta } from "../metafor/template/index.ts"

import { HubFixture } from "fixture/hub"
import { loadMetaAST } from "../dark/load"
import type { MetaAST } from "../metafor/ast/ast.t"

/**
 * Структура тестов для частицы Wimp.
 *
 * Wimp — это уже выбранная статическая связность.
 * Он не выбирает ветвь и не вычисляет target,
 * а только фиксирует конкретный адрес следующей meta.
 */

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

afterAll(async () => {
  await hub.teardown()
})

function normalizeBinding(value: NodeMeta["fields"] | NodeMeta["mass"]): Binding<Record<string, unknown>> | undefined {
  if (!value) return undefined
  if (typeof value === "string") {
    return {
      mode: "static",
      value: value as unknown as Record<string, unknown>,
    }
  }

  return {
    mode: "dynamic",
    basis: value.data,
    ...(("expr" in value && value.expr) ? { expr: value.expr } : {}),
  }
}

function createWimpId(src: string): WimpID {
  return `wimp:${src}`
}

/**
 * Нормализует meta-узел в Wimp только если src уже статичен.
 */
function normalizeToWimp(gravityNode: NodeMeta): Wimp {
  if (gravityNode?.src == null) {
    throw new Error("Wimp: отсутствует src")
  }

  if (typeof gravityNode.src !== "string") {
    throw new Error("Wimp: src должен быть уже статичным результатом выбора")
  }

  if (!isValidHubAddress(gravityNode.src)) {
    throw new Error(`Wimp: невалидный hub-адрес в src (${gravityNode.src})`)
  }

  const result: Wimp = {
    id: createWimpId(gravityNode.src),
    kind: "wimp",
    src: gravityNode.src,
    children: new Set(),
  }
  if (gravityNode.fields) {
    const fields = normalizeBinding(gravityNode.fields)
    if (fields) result.fields = fields
  }
  if (gravityNode.mass) {
    const mass = normalizeBinding(gravityNode.mass)
    if (mass) result.mass = mass
  }
  return result
}

function isValidHubAddress(address: string): boolean {
  return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+$/.test(address)
}

describe("Wimp — загрузка реальных данных", () => {
  let ast: MetaAST

  beforeAll(async () => {
    ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
  })

  test("gravity[0] содержит selector-узел с динамическим src, а не готовый Wimp", () => {
    const gravityNode = ast.gravity?.[0] as NodeMeta

    expect(gravityNode).toBeDefined()
    expect(gravityNode?.type).toBe("meta")
    expect(typeof gravityNode?.src).toBe("object")
  })

  test("gravity[1].child[0] содержит статический Wimp-кандидат", () => {
    const gravityNode = ast.gravity?.[1] as any
    const childNode = gravityNode?.child?.[0] as NodeMeta

    expect(childNode).toBeDefined()
    expect(childNode?.type).toBe("meta")
    expect(typeof childNode?.src).toBe("string")
    expect(childNode?.src).toBe("zavx0z/git-error")
  })
})

describe("Wimp — допустимый контракт", () => {
  let ast: MetaAST

  beforeAll(async () => {
    ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
  })

  test("должен формировать Wimp только из уже статического src", () => {
    const gravityNode = ast.gravity?.[1] as any
    const childNode = gravityNode?.child?.[0] as NodeMeta
    const wimp = normalizeToWimp(childNode)

    expect(wimp).toEqual({
      id: "wimp:zavx0z/git-error",
      kind: "wimp",
      src: "zavx0z/git-error",
      children: new Set(),
      fields: {
        mode: "dynamic",
        basis: "/value/error",
        expr: "{ message: _[0] }",
      },
    })
  })

  test("должен читать fields как входящий binding-канал", () => {
    const gravityNode = ast.gravity?.[1] as any
    const childNode = gravityNode?.child?.[0] as NodeMeta
    const wimp = normalizeToWimp(childNode)

    expect(wimp.fields).toBeDefined()
    if (wimp.fields && wimp.fields.mode === "dynamic") {
      expect(wimp.fields.basis).toBe("/value/error")
      expect(wimp.fields.expr).toBe("{ message: _[0] }")
    }
  })

  test("должен читать mass как входящий binding-канал родителя", () => {
    const [node] = parse(
      ({ html, mass }) => html`<meta-for src="zavx0z/git-error" mass=${{ id: mass.id, role: mass.role }} />`,
    )
    const wimp = normalizeToWimp(node as NodeMeta)

    expect(wimp.mass).toEqual({
      mode: "dynamic",
      basis: ["/mass/id", "/mass/role"],
      expr: "{ id: _[0], role: _[1] }",
    })
  })

  test("должен принимать статический hub-адрес с подпутём", () => {
    const wimp = normalizeToWimp({
      type: "meta",
      tag: "meta-for",
      src: "zavx0z/git/sub/path",
    } as NodeMeta)

    expect(wimp.id).toBe("wimp:zavx0z/git/sub/path")
    expect(wimp.src).toBe("zavx0z/git/sub/path")
  })
})

describe("Wimp — ограничения", () => {
  test("не должен принимать отсутствующий src", () => {
    const invalidNode = { type: "meta" }

    expect(() => normalizeToWimp(invalidNode as NodeMeta)).toThrow("Wimp: отсутствует src")
  })

  test("не должен принимать src, зависящий от ordinary value", () => {
    const invalidNode = {
      type: "meta",
      tag: "meta-for",
      src: { data: "/value/operation", expr: "zavx0z/git-${_[0]}" },
    }

    expect(() => normalizeToWimp(invalidNode as NodeMeta)).toThrow("src должен быть уже статичным результатом выбора")
  })

  test("не должен принимать src от mass", () => {
    const invalidNode = {
      type: "meta",
      tag: "meta-for",
      src: { data: "/mass/items", expr: "_[0]" },
    }

    expect(() => normalizeToWimp(invalidNode as NodeMeta)).toThrow("src должен быть уже статичным результатом выбора")
  })

  test("не должен выполнять выбор по selector field enum", async () => {
    const ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
    const selectorNode = ast.gravity?.[0] as NodeMeta

    expect(() => normalizeToWimp(selectorNode)).toThrow("src должен быть уже статичным результатом выбора")
  })

  test("не должен принимать невалидный hub-адрес", () => {
    const invalidAddresses = ["", "invalid", "no-slash", "/leading-slash", "trailing-slash/"]

    for (const address of invalidAddresses) {
      const invalidNode = { type: "meta", tag: "meta-for", src: address }
      expect(() => normalizeToWimp(invalidNode as NodeMeta)).toThrow("hub-адрес")
    }
  })
})

describe("Wimp — интеграция контракта", () => {
  let ast: MetaAST

  beforeAll(async () => {
    ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
  })

  test("не должен нормализовать selector-src из gravity[0] как Wimp", () => {
    const gravityNode = ast.gravity?.[0] as NodeMeta

    expect(() => normalizeToWimp(gravityNode)).toThrow("src должен быть уже статичным результатом выбора")
  })

  test("должен нормализовать вложенную meta-ссылку как статический Wimp", () => {
    const gravityNode = ast.gravity?.[1] as any
    const childNode = gravityNode?.child?.[0] as NodeMeta
    const wimp = normalizeToWimp(childNode)

    expect(wimp.kind).toBe("wimp")
    expect(wimp.src).toBe("zavx0z/git-error")
  })

  test("не должен подменять собой Fuzzy/Macho/Axion-семантику", () => {
    const wimp: Wimp = {
      id: "wimp:zavx0z/git-error",
      kind: "wimp",
      src: "zavx0z/git-error",
      children: new Set(),
    }

    expect("basis" in wimp).toBe(false)
    expect("expr" in wimp).toBe(false)
    expect("particles" in wimp).toBe(false)
    expect(wimp.children).toEqual(new Set())
  })

  test("должен соответствовать уже выбранной статической связности из реального AST", () => {
    const gravityNode = ast.gravity?.[1] as any
    const childNode = gravityNode?.child?.[0] as NodeMeta

    expect(childNode).toEqual({
      src: "zavx0z/git-error",
      tag: "meta-for",
      type: "meta",
      fields: {
        data: "/value/error",
        expr: "{ message: _[0] }",
      },
    })
  })
})
