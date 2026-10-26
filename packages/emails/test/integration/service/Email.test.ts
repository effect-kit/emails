import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Effect, Exit, Fiber, Layer, Tracer } from "effect";

import { Email, EmailError, TransportError } from "@effect-kit/emails";
import type { EmailAdapter, SendReceipt } from "@effect-kit/emails";

import { capabilities, makeCustomEmail, message, receipt } from "../../fixtures/email.js";

class CompanyMailClient extends Context.Service<
  CompanyMailClient,
  { readonly submit: EmailAdapter["send"] }
>()("test/CompanyMailClient") {}

const CompanyEmailLive = Layer.effect(
  Email,
  Effect.gen(function* () {
    const client = yield* CompanyMailClient;
    return Email.make({ provider: "custom", capabilities, send: client.submit });
  }),
);

const send = Effect.gen(function* () {
  const email = yield* Email;
  return yield* email.send(message);
});

describe("custom provider composition", () => {
  it.effect("captures a client once and leaves ownership with its scoped Layer", () =>
    Effect.gen(function* () {
      let acquired = 0;
      let released = 0;
      let submissions = 0;
      const clientLayer = Layer.effect(
        CompanyMailClient,
        Effect.acquireRelease(
          Effect.sync(() => {
            acquired++;
            return CompanyMailClient.of({
              submit: () =>
                Effect.sync(() => {
                  submissions++;
                  return receipt;
                }),
            });
          }),
          () =>
            Effect.sync(() => {
              released++;
            }),
        ),
      );
      const live = CompanyEmailLive.pipe(Layer.provide(clientLayer));

      const results = yield* Effect.all([send, send], { concurrency: 2 }).pipe(
        Effect.tap(() => Effect.sync(() => assert.strictEqual(released, 0))),
        Effect.provide(live),
      );
      assert.deepStrictEqual(results, [receipt, receipt]);
      assert.strictEqual(acquired, 1);
      assert.strictEqual(submissions, 2);
      assert.strictEqual(released, 1);
    }),
  );

  it.effect("keeps independently provided providers isolated", () =>
    Effect.gen(function* () {
      const first = Layer.succeed(
        Email,
        makeCustomEmail({
          provider: "first",
          send: () => Effect.succeed({ ...receipt, provider: "first" }),
        }),
      );
      const second = Layer.succeed(
        Email,
        makeCustomEmail({
          provider: "second",
          send: () => Effect.succeed({ ...receipt, provider: "second" }),
        }),
      );

      const results = yield* Effect.all(
        [send.pipe(Effect.provide(first)), send.pipe(Effect.provide(second))],
        { concurrency: 2 },
      );
      assert.deepStrictEqual(
        results.map((result) => result.provider),
        ["first", "second"],
      );
    }),
  );

  it.effect(
    "propagates interruption to a Promise bridge without turning it into an EmailError",
    () =>
      Effect.gen(function* () {
        const started = Promise.withResolvers<void>();
        let aborted = false;
        const email = makeCustomEmail({
          send: () =>
            Effect.tryPromise({
              try: (signal) =>
                new Promise<SendReceipt>((_resolve, reject) => {
                  signal.addEventListener(
                    "abort",
                    () => {
                      aborted = true;
                      reject(signal.reason);
                    },
                    { once: true },
                  );
                  started.resolve();
                }),
              catch: () =>
                new EmailError({
                  provider: "custom",
                  operation: "send",
                  acceptance: "unknown",
                  reason: new TransportError(),
                }),
            }),
        });
        const fiber = yield* Effect.forkChild(email.send(message));
        yield* Effect.promise(() => started.promise);

        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        assert.isTrue(aborted);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
      }),
  );

  it.effect("records one send span with safe attributes and no recipient/content/key values", () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const email = makeCustomEmail({
        capabilities: { ...capabilities, idempotency: { mode: "replay" } },
      });

      yield* email
        .send(
          {
            ...message,
            subject: "private-subject",
            text: "private-content",
            to: "private@example.com",
          },
          { idempotencyKey: "private-key" },
        )
        .pipe(Effect.withTracer(tracer));
      yield* email.send({ ...message, to: [] }).pipe(Effect.result, Effect.withTracer(tracer));

      const sendSpans = spans.filter((span) => span.name === "Email.send");
      assert.lengthOf(sendSpans, 2);
      assert.strictEqual(sendSpans[0]?.attributes.get("email.outcome"), "accepted");
      assert.strictEqual(sendSpans[1]?.attributes.get("email.reason"), "InvalidMessageError");
      for (const span of sendSpans) {
        const serialized = JSON.stringify(
          {
            attributes: [...span.attributes],
            events: span.events,
            status: span.status,
          },
          (_key, value: unknown) => (typeof value === "bigint" ? String(value) : value),
        );
        for (const secret of [
          "private-subject",
          "private-content",
          "private@example.com",
          "private-key",
        ]) {
          assert.notInclude(serialized, secret);
        }
      }
    }),
  );
});
