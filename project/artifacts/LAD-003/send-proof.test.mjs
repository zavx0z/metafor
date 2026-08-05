import { describe, expect, test } from "bun:test";

const modelUrl = new URL(
  "../../../cluster/zavx0z/lada-model/actions/chat.ts",
  import.meta.url,
);
const prepareUrl = new URL(
  "../../../cluster/zavx0z/lada/actions/prepare-reply-send.ts",
  import.meta.url,
);
const realtimeUrl = new URL(
  "../../../cluster/zavx0z/lada-chat/actions/realtime.ts",
  import.meta.url,
);
const peerAvailable = await Promise.all(
  [modelUrl, prepareUrl, realtimeUrl].map((url) => Bun.file(url).exists()),
).then((results) => results.every(Boolean));

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

  emit(payload) {
    const event = { data: JSON.stringify(payload) };
    for (const listener of this.listeners.get("message") ?? []) listener(event);
  }

  send(data) {
    this.sent.push(data);
    const request = JSON.parse(data);
    queueMicrotask(() => {
      this.emit({
        type: "msg:ack",
        client_message_id: request.client_message_id,
      });
      this.emit({
        type: "msg:new",
        message: {
          message_key: "sent-message-1",
          room_key: request.room_key,
          client_message_id: request.client_message_id,
          body: request.body,
          author_self: true,
        },
      });
    });
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

const connect = async (realtime, mass, socket, energy) => realtime.connectCommonChat({
  mass,
  energy,
  signal: new AbortController().signal,
}, {
  baseUrl: "https://admin.test",
  now: () => new Date("2026-08-05T02:00:00.000Z"),
  openWebSocket: () => {
    queueMicrotask(() => socket.open());
    return socket;
  },
  fetch: async (input) => String(input).endsWith("/api/chat/rooms")
    ? Response.json({
      rooms: [{ room_key: "common-room", title: "Общая", kind: "common" }],
    })
    : Response.json({ messages: [], hasMore: false }),
});

describe.skipIf(!peerAvailable)("Lada causal reply and Send Tool proof", () => {
  test("sends persona as system and the addressed message as user", async () => {
    const { LADA_SYSTEM_PROMPT, runOllamaChat } = await import(modelUrl.href);
    const messages = jsonMass();
    let requestBody = null;
    let nextId = 0;

    const result = await runOllamaChat({
      mass: { messages: messages.handle },
      value: { prompt: "@lada Привет", model: "qwen3.5:9b" },
      signal: new AbortController().signal,
    }, {
      now: () => new Date("2026-08-05T02:00:00.000Z"),
      randomUUID: () => `id-${++nextId}`,
      fetch: async (_input, init) => {
        requestBody = JSON.parse(init.body);
        return Response.json({
          message: { role: "assistant", content: "Привет! Я на связи." },
          done: true,
        });
      },
    });

    expect(requestBody.think).toBe(false);
    expect(requestBody.messages).toEqual([
      { role: "system", content: LADA_SYSTEM_PROMPT },
      { role: "user", content: "@lada Привет" },
    ]);
    expect(messages.read().map(({ role }) => role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
    expect(result.assistantContent).toBe("Привет! Я на связи.");
  });

  test("persists one causal intent and completes it on ack plus echo", async () => {
    const { prepareReplySend } = await import(prepareUrl.href);
    const realtime = await import(realtimeUrl.href);
    const session = jsonMass({
      cookie: "p1_sso=test-session",
      userId: "lada-id",
      login: "lada",
    });
    const messages = jsonMass();
    const outbox = jsonMass();
    const mass = {
      ssoSession: session.handle,
      chatMessages: messages.handle,
      chatOutbox: outbox.handle,
    };
    const socket = new FakeSocket();
    const energy = {};
    await connect(realtime, mass, socket, energy);

    const intention = await prepareReplySend({
      mass: { chatOutbox: outbox.handle },
      signal: new AbortController().signal,
      value: {
        replyDraft: "Привет! Я на связи.",
        replyToMessageKey: "source-message-1",
        roomKey: "common-room",
      },
    }, {
      now: () => new Date("2026-08-05T02:01:00.000Z"),
      randomUUID: () => "client-message-1",
    });

    expect(outbox.read().messages).toEqual([expect.objectContaining({
      clientMessageId: "client-message-1",
      replyToMessageKey: "source-message-1",
      status: "intent",
    })]);

    const receipt = await realtime.sendCommonChatMessage({
      mass,
      energy,
      signal: new AbortController().signal,
      roomKey: "common-room",
      body: intention.body,
    }, {
      now: () => new Date("2026-08-05T02:02:00.000Z"),
      randomUUID: () => "must-not-replace-intent-id",
      acknowledgementMs: 100,
    });

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]).client_message_id).toBe("client-message-1");
    expect(receipt).toEqual({
      clientMessageId: "client-message-1",
      messageKey: "sent-message-1",
    });
    expect(outbox.read().messages).toEqual([expect.objectContaining({
      clientMessageId: "client-message-1",
      replyToMessageKey: "source-message-1",
      status: "sent",
      messageKey: "sent-message-1",
    })]);

    await outbox.handle.write({ messages: [{
      clientMessageId: "failed-message-1",
      roomKey: "common-room",
      body: "Не повторять скрыто",
      status: "error",
      createdAt: "2026-08-05T02:03:00.000Z",
      replyToMessageKey: "source-message-2",
      error: "Admin error",
    }] });
    expect(realtime.sendCommonChatMessage({
      mass,
      energy,
      signal: new AbortController().signal,
      roomKey: "common-room",
      body: "Не повторять скрыто",
    })).rejects.toThrow("Предыдущая отправка этого намерения завершилась ошибкой");
    expect(socket.sent).toHaveLength(1);
    realtime.stopCommonChat({ energy });
  });
});
