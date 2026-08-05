import { BaseMonadTransport } from "../../../shared/transport/monad/base.ts";
import { MonadRpcPeer } from "../../../shared/transport/monad/peer.ts";

const ADDRESS = "zavx0z/lada-chat";
const ROOT = "cluster/zavx0z/lada-chat/actions";

const digest = (source: string): string =>
  `sha256:${new Bun.CryptoHasher("sha256").update(source).digest("hex")}`;

const replaceExact = (source: string, before: string, after: string): string => {
  const start = source.indexOf(before);
  if (start < 0 || source.indexOf(before, start + before.length) >= 0) {
    throw new Error(`Expected one source range: ${before.slice(0, 80)}`);
  }
  return source.slice(0, start) + after + source.slice(start + before.length);
};

const realtimeBefore = await Bun.file(`${ROOT}/realtime.ts`).text();
const realtimeAfter = replaceExact(
  realtimeBefore,
  "export default connectCommonChat;\n",
  `export default async function connectCommonChatProcess(
  input: ConnectParams & { field?: unknown; self?: unknown; value?: unknown },
) {
  return connectCommonChat(input);
}
`,
);

const inboxBefore = await Bun.file(`${ROOT}/inbox-ack.ts`).text();
const inboxAfter = replaceExact(
  inboxBefore,
  `  mass: { chatMessages: MassHandle };
  signal: AbortSignal;
}`,
  `  mass: { chatMessages: MassHandle };
  signal: AbortSignal;
  energy?: unknown;
  field?: unknown;
  self?: unknown;
  value?: unknown;
}`,
);

const authorizationBefore = await Bun.file(`${ROOT}/authorization-control.ts`).text();
const authorizationAfter = `export default async function authorizationControl(
  {
    signal,
  }: {
    signal: AbortSignal;
    energy?: unknown;
    field?: unknown;
    mass?: unknown;
    self?: unknown;
    value?: unknown;
  },
): Promise<{ ready: true }> {
  signal.throwIfAborted();
  return { ready: true };
}
`;

for (const source of [realtimeAfter, inboxAfter, authorizationAfter]) {
  new Bun.Transpiler({ loader: "ts" }).transformSync(source);
}

if (process.env.LADA_INBOX_DRY_RUN === "1") {
  console.log(JSON.stringify({
    realtime: { before: digest(realtimeBefore), after: digest(realtimeAfter) },
    inbox: { before: digest(inboxBefore), after: digest(inboxAfter) },
    authorization: { before: digest(authorizationBefore), after: digest(authorizationAfter) },
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

const apply = async (request: Record<string, unknown>): Promise<void> => {
  const result = await peer.call("dark", "meta.declaration.apply", request, { waitMs: 30_000 });
  console.log(JSON.stringify({ operationId: request.operationId, result }, null, 2));
};

try {
  await apply({
    contractVersion: 1,
    operationId: "lada-chat-addressed-inbox-transport-types-v1",
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
    revisions: [{ address: ADDRESS, revision: await readRevision() }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-chat-addressed-inbox-ack-types-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: ADDRESS,
    key: "inbox принято",
    process: {
      key: "inbox принято",
      type: "action",
      label: "Зафиксировать доставленное обращение",
      env: ["server"],
      artifact: {
        path: "actions/inbox-ack.ts",
        revision: digest(inboxBefore),
        exportName: "default",
        source: inboxAfter,
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
    operationId: "lada-chat-authorization-control-types-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: ADDRESS,
    key: "контроль авторизации",
    process: {
      key: "контроль авторизации",
      type: "action",
      label: "Продолжить после контроля авторизации",
      env: ["server"],
      artifact: {
        path: "actions/authorization-control.ts",
        revision: digest(authorizationBefore),
        exportName: "default",
        source: authorizationAfter,
      },
      successSource: "({ update }) => update({ retryReady: true })",
    },
    revisions: [{ address: ADDRESS, revision: await readRevision() }],
  });
} finally {
  peer.close();
  await transport.close();
}
