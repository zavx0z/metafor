import {MetaFor} from "../../index"

const input = MetaFor("typed-lifecycle").fields(field => ({
  request: field.string.optional(), online: field.boolean.required(false), count: field.number.required(0),
  mode: field.enum("view", "edit").required("view"), items: field.array.required([]),
}))
input.lifecycle({started: {field: "request", value: "recover"}, stopping: {field: "request", value: null}})
input.lifecycle({started: {field: "online", value: true}, stopping: {field: "count", value: 0}})

const invalid = () => {
  // @ts-expect-error lifecycle cannot target topology enum
  input.lifecycle({started: {field: "mode", value: "view"}})
  // @ts-expect-error lifecycle cannot target topology array
  input.lifecycle({started: {field: "items", value: []}})
  // @ts-expect-error lifecycle cannot target undeclared Fields
  input.lifecycle({started: {field: "missing", value: "recover"}})
  // @ts-expect-error scalar type stays correlated with its selected Field
  input.lifecycle({started: {field: "request", value: 1}})
  // @ts-expect-error required boolean cannot accept null
  input.lifecycle({started: {field: "online", value: null}})
  // @ts-expect-error native events are limited to declared lifecycle contract
  input.lifecycle({resumed: {field: "request", value: "recover"}})
  // @ts-expect-error lifecycle is declared at most once after Fields
  input.lifecycle({}).lifecycle({})
}
void invalid
