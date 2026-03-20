import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-start-clone", { desc: "Git start-clone — команда git" })
  .fields((field) => ({
    error: field.string.optional({ label: "Ошибка" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .matter()
  .bulk()
