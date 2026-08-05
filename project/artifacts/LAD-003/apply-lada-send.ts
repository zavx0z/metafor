import { BaseMonadTransport } from "../../../shared/transport/monad/base.ts";
import { MonadRpcPeer } from "../../../shared/transport/monad/peer.ts";

const ROOT = "zavx0z/lada";
const MODEL = "zavx0z/lada-model";
const CHAT = "zavx0z/lada-chat";

const digest = (source: string): string =>
  `sha256:${new Bun.CryptoHasher("sha256").update(source).digest("hex")}`;

const replaceExact = (source: string, before: string, after: string): string => {
  const start = source.indexOf(before);
  if (start < 0 || source.indexOf(before, start + before.length) >= 0) {
    throw new Error(`Expected one source range: ${before.slice(0, 100)}`);
  }
  return source.slice(0, start) + after + source.slice(start + before.length);
};

const considerBefore = await Bun.file("cluster/zavx0z/lada/actions/consider-message.ts").text();
const considerAfter = `type Params = {
  value: {
    incomingMessageKey: string | null;
    incomingMessage: string | null;
  };
  signal: AbortSignal;
};

export function considerIncomingMessage(
  { value, signal }: Params,
): { messageKey: string; prompt: string } {
  signal.throwIfAborted();
  const message = value.incomingMessage?.trim();
  if (!value.incomingMessageKey || !message) {
    throw new Error("Входящее сообщение отсутствует.");
  }
  return { messageKey: value.incomingMessageKey, prompt: message };
}

export default function considerIncomingMessageProcess(
  input: Params & { energy?: unknown; field?: unknown; mass?: unknown; self?: unknown },
) {
  return considerIncomingMessage(input);
}
`;

const modelBefore = await Bun.file("cluster/zavx0z/lada-model/actions/chat.ts").text();
let modelAfter = replaceExact(
  modelBefore,
  `export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";`,
  `export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const LADA_SYSTEM_PROMPT =
  "Ты Лада, цифровой сотрудник Производства №1. "
  + "Помогай коллегам с предложениями, пожеланиями и наблюдениями по админке. "
  + "Отвечай кратко, доброжелательно и по делу, допускается лёгкий уместный юмор. "
  + "Не утверждай, что работа уже выполнена, если это не следует из сообщения. "
  + "Не раскрывай внутренние рассуждения и не называй ответ черновиком.";`,
);
modelAfter = replaceExact(
  modelAfter,
  `  const history = parseMessages(await mass.messages.readText());
  const createdAt = now().toISOString();
  const userMessage: InferenceMessage = {
    id: randomUUID(),
    role: "user",
    content: prompt,
    status: "complete",
    createdAt,
  };
  const assistantMessage: InferenceMessage = {
    id: randomUUID(),
    role: "assistant",
    content: "",
    status: "pending",
    createdAt,
    model,
  };
  const next = [...history, userMessage, assistantMessage];`,
  `  const history = parseMessages(await mass.messages.readText());
  const createdAt = now().toISOString();
  const existingSystem = history.find((message) => message.role === "system");
  const systemMessage: InferenceMessage = existingSystem
    ? {
        id: existingSystem.id,
        role: "system",
        content: LADA_SYSTEM_PROMPT,
        status: "complete",
        createdAt: existingSystem.createdAt,
      }
    : {
        id: randomUUID(),
        role: "system",
        content: LADA_SYSTEM_PROMPT,
        status: "complete",
        createdAt,
      };
  const conversation = [
    systemMessage,
    ...history.filter((message) => message.role !== "system"),
  ];
  const userMessage: InferenceMessage = {
    id: randomUUID(),
    role: "user",
    content: prompt,
    status: "complete",
    createdAt,
  };
  const assistantMessage: InferenceMessage = {
    id: randomUUID(),
    role: "assistant",
    content: "",
    status: "pending",
    createdAt,
    model,
  };
  const next = [...conversation, userMessage, assistantMessage];`,
);
modelAfter = replaceExact(
  modelAfter,
  `          ...history
            .filter((message) => message.status === "complete")`,
  `          ...conversation
            .filter((message) => message.status === "complete")`,
);
modelAfter = replaceExact(
  modelAfter,
  "export default runOllamaChat;\n",
  `export default function runOllamaChatProcess(
  input: InferenceChatActionParams & { energy?: unknown; field?: unknown; self?: unknown },
) {
  return runOllamaChat(input);
}
`,
);

const realtimeBefore = await Bun.file("cluster/zavx0z/lada-chat/actions/realtime.ts").text();
let realtimeAfter = replaceExact(
  realtimeBefore,
  `  status: "pending" | "sent" | "error";
  createdAt: string;`,
  `  status: "intent" | "pending" | "sent" | "error";
  createdAt: string;
  replyToMessageKey?: string;`,
);
realtimeAfter = replaceExact(
  realtimeAfter,
  `  clientMessageIdValue: string,
  createdAt: string,
): ChatOutboxEntry => {`,
  `  clientMessageIdValue: string,
  createdAt: string,
  replyToMessageKey?: string,
): ChatOutboxEntry => {`,
);
realtimeAfter = replaceExact(
  realtimeAfter,
  `    status: "pending",
    createdAt,
  };`,
  `    status: "pending",
    createdAt,
    ...(replyToMessageKey === undefined ? {} : { replyToMessageKey }),
  };`,
);
realtimeAfter = replaceExact(
  realtimeAfter,
  `  const retry = [...outbox.messages].reverse().find((item) =>
    item.roomKey === roomKey
    && item.body === normalizedBody
    && item.status !== "sent"
  );
  let entry = validatedEntry(
    roomKey,
    normalizedBody,
    retry?.clientMessageId ?? randomUUID(),
    retry?.createdAt ?? now().toISOString(),
  );`,
  `  const retry = [...outbox.messages].reverse().find((item) =>
    item.roomKey === roomKey
    && item.body === normalizedBody
    && (item.status === "intent" || item.status === "pending")
  );
  if (!retry) {
    const failed = [...outbox.messages].reverse().find((item) =>
      item.roomKey === roomKey
      && item.body === normalizedBody
      && item.status === "error"
    );
    if (failed) throw new Error("Предыдущая отправка этого намерения завершилась ошибкой.");
  }
  let entry = validatedEntry(
    roomKey,
    normalizedBody,
    retry?.clientMessageId ?? randomUUID(),
    retry?.createdAt ?? now().toISOString(),
    retry?.replyToMessageKey,
  );`,
);

const prepareSendSource = `import type { MassHandle } from "@metafor/types/metafor/mass";

type OutboxEntry = {
  clientMessageId: string;
  roomKey: string;
  body: string;
  status: "intent" | "pending" | "sent" | "error";
  createdAt: string;
  replyToMessageKey?: string;
  messageKey?: string;
  error?: string;
};

type Params = {
  mass: { chatOutbox: MassHandle };
  signal: AbortSignal;
  value: {
    replyDraft: string | null;
    replyToMessageKey: string | null;
    roomKey: string | null;
  };
};

const readOutbox = async (handle: MassHandle): Promise<{ messages: OutboxEntry[] }> => {
  const source = await handle.readText();
  if (source.trim() === "") return { messages: [] };
  const value = JSON.parse(source) as { messages?: unknown };
  if (!Array.isArray(value.messages)) throw new Error("Chat outbox имеет неверный формат.");
  return { messages: value.messages as OutboxEntry[] };
};

export async function prepareReplySend(
  { mass, signal, value }: Params,
  dependencies: { now?: () => Date; randomUUID?: () => string } = {},
): Promise<{ body: string; clientMessageId: string; replyToMessageKey: string }> {
  signal.throwIfAborted();
  const body = value.replyDraft?.trim();
  const replyToMessageKey = value.replyToMessageKey?.trim();
  const roomKey = value.roomKey?.trim();
  if (!body || !replyToMessageKey || !roomKey) {
    throw new Error("Черновик ответа не связан с исходным сообщением или комнатой.");
  }
  const outbox = await readOutbox(mass.chatOutbox);
  const existing = [...outbox.messages].reverse().find((item) =>
    item.replyToMessageKey === replyToMessageKey
  );
  if (existing) {
    if (existing.body !== body || existing.roomKey !== roomKey) {
      throw new Error("Исходное сообщение уже связано с другим намерением.");
    }
    if (existing.status === "sent") throw new Error("Ответ на исходное сообщение уже отправлен.");
    if (existing.status === "error") throw new Error("Предыдущая отправка ответа завершилась ошибкой.");
    return { body, clientMessageId: existing.clientMessageId, replyToMessageKey };
  }
  const entry: OutboxEntry = {
    clientMessageId: (dependencies.randomUUID ?? (() => crypto.randomUUID()))(),
    roomKey,
    body,
    status: "intent",
    createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    replyToMessageKey,
  };
  await mass.chatOutbox.write({ messages: [...outbox.messages, entry].slice(-50) });
  return { body, clientMessageId: entry.clientMessageId, replyToMessageKey };
}

export default async function prepareReplySendProcess(
  input: Params & { energy?: unknown; field?: unknown; self?: unknown },
) {
  return prepareReplySend(input);
}
`;

for (const source of [considerAfter, modelAfter, realtimeAfter, prepareSendSource]) {
  new Bun.Transpiler({ loader: "ts" }).transformSync(source);
}

if (process.env.LADA_SEND_DRY_RUN === "1") {
  console.log(JSON.stringify({
    consider: { before: digest(considerBefore), after: digest(considerAfter) },
    model: { before: digest(modelBefore), after: digest(modelAfter) },
    realtime: { before: digest(realtimeBefore), after: digest(realtimeAfter) },
    prepareSend: { after: digest(prepareSendSource) },
  }, null, 2));
  process.exit(0);
}

const transport = new BaseMonadTransport("codex/lada", "http://127.0.0.1:4000/");
await transport.open({ waitMs: 5_000 });
const peer = new MonadRpcPeer(transport.channel);

const revision = async (address: string): Promise<string> => {
  const result = await peer.call("dark", "meta.source.revision.read", {
    contractVersion: 1,
    capability: "meta.source.read",
    addresses: [address],
  }, { waitMs: 5_000 }) as { sources: Array<{ revision: string }> };
  return result.sources[0]!.revision;
};

const apply = async (request: Record<string, unknown>): Promise<void> => {
  const result = await peer.call("dark", "meta.declaration.apply", request, { waitMs: 30_000 });
  console.log(JSON.stringify({ operationId: request.operationId, result }, null, 2));
};

try {
  await apply({
    contractVersion: 1,
    operationId: "lada-reply-cause-field-v1",
    capability: "meta.declaration.write",
    entity: "field",
    operation: "add",
    address: ROOT,
    field: {
      key: "replyToMessageKey",
      type: "string",
      required: false,
      label: "Исходное сообщение ответа",
    },
    revisions: [{ address: ROOT, revision: await revision(ROOT) }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-reply-cause-consider-process-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: ROOT,
    key: "осмысление сообщения",
    process: {
      key: "осмысление сообщения",
      type: "action",
      label: "Сформулировать намерение подготовить ответ",
      env: ["server"],
      artifact: {
        path: "actions/consider-message.ts",
        revision: digest(considerBefore),
        exportName: "default",
        source: considerAfter,
      },
      successSource: `({ data, update }) => update({
        incomingMessageKey: null,
        incomingMessage: null,
        replyToMessageKey: data.messageKey,
        modelPrompt: data.prompt,
        modelError: null,
      })`,
      errorSource: `({ error, update }) => update({
        incomingMessageKey: null,
        incomingMessage: null,
        replyToMessageKey: null,
        modelError: error.message,
      })`,
    },
    revisions: [{ address: ROOT, revision: await revision(ROOT) }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-model-system-persona-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: MODEL,
    key: "обращение к модели",
    process: {
      key: "обращение к модели",
      type: "action",
      label: "Подготовить ответ локальной Ollama-моделью",
      env: ["server"],
      artifact: {
        path: "actions/chat.ts",
        revision: digest(modelBefore),
        exportName: "default",
        source: modelAfter,
      },
      successSource: `({ data, update }) => update({
        prompt: null,
        response: data.assistantContent,
        lastMessageId: data.assistantMessageId,
        error: null,
      })`,
      errorSource: `({ error, update }) => update({
        prompt: null,
        error: error.message,
      })`,
    },
    revisions: [{ address: MODEL, revision: await revision(MODEL) }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-chat-causal-outbox-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: CHAT,
    key: "подключение",
    process: {
      key: "подключение",
      type: "action",
      label: "Подключить общую комнату",
      env: ["server"],
      artifact: {
        path: "actions/realtime.ts",
        revision: digest(realtimeBefore),
        exportName: "default",
        source: realtimeAfter,
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
    revisions: [{ address: CHAT, revision: await revision(CHAT) }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-reply-send-state-v1",
    capability: "meta.declaration.write",
    entity: "state",
    operation: "add",
    address: ROOT,
    state: {
      name: "подготовка отправки",
      transitions: {
        "работа": { replyDraft: { null: true } },
      },
    },
    revisions: [{ address: ROOT, revision: await revision(ROOT) }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-reply-send-process-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "add",
    address: ROOT,
    process: {
      key: "подготовка отправки",
      type: "action",
      label: "Создать намерение Send Tool",
      env: ["server"],
      artifact: {
        path: "actions/prepare-reply-send.ts",
        revision: "absent",
        exportName: "default",
        source: prepareSendSource,
      },
      successSource: `({ data, update }) => update({
        replyDraft: null,
        replyToMessageKey: null,
        outgoingMessage: data.body,
        sendError: null,
      })`,
      errorSource: `({ error, update }) => update({
        replyDraft: null,
        replyToMessageKey: null,
        outgoingMessage: null,
        sendError: error.message,
      })`,
    },
    revisions: [{ address: ROOT, revision: await revision(ROOT) }],
  });
} finally {
  peer.close();
  await transport.close();
}
