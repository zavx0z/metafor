import { BaseMonadTransport } from "../../../shared/transport/monad/base.ts";
import { MonadRpcPeer } from "../../../shared/transport/monad/peer.ts";

const ADDRESS = "zavx0z/lada-chat";
const ACTION_PATH = "cluster/zavx0z/lada-chat/actions/realtime.ts";

const replaceExact = (source: string, before: string, after: string): string => {
  const start = source.indexOf(before);
  if (start < 0 || source.indexOf(before, start + before.length) >= 0) {
    throw new Error(`Expected one source range, found a different count: ${before.slice(0, 80)}`);
  }
  return source.slice(0, start) + after + source.slice(start + before.length);
};

const replaceBetween = (
  source: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
): string => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Source range is absent: ${startMarker}`);
  return source.slice(0, start) + replacement + "\n\n" + source.slice(end);
};

const currentAction = await Bun.file(ACTION_PATH).text();
let nextAction = currentAction;
if (!currentAction.includes("export default connectCommonChat;")) {
nextAction = replaceExact(
  nextAction,
  `export type ChatMessagesMass = {
  roomKey: string;
  syncedAt: string;
  messages: ChatMessage[];
};`,
  `export type ChatMessagesMass = {
  roomKey: string;
  syncedAt: string;
  messages: ChatMessage[];
  handledMessageKeys?: string[];
  inFlight?: { messageKey: string; body: string } | null;
};`,
);

nextAction = replaceExact(
  nextAction,
  `const payloadFromEvent = (raw: unknown): Record<string, unknown> | null => {`,
  `const historyHasMore = (body: unknown): boolean =>
  isRecord(body) && (body.hasMore === true || body.has_more === true);

const explicitMentionFor = (message: ChatMessage, session: SsoSession): boolean => {
  const body = messageBody(message);
  if (body === null || !Array.isArray(message.mentions)) return false;
  const expectedLogin = session.login.toLowerCase();
  return message.mentions.some((candidate) => {
    if (!isRecord(candidate)) return false;
    const login = scalar(candidate, ["login"]);
    const start = candidate.start_utf16 ?? candidate.startUtf16;
    if (login === null || login.toLowerCase() !== expectedLogin) return false;
    if (typeof start !== "number" || !Number.isSafeInteger(start) || start < 0) return false;
    return body.slice(start, start + login.length + 1).toLowerCase() === \`@\${expectedLogin}\`;
  });
};

const handledKeysFrom = (mass: ChatMessagesMass): string[] =>
  Array.isArray(mass.handledMessageKeys)
    ? [...new Set(mass.handledMessageKeys.filter((key): key is string => typeof key === "string"))]
    : [];

const inFlightFrom = (
  mass: ChatMessagesMass,
): { messageKey: string; body: string } | null => {
  const value = mass.inFlight;
  return isRecord(value)
    && typeof value.messageKey === "string"
    && typeof value.body === "string"
    ? { messageKey: value.messageKey, body: value.body }
    : null;
};

const payloadFromEvent = (raw: unknown): Record<string, unknown> | null => {`,
);

const connectReplacement = `export async function connectCommonChat(
  { mass, energy, signal }: ConnectParams,
  dependencies: RealtimeDependencies = {},
): Promise<{
  roomKey: string;
  roomTitle: string;
  historyCount: number;
  ownMessageExists: boolean;
}> {
  assertChatMass(mass);
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const baseUrl = (dependencies.baseUrl ?? DEFAULT_ADMIN_URL).replace(/\\/+$/, "");
  const now = dependencies.now ?? (() => new Date());
  const session = await sessionFromMass(mass.ssoSession);
  if (session === null) throw new Error("Сохранённая SSO-сессия Лады недоступна.");
  signal.throwIfAborted();
  const headers = { cookie: session.cookie };

  const roomsBody = await responseJson(await fetchImpl(
    \`\${baseUrl}/api/chat/rooms\`,
    { headers, signal },
  ), "Получение комнат");
  const room = roomFrom(roomsBody);

  stopCommonChat({ energy });
  const openWebSocket = dependencies.openWebSocket ?? defaultOpenWebSocket;
  const realtimeUrl = \`\${baseUrl.replace(/^http/, "ws")}/api/chat/ws\`;
  const socket = openWebSocket(realtimeUrl, {
    Cookie: session.cookie,
    Origin: baseUrl,
  });
  const connection: ChatConnection = {
    socket,
    roomKey: room.room_key,
    session,
    stopped: false,
    events: [],
    waiters: [],
    pending: new Map(),
  };
  energy.chat = connection;

  socket.addEventListener("message", (event) => {
    const payload = payloadFromEvent(event.data);
    if (payload === null) return;
    const payloadClientMessageId = scalar(payload, ["client_message_id", "clientMessageId"]);
    if (payload.type === "msg:ack" && payloadClientMessageId !== null) {
      const pending = connection.pending.get(payloadClientMessageId);
      if (pending) {
        pending.acked = true;
        resolvePending(connection, pending);
      }
    }
    if (payload.type === "msg:error" && payloadClientMessageId !== null) {
      const pending = connection.pending.get(payloadClientMessageId);
      if (pending) {
        const code = scalar(payload, ["error"]) ?? "unknown";
        rejectPending(connection, pending, new Error(\`Admin отклонил сообщение: \${code}.\`));
      }
    }
    const message = messageFromPayload(payload, room.room_key);
    if (message === null) return;
    const id = clientMessageId(message);
    const key = messageKey(message);
    const pending = id === null ? undefined : connection.pending.get(id);
    if (pending && key !== null) {
      pending.messageKey = key;
      resolvePending(connection, pending);
    }
    emitEvent(connection, { kind: "message", message });
  });
  socket.addEventListener("close", (event) => {
    if (connection.stopped) return;
    const reason = event.reason?.trim() || \`код \${event.code ?? "unknown"}\`;
    for (const pending of [...connection.pending.values()]) {
      rejectPending(connection, pending, new Error("Realtime-соединение закрылось."));
    }
    emitEvent(connection, { kind: "disconnected", reason });
  });

  try {
    await waitForOpen(socket, signal);
    const pages: ChatMessage[][] = [];
    let before: string | null = null;
    for (let page = 0; page < 10_000; page += 1) {
      const query = before === null
        ? "?limit=100"
        : \`?limit=100&before=\${encodeURIComponent(before)}\`;
      const historyBody = await responseJson(await fetchImpl(
        \`\${baseUrl}/api/chat/rooms/\${encodeURIComponent(room.room_key)}/messages\${query}\`,
        { headers, signal },
      ), "Получение истории");
      const pageMessages = messagesFrom(historyBody);
      pages.unshift(pageMessages);
      if (!historyHasMore(historyBody)) break;
      const nextBefore = pageMessages.length === 0 ? null : messageKey(pageMessages[0]!);
      if (nextBefore === null || nextBefore === before) {
        throw new Error("Admin вернул некорректный cursor истории.");
      }
      before = nextBefore;
      if (page === 9_999) throw new Error("История общей комнаты превысила безопасный предел.");
    }
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime WebSocket закрылся во время чтения истории.");
    }

    const previous = await readJsonOr<ChatMessagesMass>(mass.chatMessages, {
      roomKey: room.room_key,
      syncedAt: new Date(0).toISOString(),
      messages: [],
    });
    const history = pages.flat();
    const messages = mergeMessages(history, previous.messages);
    const handledMessageKeys = handledKeysFrom(previous);
    const inFlight = inFlightFrom(previous);
    const syncedAt = now().toISOString();
    await mass.chatMessages.write({
      roomKey: room.room_key,
      syncedAt,
      messages,
      handledMessageKeys,
      inFlight,
    } satisfies ChatMessagesMass);

    const handled = new Set(handledMessageKeys);
    const historicalInbox = messages
      .filter((message) => {
        const key = messageKey(message);
        return key !== null
          && key !== inFlight?.messageKey
          && !handled.has(key)
          && !hasOwnMessage([message], session)
          && explicitMentionFor(message, session);
      })
      .map((message): QueuedChatEvent => ({ kind: "message", message }));
    connection.events = [...historicalInbox, ...connection.events];

    return {
      roomKey: room.room_key,
      roomTitle: room.title,
      historyCount: messages.length,
      ownMessageExists: hasOwnMessage(messages, session),
    };
  } catch (error) {
    stopCommonChat({ energy });
    throw error;
  }
}`;

nextAction = replaceBetween(
  nextAction,
  "export async function connectCommonChat(",
  "export async function receiveCommonChatEvent(",
  connectReplacement,
);

const receiveReplacement = `export async function receiveCommonChatEvent(
  { mass, energy, signal }: ConnectParams,
  dependencies: Pick<RealtimeDependencies, "now"> = {},
): Promise<
  | { kind: "message"; messageKey: string; body: string; authorSelf: false }
  | { kind: "disconnected"; reason: string }
> {
  assertChatMass(mass);
  const connection = energy.chat;
  if (!connection || connection.stopped) {
    throw new Error("Realtime-соединение не запущено.");
  }
  const now = dependencies.now ?? (() => new Date());

  let current = await readJsonOr<ChatMessagesMass>(mass.chatMessages, {
    roomKey: connection.roomKey,
    syncedAt: new Date(0).toISOString(),
    messages: [],
  });
  const currentInFlight = inFlightFrom(current);
  const currentHandled = new Set(handledKeysFrom(current));
  if (currentInFlight !== null && !currentHandled.has(currentInFlight.messageKey)) {
    return {
      kind: "message",
      messageKey: currentInFlight.messageKey,
      body: currentInFlight.body,
      authorSelf: false,
    };
  }

  for (;;) {
    const event = await nextEvent(connection, signal);
    if (event.kind === "disconnected") return event;

    current = await readJsonOr<ChatMessagesMass>(mass.chatMessages, {
      roomKey: connection.roomKey,
      syncedAt: new Date(0).toISOString(),
      messages: [],
    });
    const messages = mergeMessages(current.messages, [event.message]);
    const key = messageKey(event.message);
    const body = messageBody(event.message);
    const handledMessageKeys = handledKeysFrom(current);
    const handled = new Set(handledMessageKeys);
    const addressed = key !== null
      && body !== null
      && !handled.has(key)
      && !hasOwnMessage([event.message], connection.session)
      && explicitMentionFor(event.message, connection.session);

    if (!addressed) {
      if (messages.length !== current.messages.length) {
        await mass.chatMessages.write({
          ...current,
          roomKey: connection.roomKey,
          syncedAt: now().toISOString(),
          messages,
          handledMessageKeys,
          inFlight: inFlightFrom(current),
        } satisfies ChatMessagesMass);
      }
      continue;
    }

    const inFlight = { messageKey: key, body };
    await mass.chatMessages.write({
      ...current,
      roomKey: connection.roomKey,
      syncedAt: now().toISOString(),
      messages,
      handledMessageKeys,
      inFlight,
    } satisfies ChatMessagesMass);
    return { kind: "message", messageKey: key, body, authorSelf: false };
  }
}`;

nextAction = replaceBetween(
  nextAction,
  "export async function receiveCommonChatEvent(",
  "export function acknowledgeChatEvent(",
  receiveReplacement,
);

if (!nextAction.endsWith("\n")) nextAction += "\n";
nextAction += `
export default async function connectCommonChatProcess(
  input: ConnectParams & { field?: unknown; self?: unknown; value?: unknown },
) {
  return connectCommonChat(input);
}
`;
}
new Bun.Transpiler({ loader: "ts" }).transformSync(nextAction);

const acknowledgeSource = `import type { MassHandle } from "@metafor/types/metafor/mass";

type ChatMessagesMass = {
  roomKey: string;
  syncedAt: string;
  messages: Array<Record<string, unknown>>;
  handledMessageKeys?: string[];
  inFlight?: { messageKey: string; body: string } | null;
};

const readMass = async (handle: MassHandle): Promise<ChatMessagesMass> => {
  const source = await handle.readText();
  if (source.trim() === "") throw new Error("Inbox Mass ещё не создан.");
  return JSON.parse(source) as ChatMessagesMass;
};

export default async ({
  mass,
  signal,
}: {
  mass: { chatMessages: MassHandle };
  signal: AbortSignal;
  energy?: unknown;
  field?: unknown;
  self?: unknown;
  value?: unknown;
}): Promise<{ acknowledged: true; messageKey: string | null }> => {
  signal.throwIfAborted();
  const current = await readMass(mass.chatMessages);
  const inFlight = current.inFlight;
  if (!inFlight || typeof inFlight.messageKey !== "string") {
    return { acknowledged: true, messageKey: null };
  }
  const handledMessageKeys = [...new Set([
    ...(Array.isArray(current.handledMessageKeys)
      ? current.handledMessageKeys.filter((key): key is string => typeof key === "string")
      : []),
    inFlight.messageKey,
  ])];
  await mass.chatMessages.write({
    ...current,
    handledMessageKeys,
    inFlight: null,
  } satisfies ChatMessagesMass);
  return { acknowledged: true, messageKey: inFlight.messageKey };
};
`;
new Bun.Transpiler({ loader: "ts" }).transformSync(acknowledgeSource);

if (process.env.LADA_INBOX_DRY_RUN === "1") {
  console.log(JSON.stringify({
    currentActionRevision: `sha256:${new Bun.CryptoHasher("sha256").update(currentAction).digest("hex")}`,
    nextActionRevision: `sha256:${new Bun.CryptoHasher("sha256").update(nextAction).digest("hex")}`,
    nextActionBytes: new TextEncoder().encode(nextAction).byteLength,
    acknowledgeBytes: new TextEncoder().encode(acknowledgeSource).byteLength,
  }, null, 2));
  process.exit(0);
}

const transport = new BaseMonadTransport("codex/lada", "http://127.0.0.1:4000/");
await transport.open({ waitMs: 5_000 });
const peer = new MonadRpcPeer(transport.channel);

const readRevision = async (): Promise<string> => {
  const result = await peer.call("dark", "meta.source.revision.read", {
    contractVersion: 1,
    capability: "meta.source.read",
    addresses: [ADDRESS],
  }, { waitMs: 5_000 }) as { sources: Array<{ address: string; revision: string }> };
  const source = result.sources.find((item) => item.address === ADDRESS);
  if (!source) throw new Error("Lada Chat source revision is absent.");
  return source.revision;
};

const apply = async (request: Record<string, unknown>): Promise<unknown> => {
  const result = await peer.call("dark", "meta.declaration.apply", request, { waitMs: 30_000 });
  console.log(JSON.stringify({ operationId: request.operationId, result }, null, 2));
  return result;
};

try {
  const resume = process.env.LADA_INBOX_RESUME === "1";
  if (!resume) {
  await apply({
    contractVersion: 1,
    operationId: "lada-chat-addressed-inbox-transport-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: ADDRESS,
    key: "подключение",
    process: {
      key: "подключение",
      type: "action",
      label: "Подключить общую комнату",
      env: ["server"],
      artifact: {
        path: "actions/realtime.ts",
        revision: `sha256:${new Bun.CryptoHasher("sha256").update(currentAction).digest("hex")}`,
        exportName: "default",
        source: nextAction,
      },
      successSource: `({ data, update }) => update({
        roomKey: data.roomKey,
        roomTitle: data.roomTitle,
        connected: true,
        historyReady: true,
        historyCount: data.historyCount,
        ownMessageExists: data.ownMessageExists,
        eventReady: false,
        retryReady: false,
        error: null,
      })`,
      errorSource: `({ error, update }) => update({
        connected: false,
        retryReady: false,
        error: error.message,
      })`,
    },
    revisions: [{ address: ADDRESS, revision: await readRevision() }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-chat-addressed-inbox-state-v1",
    capability: "meta.declaration.write",
    entity: "state",
    operation: "add",
    address: ADDRESS,
    state: {
      name: "inbox принято",
      transitions: {
        "контроль авторизации": {
          eventReady: { eq: false },
          incomingMessageKey: { null: true },
        },
      },
    },
    revisions: [{ address: ADDRESS, revision: await readRevision() }],
  });
  }

  await apply({
    contractVersion: 1,
    operationId: "lada-chat-addressed-inbox-ack-process-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "add",
    address: ADDRESS,
    process: {
      key: "inbox принято",
      type: "action",
      label: "Зафиксировать доставленное обращение",
      env: ["server"],
      artifact: {
        path: "actions/inbox-ack.ts",
        revision: "absent",
        exportName: "default",
        source: acknowledgeSource,
      },
      successSource: "({ update }) => update({ eventReady: false })",
      errorSource: `({ error, update }) => update({
        connected: false,
        eventReady: false,
        retryReady: false,
        error: error.message,
      })`,
    },
    revisions: [{ address: ADDRESS, revision: await readRevision() }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-chat-addressed-inbox-routing-v1",
    capability: "meta.declaration.write",
    entity: "state",
    operation: "replace",
    address: ADDRESS,
    name: "ожидание события",
    state: {
      name: "ожидание события",
      transitions: {
        "контроль авторизации": { connected: { eq: false } },
        "inbox принято": {
          connected: { eq: true },
          eventReady: { eq: true },
        },
      },
    },
    revisions: [{ address: ADDRESS, revision: await readRevision() }],
  });
} finally {
  peer.close();
  await transport.close();
}
