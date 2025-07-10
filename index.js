import {createContext, types} from "@zavx0z/context"

const {context, update, onUpdate} = createContext({
  name: types.string.required(),
  version: types.number(),
})

console.log(context)

onUpdate((patches) => {
  console.log(patches)
})
update({name: "open"})
