import { describe, expect, test } from "bun:test";
import {
  connectCommonChat,
  receiveCommonChatEvent,
  stopCommonChat,
} from "../../../cluster/zavx0z/lada-chat/actions/realtime.ts";
import acknowledgeInbox from "../../../cluster/zavx0z/lada-chat/actions/inbox-ack.ts";

const jsonMass = (initial = null) => {
  let source = initial === null ? "" : JSON.stringify(initial);
  return {
    handle: {
      readBytes: async () => new TextEncoder().encode(source),
      readText: async () => source,
      readJson: async () => JSON.parse(source),
      write: async (value) => { source = JSON.stringify(value); },
    },
    read: () => source === "" ? null : JSON.parse(source),
  };
};

class FakeSocket {
  readyState = WebSocket.CONNECTING;
  listeners = new Map();
  sent = [];

  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  open() {
    this.readyState = WebSocket.OPEN;
    for (const listener of this.listeners.get("open") ?? []) listener({});
  }

  message(message) {
    const data = JSON.stringify({ type: "msg:new", message });
    for (const listener of this.listeners.get("message") ?? []) listener({ data });
  }

  send(data) { this.sent.push(data); }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

const message = (message_key, body, extra = {}) => ({
  message_key,
  room_key: "common-room",
  body,
  author_self: false,
  created_at: Number(message_key.replace("message-", "")),
  ...extra,
});

describe("Lada addressed inbox proof", () => {
  test("joins paged history and realtime into one durable addressed path", async () => {
    const session = jsonMass({
      cookie: "p1_sso=test-session",
      userId: "lada-id",
      login: "lada",
    });
    const messages = jsonMass();
    const outbox = jsonMass();
    const socket = new FakeSocket();
    const energy = {};
    const mass = {
      ssoSession: session.handle,
      chatMessages: messages.handle,
      chatOutbox: outbox.handle,
    };
    const history = [
      message("message-1", "Обычное сообщение"),
      message("message-2", "@lada первый", { mentions: [{ login: "lada", start_utf16: 0 }] }),
      message("message-3", "Ответ Лады", { author_self: true }),
      message("message-4", "Вопрос @lada", { mentions: [{ login: "lada", start_utf16: 7 }] }),
    ];
    const fetched = [];
    let historyAfterOpen = true;

    const connected = await connectCommonChat({
      mass,
      energy,
      signal: new AbortController().signal,
    }, {
      baseUrl: "https://admin.test",
      now: () => new Date("2026-08-05T01:00:00.000Z"),
      openWebSocket: () => {
        queueMicrotask(() => socket.open());
        return socket;
      },
      fetch: async (input) => {
        const url = String(input);
        fetched.push(url);
        if (url.endsWith("/api/chat/rooms")) {
          return Response.json({ rooms: [{ room_key: "common-room", title: "Общая", kind: "common" }] });
        }
        historyAfterOpen &&= socket.readyState === WebSocket.OPEN;
        return url.includes("before=message-3")
          ? Response.json({ messages: history.slice(0, 2), hasMore: false })
          : Response.json({ messages: history.slice(2), hasMore: true });
      },
    });

    expect(connected.historyCount).toBe(4);
    expect(historyAfterOpen).toBe(true);
    expect(fetched.filter((url) => url.includes("/messages"))).toHaveLength(2);
    expect(messages.read()).toMatchObject({
      messages: history,
      handledMessageKeys: [],
      inFlight: null,
    });

    const first = await receiveCommonChatEvent({
      mass,
      energy,
      signal: new AbortController().signal,
    });
    expect(first).toMatchObject({ messageKey: "message-2", body: "@lada первый" });
    await acknowledgeInbox({ mass, signal: new AbortController().signal });

    const second = await receiveCommonChatEvent({
      mass,
      energy,
      signal: new AbortController().signal,
    });
    expect(second).toMatchObject({ messageKey: "message-4", body: "Вопрос @lada" });
    await acknowledgeInbox({ mass, signal: new AbortController().signal });

    const third = receiveCommonChatEvent({
      mass,
      energy,
      signal: new AbortController().signal,
    });
    socket.message(history[3]);
    socket.message(message("message-5", "@lada без server evidence"));
    socket.message(message("message-6", "😀 @lada второй", {
      mentions: [{ login: "lada", start_utf16: 3 }],
    }));
    expect(await third).toMatchObject({ messageKey: "message-6", body: "😀 @lada второй" });

    expect(await receiveCommonChatEvent({
      mass,
      energy,
      signal: new AbortController().signal,
    })).toMatchObject({ messageKey: "message-6", body: "😀 @lada второй" });
    await acknowledgeInbox({ mass, signal: new AbortController().signal });
    expect(messages.read()).toMatchObject({
      handledMessageKeys: ["message-2", "message-4", "message-6"],
      inFlight: null,
    });
    stopCommonChat({ energy });
  });
});
