import { assert, describe, it } from "@effect/vitest";
import { Deferred, Duration, Effect, Fiber, Result } from "effect";
import { TestClock } from "effect/testing";

import { Email } from "@effect-kit/emails";
import * as Azure from "@effect-kit/emails/azure";

import { message } from "#/test/fixtures/email.js";

describe("Azure operation association", () => {
  it.effect(
    "keeps concurrent acceptance and timeout references attached to their own request",
    () =>
      Effect.gen(function* () {
        const started = Promise.withResolvers<void>();
        const finishSecond = Promise.withResolvers<unknown>();
        const secondCompleted = yield* Deferred.make<void>();
        const submissions: string[] = [];
        const client: Azure.AzureClient = {
          beginSend: async (payload, options) => {
            const id = payload.content.subject;
            submissions.push(id);
            if (submissions.length === 2) started.resolve();
            options?.onResponse?.({ parsedBody: { id, status: "Running" } });
            return {
              getResult: () => ({ id, status: "Running" }),
              stopPolling: () => undefined,
              pollUntilDone: async () =>
                id === "first-operation" ? new Promise(() => undefined) : finishSecond.promise,
            };
          },
        };
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const first = yield* Effect.forkChild(
            email.send({ ...message, subject: "first-operation" }).pipe(Effect.result),
          );
          const second = yield* Effect.forkChild(
            email
              .send({ ...message, subject: "second-operation" })
              .pipe(Effect.tap(() => Deferred.succeed(secondCompleted, undefined))),
          );
          yield* Effect.promise(() => started.promise);
          finishSecond.resolve({ id: "second-operation", status: "Succeeded" });
          yield* Deferred.await(secondCompleted);
          yield* TestClock.adjust("1 second");
          const failed = yield* Fiber.join(first);
          const accepted = yield* Fiber.join(second);
          assert.isTrue(Result.isFailure(failed));
          if (Result.isFailure(failed)) {
            assert.strictEqual(failed.failure.reason._tag, "TimeoutError");
            assert.strictEqual(failed.failure.acceptance, "unknown");
            assert.deepStrictEqual(failed.failure.references, [
              { kind: "operationId", value: "first-operation" },
            ]);
          }
          assert.deepStrictEqual(accepted.references, [
            { kind: "operationId", value: "second-operation" },
          ]);
          assert.deepStrictEqual(submissions, ["first-operation", "second-operation"]);
        }).pipe(Effect.provide(Azure.layerClient(client, { timeout: Duration.seconds(1) })));
      }),
  );

  it.effect(
    "treats contradictory initial poller identity as uncertain even if the final ID matches",
    () =>
      Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "UnexpectedResponseError");
          assert.strictEqual(result.failure.acceptance, "unknown");
          assert.deepStrictEqual(result.failure.references, [
            { kind: "operationId", value: "original-operation" },
          ]);
        }
      }).pipe(
        Effect.provide(
          Azure.layerClient({
            beginSend: async (_payload, options) => {
              options?.onResponse?.({
                parsedBody: { id: "original-operation", status: "Running" },
              });
              return {
                getResult: () => ({ id: "foreign-operation", status: "Running" }),
                stopPolling: () => undefined,
                pollUntilDone: async () => ({ id: "original-operation", status: "Succeeded" }),
              };
            },
          }),
        ),
      ),
  );
});
