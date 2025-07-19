import { MetaFor } from "./dist/metafor.js"

MetaFor('user').context(types => ({
  name: types.string.required('Гость'),
  age: types.number.optional()
}))
