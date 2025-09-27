import "../schema/index"
import { Store } from "./store"
import { Actor } from "../core"

const store = await Store()
const renderer: any = () => {}
await Actor.create({ store, env: "web:w", renderer, src: "/zavx0z/app.js" })

// console.log("MetaFor элемент создан в воркере:", metaForElement)

// Обработка сообщений от главного потока
// self.onmessage = (event) => {
//   console.log("Воркер получил сообщение:", event.data)

//   // Отправляем ответ обратно
//   self.postMessage({
//     type: "response",
//     original: event.data,
//     timestamp: Date.now(),
//     message: "Ответ от воркера с эмуляцией DOM",
//   })
// }

export type { Message } from "../core"
