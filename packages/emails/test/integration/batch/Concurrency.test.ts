import { assert, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Result } from "effect";

import { Email } from "@effect-kit/emails";
import type { SendReceipt } from "@effect-kit/emails";

import { capabilities, message } from "#/test/fixtures/email.js";

const receipt = (index: number): SendReceipt => ({
  provider: "custom",
  status: "accepted",
  references: [{ kind: "providerMessageId", value: String(index) }],
});

it.effect("bounds concurrent sends, preserves input order and snapshots queued messages/keys", () =>
  Effect.gen(function* () {
    const started = [
      yield* Deferred.make<void>(),
      yield* Deferred.make<void>(),
      yield* Deferred.make<void>(),
    ] as const;
    const gates = [
      yield* Deferred.make<SendReceipt>(),
      yield* Deferred.make<SendReceipt>(),
      yield* Deferred.make<SendReceipt>(),
    ] as const;
    const seen: {
      subject: string;
      text: string | undefined;
      key: string | undefined;
      byte: number | undefined;
    }[] = [];
    let active = 0;
    let maximumActive = 0;
    const live = Layer.succeed(
      Email,
      Email.make({
        provider: "custom",
        capabilities: { ...capabilities, idempotency: { mode: "replay" } },
        send: Effect.fnUntraced(function* (input, options) {
          const index = input.subject === "0" ? 0 : input.subject === "1" ? 1 : 2;
          seen.push({
            subject: input.subject,
            text: input.text,
            key: options.idempotencyKey,
            byte: input.attachments?.[0]?.content[0],
          });
          active++;
          maximumActive = Math.max(maximumActive, active);

          return yield* Effect.gen(function* () {
            yield* Deferred.succeed(started[index], undefined);
            return yield* Deferred.await(gates[index]);
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                active--;
              }),
            ),
          );
        }),
      }),
    );
    const bytes = new Uint8Array([7]);
    const requests = [0, 1, 2].map((index) => ({
      message: {
        ...message,
        subject: String(index),
        attachments: [
          { filename: "bytes.bin", contentType: "application/octet-stream", content: bytes },
        ],
      },
      options: { idempotencyKey: `key-${index}` },
    }));
    const batch = Email.sendMany(requests, { concurrency: 2 }).pipe(Effect.provide(live));
    assert.strictEqual(seen.length, 0);

    const fiber = yield* Effect.forkChild(batch);
    yield* Deferred.await(started[0]);
    yield* Deferred.await(started[1]);
    assert.strictEqual(active, 2);
    assert.isFalse(yield* Deferred.isDone(started[2]));

    const queued = requests[2];
    if (queued === undefined) throw new Error("Missing queued request fixture");
    queued.message.text = "Changed while queued";
    queued.options.idempotencyKey = "changed-key";
    bytes[0] = 99;
    requests.reverse();

    yield* Deferred.succeed(gates[1], receipt(1));
    yield* Deferred.await(started[2]);
    yield* Deferred.succeed(gates[2], receipt(2));
    yield* Deferred.succeed(gates[0], receipt(0));
    const outcomes = yield* Fiber.join(fiber);

    assert.strictEqual(maximumActive, 2);
    assert.strictEqual(active, 0);
    assert.deepStrictEqual(
      outcomes.map((outcome) =>
        Result.isSuccess(outcome) ? outcome.success.references[0]?.value : "failed",
      ),
      ["0", "1", "2"],
    );
    assert.deepStrictEqual(
      seen.map((input) => input.key),
      ["key-0", "key-1", "key-2"],
    );
    assert.strictEqual(seen[2]?.text, message.text);
    assert.strictEqual(seen[2]?.byte, 7);
  }),
);
