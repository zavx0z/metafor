import {expect, test} from "bun:test"
import {MetaFor} from "./index"

const fields = () => MetaFor("lifecycle").fields(field => ({
  request: field.string.optional(), online: field.boolean.required(false), count: field.number.required(0),
  mode: field.enum("view", "edit").required("view"), items: field.array.required([]),
}))
const finish = (chain: ReturnType<typeof fields>) => chain.superposition({waiting: null}).mass(() => ({})).energy().processes().reactions().matter().bulk()

test("optional lifecycle preserves ordinary typed Fields and serializes detached metadata", () => {
  const input = {started: {field: "request", value: "recover"}, stopping: {field: "request", value: "stop"}}
  const next = fields().lifecycle(input as never)
  input.started.value = "changed"
  const meta = next.superposition({waiting: null}).mass(() => ({})).energy().processes().reactions().matter().bulk()
  expect(meta.lifecycle).toEqual({started: {field: "request", value: "recover"}, stopping: {field: "request", value: "stop"}})
  expect(JSON.parse(JSON.stringify(meta)).lifecycle).toEqual(meta.lifecycle)
  expect(meta.fields.map(field => field.key)).toEqual(["request", "online", "count", "mode", "items"])
  expect(finish(fields())).not.toHaveProperty("lifecycle")
})

test("lifecycle rejects unknown events, topology Fields and mismatched scalar values", () => {
  for (const input of [
    {started: {field: "missing", value: "recover"}},
    {started: {field: "mode", value: "view"}},
    {started: {field: "items", value: []}},
    {started: {field: "request", value: 1}},
    {started: {field: "online", value: null}},
    {started: {field: "count", value: Infinity}},
    {started: {field: "request", value: "recover", process: "launch"}},
    {resumed: {field: "request", value: "recover"}},
  ]) expect(() => fields().lifecycle(input as never)).toThrow("lifecycle")
  expect(() => fields().lifecycle({started: {field: "request", value: null}})).not.toThrow()
})
