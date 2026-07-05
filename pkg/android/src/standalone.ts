import homepage from "./index.html";
import {
  androidKeyResponse,
  androidScreencapResponse,
  androidSizeResponse,
  androidSwipeResponse,
  androidTapResponse,
  createAndroidH264SocketData,
  createAndroidSocketData,
  handleAndroidSocketMessage,
  startAndroidH264Loop,
  startAndroidLoop,
  stopAndroidStream,
  type AndroidSocketData,
} from "./server.ts";

const hostname = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3007");

const server = Bun.serve<AndroidSocketData>({
  hostname,
  port,
  routes: {
    "/": homepage,
    "/favicon.ico": { GET: () => new Response(null, { status: 204 }) },
    "/android/size": { GET: androidSizeResponse },
    "/android/screencap": { GET: androidScreencapResponse },
    "/android/tap": { POST: androidTapResponse },
    "/android/swipe": { POST: androidSwipeResponse },
    "/android/key": { POST: androidKeyResponse },
    "/android/stream": {
      GET(req, bunServer) {
        const upgraded = bunServer.upgrade(req, {
          data: createAndroidSocketData({}),
        });
        return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
      },
    },
    "/android/h264": {
      GET(req, bunServer) {
        const upgraded = bunServer.upgrade(req, {
          data: createAndroidH264SocketData({}),
        });
        return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
      },
    },
  },
  development:
    process.env.NODE_ENV === "production"
      ? false
      : {
          hmr: true,
          console: true,
        },
  websocket: {
    idleTimeout: 0,
    maxPayloadLength: 1024 * 1024,
    open(ws) {
      if (ws.data.kind === "android-h264") {
        startAndroidH264Loop(ws);
        return;
      }

      startAndroidLoop(ws);
    },
    message(_ws, raw) {
      handleAndroidSocketMessage(typeof raw === "string" ? raw : Buffer.from(raw));
    },
    close(ws) {
      stopAndroidStream(ws.data);
    },
  },
});

console.log(`Android ADB stream listening at ${server.url}`);
