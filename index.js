import {createContext, types} from "@zavx0z/context"

const {context, update, onUpdate} = createContext( {
  name: types.string.required()({title: "Имя"}),
  version: types.number(),
  other: types.string()
})
console.log(context.version)
console.log(context.other)
onUpdate((patches) => {
  console.log(patches)
})
update({name: "open", version: 2, other: null})

console.log(context._title.name)
setTimeout(()=>{
  context._title.name = "Name"
  console.log(context._title.name)
}, 1000)
