import {hostPortFromArgs, serveStaticFile} from "@quantum/server"
import {join} from "path"
//@ts-ignore
import indexHTML from "./dev/index.html" with {type: "text"}

const pathWebSocket = '/debug'
const channel = 'main'
const {host, port} = hostPortFromArgs()

const server = Bun.serve<Record<string, any>>({
  port: port,
  hostname: host,
  development: false,
  static: {
    "/": new Response(indexHTML, {headers: {"Content-Type": "text/html"}})
  },
  fetch(req): any {
    const url = new URL(req.url)
    if (url.pathname === pathWebSocket) {
      const success = server.upgrade(req)
      return success ? undefined : new Response("WebSocket upgrade error", {status: 400})
    }

    if (url.pathname.includes("quantum/machine") || url.pathname.includes("quantum/debug")) {
      const path = join(import.meta.dirname, '../../', url.pathname, 'build')
      return serveStaticFile(path)
    }
    return serveStaticFile(join(import.meta.dirname, "build", url.pathname))
  },
  websocket: {
    idleTimeout: 0,
    open(ws) {
      console.log(`подключился к каналу ${channel}`)
      ws.subscribe(channel)
    },
    message(ws, message) {
      const dataObject = JSON.parse(message as string)
      if (dataObject.patch && dataObject.patch?.op === "add") {
        ws.data = dataObject
        server.publish(channel, message)
      } else if (dataObject.patch.op === 'test' && dataObject.patch.path === '/') {
        server.publish(channel, message)
      } else if (dataObject.patch && dataObject.patch?.op === "replace") {
        server.publish(channel, message)
      }
    },
    close(ws) {
      ws.unsubscribe(channel)
      if (ws.data && ws.data.meta) {
        console.log(`удалился ${channel}`)
        server.publish(channel, JSON.stringify({
          meta: ws.data.meta,
          patch: {op: "remove", path: `/${ws.data.patch.value.name}`}
        }))
      }
      console.log(`отключился от канала ${channel}`)
    },
  }
})
console.log(`✅  Сервер разработки запущен: ${server.url}`)
