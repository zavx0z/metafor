import { MetaFor } from "@metafor/dsl"

export default MetaFor("git-start-init", { desc: "Git start-init — команда git" })
  .fields((field) => ({
    error: field.string.optional({ label: "Ошибка" }),
  }))
  .superposition({})
  .mass({})
  .processes(() => ({}))
  .reactions(() => [])
  .matter()
  .bulk()
