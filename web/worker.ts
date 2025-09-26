import { initDOMEmulation } from "./dom-emulation"
initDOMEmulation()
import "../schema/index"
import { Store } from "./store"
import { MetaForFabric } from "../core"

const store = await Store()
const render = () => {}
MetaForFabric({ store, render, env: "web:w" })

// Создаем элемент meta-for в эмулированном DOM
const metaForElement = document.createElement("meta-for")
metaForElement.setAttribute("src", "/zavx0z/app.js")
metaForElement.setAttribute("id", "1")
document.body.appendChild(metaForElement)

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

export type { Message } from "../core/index.t"
