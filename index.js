import { MetaFor } from "./dist/metafor.js"

MetaFor("user")
  .context((types) => ({
    name: types.string.required("Гость"),
    age: types.number.optional(),
  }))
  .states({
    guest: {
      process: {
        action: ({ context }) => {
          return {name: context.name}
        },
        success: ({ update, data }) => {
          update({ name: data.name, age: 18 })
        },
        error: ({ update }) => {
          update({ name: "Гость" })
        },
      },
      to: {
        user: {
          name: "Гость"
        },
      },
    },
    user: {
      to: {
        guest: {},
      },
    },
  })
