import {describe, expect, test} from "bun:test"
import type {MatterFields, MatterParticle, MatterSchema} from "@metafor/types/metafor/matter"
import {resolveMatterFuzzySources, validateMatterSchema} from "shared/metafor/matter"

const fields: MatterFields = {
  mode: {type: "enum", values: ["card", "table"]},
  items: {type: "array"},
  title: {type: "string"},
}

const wimp = (src = "demo/child"): MatterParticle => ({kind: "wimp", src})

describe("shared normalized Matter semantics", () => {
  test("resolves normalized Fuzzy sources without executing JavaScript", () => {
    expect(resolveMatterFuzzySources(
      {data: "mode", expr: '${_[0] === "card" ? "demo/card" : "demo/table"}'},
      fields,
    )).toEqual(["demo/card", "demo/table"])

    expect(() => resolveMatterFuzzySources(
      {data: "mode", expr: "demo/${create(_[0])}"},
      fields,
    )).toThrow("is not a supported normalized enum projection")
  })

  test("accepts state Axion, enum Fuzzy, array Macho and direct runtime projections", () => {
    const schema: MatterSchema = [
      {
        kind: "axion",
        predicateBinding: {data: "/state", expr: "_[0] === 'ready'"},
        children: [{edgeSlot: "then", particle: wimp("demo/ready")}],
      },
      {
        kind: "fuzzy",
        fuzzyKind: "dynamic-meta",
        predicateBinding: {data: "mode", expr: "`demo/${_[0]}`"},
        children: [
          {edgeSlot: "branch", particle: wimp("demo/card")},
          {edgeSlot: "branch", particle: wimp("demo/table")},
        ],
      },
      {
        kind: "macho",
        collectionBinding: {data: "items"},
        children: [{
          edgeSlot: "child",
          particle: {
            kind: "wimp",
            src: "demo/item",
            massBinding: {
              data: ["/mass/source", "/mass/other"],
              expr: "{ target: _[0], alternate: _[1] }",
              directMass: {kind: "keys", entries: [
                {target: "target", source: "source"},
                {target: "alternate", source: "other"},
              ]},
            },
            energyBinding: {data: "/energy/socket", expr: "{ socket: _[0] }"},
          },
        }],
      },
    ]

    expect(() => validateMatterSchema(schema, fields)).not.toThrow()
  })

  test("requires exact owner/repository addresses", () => {
    expect(() => validateMatterSchema([wimp("demo/base/child")], fields)).toThrow(
      'Matter violation at "matter[0].src": src "demo/base/child" is not a valid Meta address.',
    )
  })

  test("keeps topology basis separated by particle kind", () => {
    expect(() => validateMatterSchema([{
      kind: "axion",
      predicateBinding: {data: "mode"},
    }], fields)).toThrow('Axion predicate uses field "mode" of type "enum"')

    expect(() => validateMatterSchema([{
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {data: "items"},
      children: [{edgeSlot: "branch", particle: wimp()}],
    }], fields)).toThrow('dynamic src uses field "items" of type "array"')

    expect(() => validateMatterSchema([{
      kind: "macho",
      collectionBinding: {data: "title"},
    }], fields)).toThrow('Macho collection uses field "title" of type "string"')
  })

  test("requires one resolved WIMP branch for every dynamic enum variant", () => {
    expect(() => validateMatterSchema([{
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {data: "mode"},
      children: [{edgeSlot: "branch", particle: wimp("demo/card")}],
    }], fields)).toThrow("expected 2, received 1")

    expect(() => validateMatterSchema([{
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {data: "mode"},
      children: [
        {edgeSlot: "branch", particle: {kind: "macho", collectionBinding: {data: "items"}}},
        {edgeSlot: "branch", particle: wimp("demo/table")},
      ],
    }], fields)).toThrow("Fuzzy branches must contain WIMP particles")

    expect(() => validateMatterSchema([{
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {data: "mode", expr: "demo/${_[0]}"},
      children: [
        {edgeSlot: "branch", particle: wimp("demo/wrong")},
        {edgeSlot: "branch", particle: wimp("demo/also-wrong")},
      ],
    }], fields)).toThrow('Fuzzy branch src "demo/wrong" does not match enum branch 0; expected "demo/card"')

    expect(() => validateMatterSchema([{
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {
        data: "mode",
        expr: '${_[0] === "card" ? "demo/card" : "demo/table"}',
      },
      children: [
        {edgeSlot: "branch", particle: wimp("demo/card")},
        {edgeSlot: "branch", particle: wimp("demo/table")},
      ],
    }], fields)).not.toThrow()
  })

  test("enforces edge ownership and Axion conditional ordering", () => {
    expect(() => validateMatterSchema([{
      kind: "wimp",
      src: "demo/root",
      children: [{edgeSlot: "then", particle: wimp()}],
    } as MatterParticle], fields)).toThrow("Matter wimp accepts only child edges")

    expect(() => validateMatterSchema([{
      kind: "axion",
      predicateBinding: {data: "/state"},
      children: [
        {edgeSlot: "else", particle: wimp("demo/fallback")},
        {edgeSlot: "then", particle: wimp("demo/primary")},
      ],
    }], fields)).toThrow("Axion then children must precede else children")

    expect(() => validateMatterSchema([{
      kind: "axion",
      predicateBinding: {data: "/state"},
      children: [
        {edgeSlot: "child", particle: wimp("demo/logical")},
        {edgeSlot: "else", particle: wimp("demo/conditional")},
      ],
    }], fields)).toThrow("Axion cannot mix logical and conditional child edges")
  })

  test("requires domain roots and exact direct Mass metadata", () => {
    expect(() => validateMatterSchema([{
      kind: "wimp",
      src: "demo/child",
      massBinding: {data: "/energy/socket", directMass: {kind: "whole"}},
    }], fields)).toThrow('mass binding dependency "/energy/socket" must use /mass')

    expect(() => validateMatterSchema([{
      kind: "wimp",
      src: "demo/child",
      massBinding: {data: "/mass/cache"},
    }], fields)).toThrow("mass binding must include normalized directMass metadata")

    expect(() => validateMatterSchema([{
      kind: "wimp",
      src: "demo/child",
      massBinding: {
        data: ["/mass/cache", "/mass/session"],
        directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
      },
    }], fields)).toThrow("directMass must map every declared /mass/<key> dependency exactly once")

    expect(() => validateMatterSchema([{
      kind: "wimp",
      src: "demo/child",
      energyBinding: {data: "/energy/socket", directMass: {kind: "whole"}},
    }], fields)).toThrow("energy binding must not declare directMass metadata")
  })

  test("rejects executable runtime bindings", () => {
    expect(() => validateMatterSchema([{
      kind: "wimp",
      src: "demo/child",
      energyBinding: {data: "/energy/socket", expr: "{socket: () => _[0]}"},
    }], fields)).toThrow("energy binding must not create or call executable resources")

    expect(() => validateMatterSchema([{
      kind: "wimp",
      src: "demo/child",
      massBinding: {
        data: "/mass/cache",
        expr: "{cache: create(_[0])}",
        directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
      },
    }], fields)).toThrow("mass binding must not create or call executable resources")
  })

  test("bounds depth, width and total particle count", () => {
    const nested: MatterParticle = {
      kind: "wimp",
      src: "demo/root",
      children: [{edgeSlot: "child", particle: wimp("demo/leaf")}],
    }
    expect(() => validateMatterSchema([nested], fields, {maxDepth: 0})).toThrow("exceeds 0 nested levels")
    expect(() => validateMatterSchema([wimp(), wimp("demo/two")], fields, {maxChildren: 1})).toThrow(
      "root has 2 particles; limit is 1",
    )
    expect(() => validateMatterSchema([nested], fields, {maxParticles: 1})).toThrow("tree exceeds 1 particles")
  })
})
