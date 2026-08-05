import { BaseMonadTransport } from "../../../shared/transport/monad/base.ts";
import { MonadRpcPeer } from "../../../shared/transport/monad/peer.ts";

const ROOT = "zavx0z/lada";
const SOURCE_MESSAGE_KEY = "63d3984a-f9f6-4119-bd37-085354ffcce6";
const ROOT_LOCATOR = {
  root: ROOT,
  pointer: "/runtime/roots/0",
  meta: ROOT,
} as const;

type RuntimeRoot = {
  state: string;
  values: Record<string, unknown>;
};

type RootTemplate = {
  superposition: Array<{
    name: string;
    transitions: Record<string, unknown> | null;
  }>;
};

type Graph = {
  runtime: { roots: RuntimeRoot[] };
  template: Record<string, RootTemplate>;
};

const transport = new BaseMonadTransport(
  "codex/lada",
  "http://127.0.0.1:4000/",
);
await transport.open({ waitMs: 5_000 });
const peer = new MonadRpcPeer(transport.channel);

const readGraph = async (): Promise<Graph> =>
  await peer.call("dark", "readGraph", {}, { waitMs: 5_000 }) as Graph;

const readFrontier = async () => {
  const receipt = await peer.call("dark", "dark.force.history.read", {
    contractVersion: 1,
    query: { kind: "frontier" },
  }, { waitMs: 5_000 }) as { frontier: unknown };
  return receipt.frontier;
};

const readSourceRevision = async (): Promise<string> => {
  const receipt = await peer.call("dark", "meta.source.revision.read", {
    contractVersion: 1,
    capability: "meta.source.read",
    addresses: [ROOT],
  }, { waitMs: 5_000 }) as { sources: Array<{ revision: string }> };
  return receipt.sources[0]!.revision;
};

try {
  let graph = await readGraph();
  let root = graph.runtime.roots[0];
  if (!root || root.state !== "работа") {
    throw new Error(`Лада должна находиться в State «работа», получено: ${root?.state}`);
  }
  if (typeof root.values.replyDraft !== "string" || root.values.replyDraft.trim() === "") {
    throw new Error("У Лады отсутствует подготовленный ответ для исходного обращения.");
  }
  if (root.values.outgoingMessage !== null) {
    throw new Error("До включения маршрута уже существует исходящее намерение.");
  }

  if (root.values.replyToMessageKey === null) {
    const fieldReceipt = await peer.call("dark", "meta.field.value.apply", {
      contractVersion: 1,
      atom: ROOT_LOCATOR,
      field: "replyToMessageKey",
      value: SOURCE_MESSAGE_KEY,
      expectedFrontier: await readFrontier(),
    }, { waitMs: 10_000 });
    console.log(JSON.stringify({ fieldReceipt }, null, 2));
  } else if (root.values.replyToMessageKey !== SOURCE_MESSAGE_KEY) {
    throw new Error("Подготовленный ответ уже связан с другим исходным сообщением.");
  }

  graph = await readGraph();
  let superposition = graph.template[ROOT]?.superposition ?? [];
  let routerPresent = superposition.some(({ name }) => name === "маршрутизация работы");
  if (!routerPresent) {
    const routerReceipt = await peer.call("dark", "meta.declaration.apply", {
      contractVersion: 1,
      operationId: "lada-reply-work-router-state-v1",
      capability: "meta.declaration.write",
      entity: "state",
      operation: "add",
      address: ROOT,
      state: {
        name: "маршрутизация работы",
        transitions: {
          "осмысление сообщения": {
            incomingMessageKey: { null: false },
            modelPrompt: { null: true },
          },
          "подготовка отправки": {
            replyDraft: { null: false },
            replyToMessageKey: { null: false },
            outgoingMessage: { null: true },
          },
        },
      },
      revisions: [{ address: ROOT, revision: await readSourceRevision() }],
    }, { waitMs: 30_000 });
    console.log(JSON.stringify({ routerReceipt }, null, 2));
    routerPresent = true;
  }

  graph = await readGraph();
  superposition = graph.template[ROOT]?.superposition ?? [];
  const work = superposition.find(({ name }) => name === "работа");
  const routePresent = work?.transitions !== null
    && work?.transitions !== undefined
    && Object.hasOwn(work.transitions, "маршрутизация работы");
  if (routerPresent && !routePresent) {
    const routeReceipt = await peer.call("dark", "meta.declaration.apply", {
      contractVersion: 1,
      operationId: "lada-reply-work-router-routing-v1",
      capability: "meta.declaration.write",
      entity: "state",
      operation: "replace",
      address: ROOT,
      name: "работа",
      state: {
        name: "работа",
        transitions: {
          "маршрутизация работы": {
            chatHistoryReady: { eq: true },
            ownMessageExists: { eq: true },
          },
        },
      },
      revisions: [{ address: ROOT, revision: await readSourceRevision() }],
    }, { waitMs: 30_000 });
    console.log(JSON.stringify({ routeReceipt }, null, 2));
  }
} finally {
  peer.close();
  await transport.close();
}
