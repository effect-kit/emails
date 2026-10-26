import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Result } from "effect";

import { Email } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

import { message } from "../../fixtures/email.js";

describe("testing Layer state", () => {
  it.effect(
    "reusing a Layer in independent scopes resets captures and synthetic references",
    () => {
      const live = EmailTest.layer();
      const run = (subject: string) =>
        Effect.gen(function* () {
          const email = yield* Email;
          const recorder = yield* EmailTest;
          const receipt = yield* email.send({ ...message, subject });
          return { receipt, messages: yield* recorder.messages };
        }).pipe(Effect.provide(live));

      return Effect.gen(function* () {
        const [first, second] = yield* Effect.all([run("First"), run("Second")], {
          concurrency: 2,
        });
        assert.deepStrictEqual(first.receipt.references, second.receipt.references);
        assert.deepStrictEqual(
          first.messages.map((email) => email.subject),
          ["First"],
        );
        assert.deepStrictEqual(
          second.messages.map((email) => email.subject),
          ["Second"],
        );
      });
    },
  );

  it.effect(
    "observations cannot mutate stored addresses, headers, arrays or attachment bytes",
    () =>
      Effect.gen(function* () {
        const email = yield* Email;
        const recorder = yield* EmailTest;
        const bytes = new Uint8Array([0, 255]);
        yield* email.send({
          ...message,
          headers: { "X-Workflow": "welcome" },
          attachments: [
            { filename: "a.bin", contentType: "application/octet-stream", content: bytes },
          ],
        });

        const observed = yield* recorder.messages;
        const captured = observed[0];
        assert.isDefined(captured);
        if (captured) {
          Reflect.set(captured.from, "email", "changed@example.com");
          Reflect.set(captured.to, "0", { email: "changed@example.com" });
          if (captured.headers) Reflect.set(captured.headers, "X-Workflow", "changed");
          const attachment = captured.attachments?.[0];
          if (attachment) attachment.content[0] = 123;
        }
        Reflect.set(observed, "length", 0);
        bytes[0] = 99;

        const fresh = yield* recorder.messages;
        assert.lengthOf(fresh, 1);
        assert.strictEqual(fresh[0]?.from.email, message.from);
        assert.deepStrictEqual(fresh[0]?.to, [{ email: message.to }]);
        assert.strictEqual(fresh[0]?.headers?.["X-Workflow"], "welcome");
        assert.deepStrictEqual(fresh[0]?.attachments?.[0]?.content, new Uint8Array([0, 255]));
      }).pipe(Effect.provide(EmailTest.layer())),
  );

  it.effect("concurrent sends reserve distinct synthetic references without losing captures", () =>
    Effect.gen(function* () {
      const email = yield* Email;
      const recorder = yield* EmailTest;
      const receipts = yield* Effect.all(
        Array.from({ length: 8 }, (_, index) =>
          email.send({ ...message, subject: `Message ${index}` }),
        ),
        { concurrency: "unbounded" },
      );
      assert.strictEqual(
        new Set(receipts.flatMap((receipt) => receipt.references.map((ref) => ref.value))).size,
        8,
      );
      assert.lengthOf(yield* recorder.messages, 8);
    }).pipe(Effect.provide(EmailTest.layer())),
  );

  it.effect(
    "script assertion failures and exhaustion remain defects and consume attempted slots",
    () => {
      const assertion = new Error("script assertion failed");
      return Effect.gen(function* () {
        const email = yield* Email;
        const recorder = yield* EmailTest;
        for (const expected of [assertion, "EmailTest response script exhausted"]) {
          const exit = yield* Effect.exit(email.send(message));
          assert.isTrue(Exit.isFailure(exit));
          if (Exit.isFailure(exit)) {
            const found = Cause.findDie(exit.cause);
            assert.isTrue(Result.isSuccess(found));
            if (Result.isSuccess(found)) {
              if (typeof expected === "string")
                assert.strictEqual(String(found.success.defect), `Error: ${expected}`);
              else assert.strictEqual(found.success.defect, expected);
            }
          }
        }
        assert.lengthOf(yield* recorder.messages, 2);
      }).pipe(Effect.provide(EmailTest.layer({ responses: [Effect.die(assertion)] })));
    },
  );

  it.effect(
    "interrupted scripts finalize and remain captured attempts rather than successful sends",
    () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        let finalized = false;
        const response = Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              finalized = true;
            }),
          ),
        );
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const recorder = yield* EmailTest;
          const fiber = yield* Effect.forkChild(email.send(message));
          yield* Deferred.await(started);
          yield* Fiber.interrupt(fiber);
          const exit = yield* Fiber.await(fiber);
          assert.isTrue(Exit.isFailure(exit));
          if (Exit.isFailure(exit)) assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
          assert.lengthOf(yield* recorder.messages, 1);
          assert.isTrue(finalized);
        }).pipe(Effect.provide(EmailTest.layer({ responses: [response] })));
      }),
  );
});
