import { MetaFor } from "./dist/metafor.js"

MetaFor("user")
  .context((types) => ({
    name: types.string.required("Гость"),
    age: types.number.optional(),
  }))
  .states({
    guest: {
      user: { name: "Пользователь" },
    },
    user: {
      guest: {},
    },
  })
  .actions((action) => ({
    guest: action(({ context }) => {
      return { name: context.name }
    })
      .success(({ update, data }) => update({ name: data.name, age: 18 }))
      .error(({ update, error }) => update({ name: error.message })),
  }))
