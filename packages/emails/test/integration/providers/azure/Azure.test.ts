import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Fiber, Result } from "effect";
import { TestClock } from "effect/testing";

import { EmailClient } from "@azure/communication-email";
import { Email } from "@effect-kit/emails";
import * as Azure from "@effect-kit/emails/azure";

import { message } from "#/test/fixtures/email.js";

const operationId = "00000000-0000-4000-8000-000000000001";
const fixture = (
  terminal: string,
  failPoll = false,
  runningPolls = 0,
  terminalId = operationId,
  stallPolling = false,
) => {
  let polls = 0;
  const requests: {
    method: string;
    body: unknown;
    signal: { readonly aborted: boolean } | undefined;
  }[] = [];
  const started = Promise.withResolvers<void>();
  const client = new EmailClient(
    "https://offline.communication.azure.com",
    { key: "b2ZmbGluZQ==" },
    {
      retryOptions: { maxRetries: 0 },
      httpClient: {
        sendRequest: async (request) => {
          requests.push({
            method: request.method,
            body: request.body,
            signal: request.abortSignal,
          });
          const post = request.method === "POST";
          if (!post && stallPolling) {
            started.resolve();
            await new Promise<never>((_resolve, reject) => {
              const abort = () => {
                request.abortSignal?.removeEventListener("abort", abort);
                reject(new DOMException("Fixture aborted", "AbortError"));
              };
              request.abortSignal?.addEventListener("abort", abort);
            });
          }
          const status = post ? 202 : failPoll ? 503 : 200;
          const headers = new Map(
            Object.entries({
              "content-type": "application/json",
              ...(post
                ? {
                    "operation-location": `https://offline.communication.azure.com/emails/operations/${operationId}`,
                  }
                : {}),
            }),
          );
          return {
            request,
            status,
            headers: {
              get: (name: string) => headers.get(name.toLowerCase()),
              has: (name: string) => headers.has(name.toLowerCase()),
              set: (name: string, value: string) => {
                headers.set(name.toLowerCase(), value);
              },
              delete: (name: string) => {
                headers.delete(name.toLowerCase());
              },
              toJSON: () => Object.fromEntries(headers),
              [Symbol.iterator]: () => headers[Symbol.iterator](),
            },
            bodyAsText: JSON.stringify(
              failPoll && !post
                ? { error: { code: "ServiceUnavailable", message: "private-content" } }
                : {
                    id: post ? operationId : terminalId,
                    status: post || ++polls <= runningPolls ? "Running" : terminal,
                  },
            ),
          };
        },
      },
    },
  );
  return { client, requests, started };
};

describe("Azure SDK polling", () => {
  it.effect("polls one operation to success and keeps attachments and recipient visibility", () =>
    Effect.gen(function* () {
      const { client, requests } = fixture("Succeeded", false, 2);
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const receipt = yield* email.send({
          ...message,
          bcc: "private@example.com",
          attachments: [
            {
              filename: "logo.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0, 255, 128]),
              contentId: "logo",
            },
          ],
        });
        assert.deepStrictEqual(receipt.references, [{ kind: "operationId", value: operationId }]);
        assert.strictEqual(requests.filter((request) => request.method === "POST").length, 1);
        assert.isAtLeast(requests.length, 4);
        const payload = JSON.parse(String(requests[0]?.body));
        assert.deepStrictEqual(payload.recipients.bcc, [{ address: "private@example.com" }]);
        assert.strictEqual(payload.attachments[0].contentInBase64, "AP+A");
      }).pipe(Effect.provide(Azure.layerClient(client, { pollInterval: Duration.millis(1) })));
    }),
  );

  it.effect.each([
    ["Failed", false, "MessageRejectedError"],
    ["Succeeded", true, "ProviderUnavailableError"],
  ] as const)(
    "retains the original operation on %s / poll failure %s",
    ([terminal, failPoll, tag]) =>
      Effect.gen(function* () {
        const { client, requests } = fixture(terminal, failPoll);
        const result = yield* Effect.gen(function* () {
          const email = yield* Email;
          return yield* email.send(message);
        }).pipe(
          Effect.provide(Azure.layerClient(client, { pollInterval: Duration.millis(1) })),
          Effect.result,
        );
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result) && result.failure._tag === "EmailError") {
          assert.strictEqual(result.failure.reason._tag, tag);
          assert.deepStrictEqual(result.failure.references, [
            { kind: "operationId", value: operationId },
          ]);
          assert.notInclude(JSON.stringify(result.failure), "private-content");
        }
        assert.strictEqual(requests.filter((request) => request.method === "POST").length, 1);
      }),
  );
});

it.effect("stops borrowed polling on deadline and preserves reconciliation identity", () =>
  Effect.gen(function* () {
    const started = Promise.withResolvers<void>();
    let stopped = 0;
    let signal: AbortSignal | undefined;
    const client: Azure.AzureClient = {
      beginSend: async (_message, options) => {
        options?.onResponse?.({ parsedBody: { id: operationId, status: "Running" } });
        return {
          getResult: () => ({ id: operationId, status: "Running" }),
          stopPolling: () => {
            stopped++;
          },
          pollUntilDone: async (pollOptions) => {
            signal = pollOptions?.abortSignal;
            started.resolve();
            return new Promise(() => undefined);
          },
        };
      },
    };
    yield* Effect.gen(function* () {
      const email = yield* Email;
      const fiber = yield* Effect.forkChild(email.send(message).pipe(Effect.result));
      yield* Effect.promise(() => started.promise);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(fiber);
      assert.isTrue(signal?.aborted);
      assert.isAtLeast(stopped, 1);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "TimeoutError");
        assert.deepStrictEqual(result.failure.references, [
          { kind: "operationId", value: operationId },
        ]);
      }
    }).pipe(Effect.provide(Azure.layerClient(client, { timeout: Duration.seconds(1) })));
  }),
);

it.effect("does not treat a failed foreign operation as rejection of the original submission", () =>
  Effect.gen(function* () {
    const { client } = fixture("Failed", false, 0, "foreign-operation");
    const result = yield* Effect.gen(function* () {
      const email = yield* Email;
      return yield* email.send(message);
    }).pipe(Effect.provide(Azure.layerClient(client)), Effect.result);
    assert.isTrue(Result.isFailure(result));
    if (Result.isFailure(result) && result.failure._tag === "EmailError") {
      assert.strictEqual(result.failure.reason._tag, "UnexpectedResponseError");
      assert.strictEqual(result.failure.acceptance, "unknown");
      assert.deepStrictEqual(result.failure.references, [
        { kind: "operationId", value: operationId },
      ]);
    }
  }),
);

it.effect("aborts real SDK polling on deadline while retaining the original operation", () =>
  Effect.gen(function* () {
    const { client, requests, started } = fixture("Succeeded", false, 0, operationId, true);
    yield* Effect.gen(function* () {
      const email = yield* Email;
      const fiber = yield* Effect.forkChild(email.send(message).pipe(Effect.result));
      yield* Effect.promise(() => started.promise);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(fiber);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "TimeoutError");
        assert.deepStrictEqual(result.failure.references, [
          { kind: "operationId", value: operationId },
        ]);
      }
      assert.strictEqual(requests.filter((request) => request.method === "POST").length, 1);
      assert.isTrue(
        requests.some((request) => request.method === "GET" && request.signal?.aborted),
      );
    }).pipe(Effect.provide(Azure.layerClient(client, { timeout: Duration.seconds(1) })));
  }),
);
