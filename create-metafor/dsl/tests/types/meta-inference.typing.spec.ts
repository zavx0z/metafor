import {describe, expect, test} from "bun:test"
import {MetaFor} from "../../index"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {InferMetaEnergy, InferMetaFields, InferMetaMass, InferMetaStates, InferMetaValues} from "@metafor/types/metafor/schema"
import type {InferenceProcess} from "./fixtures/inferred-process"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T

export const inferredMeta = MetaFor("inferred-contract")
  .fields(field => ({
    title: field.string.required(""),
    command: field.string.optional(),
    mode: field.enum("view", "edit").required("view"),
    choice: field.enum("one", "two").optional(),
    enabled: field.boolean.required(false),
  }))
  .superposition({idle: {ready: {command: {null: false}}}, ready: null})
  .mass(mass => ({profile: mass.json(), payload: mass.binary()}))
  .energy<{socket: WebSocket}>()
  .processes(process => [
    process("ready").action(async ({field, value, mass, energy, signal, self}): Promise<string> => {
      const implementation = await import("./fixtures/inferred-process")
      return implementation.default({field, value, mass, energy, signal, self, proof: value.command satisfies string})
    }),
  ])
  .reactions()
  .matter()
  .bulk()

type Meta = typeof inferredMeta
type Fields = InferMetaFields<Meta>
type Values = InferMetaValues<Meta>
type Mass = InferMetaMass<Meta>
type Energy = InferMetaEnergy<Meta>
type States = InferMetaStates<Meta>
type Proof = [
  Assert<Equal<keyof Fields, "title" | "command" | "mode" | "choice" | "enabled">>,
  Assert<Equal<Fields["title"]["required"], true | undefined>>,
  Assert<Equal<Values["title"], string>>,
  Assert<Equal<Values["command"], string | null>>,
  Assert<Equal<Values["mode"], "view" | "edit">>,
  Assert<Equal<Values["choice"], "one" | "two" | null>>,
  Assert<Equal<Values["enabled"], boolean>>,
  Assert<Equal<keyof Mass, "profile" | "payload">>,
  Assert<Equal<Mass["profile"], MassHandle>>,
  Assert<Equal<Mass["payload"], MassHandle>>,
  Assert<Equal<Energy, {socket: WebSocket}>>,
  Assert<Equal<States, "idle" | "ready">>,
  Assert<Equal<InferenceProcess.Input["value"], Values>>,
  Assert<Equal<InferenceProcess.Input["mass"], Mass>>,
  Assert<Equal<InferenceProcess.Input["energy"], Energy>>,
]

const rejectsIncorrectTypes = (input: InferenceProcess.Input) => {
  // @ts-expect-error Required Field cannot become null
  const title: Values["title"] = null
  // @ts-expect-error Optional Field retains null outside narrowed process state
  const command: string = input.value.command
  // @ts-expect-error Enum values remain the declaration's literal set
  const mode: Values["mode"] = "missing"
  // @ts-expect-error Unknown Fields are absent
  input.value.missing
  // @ts-expect-error Mass preserves declared keys
  input.mass.missing
  // @ts-expect-error Mass handles do not become Energy resources
  const socket: WebSocket = input.mass.profile
  // @ts-expect-error Energy resources do not become Mass handles
  const profile: MassHandle = input.energy.socket
  // @ts-expect-error State union preserves declared names
  const state: States = "missing"
  void [title, command, mode, socket, profile, state]
}

describe("final Meta inferred contract", () => {
  test("retains type-only context without adding runtime metadata", () => {
    expect(Object.getOwnPropertySymbols(inferredMeta)).toEqual([])
    expect(Object.keys(inferredMeta)).toEqual(["name", "superposition", "fields", "mass", "processes"])
    const wire = JSON.parse(JSON.stringify(inferredMeta))
    expect(wire.mass).toEqual([{key: "profile", format: "json"}, {key: "payload", format: "binary"}])
    expect(wire.fields.map((field: {key: string}) => field.key)).toEqual(["title", "command", "mode", "choice", "enabled"])
    expect(typeof rejectsIncorrectTypes).toBe("function")
  })
})
