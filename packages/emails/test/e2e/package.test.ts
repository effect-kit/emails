import { Effect, Layer } from "effect";

import { Email } from "@effect-kit/emails";
import { describe, expect, it } from "vitest";

describe("built package", () => {
  it("executes the built public API with an offline custom Layer", async () => {
    expect(import.meta.resolve("@effect-kit/emails")).toMatch(/\/dist\/index\.js$/);

    let calls = 0;
    const live = Layer.succeed(
      Email,
      Email.make({
        provider: "built-example",
        capabilities: {
          text: true,
          html: false,
          htmlAndText: false,
          senderName: false,
          cc: false,
          bcc: false,
          replyTo: "none",
          headers: false,
          attachments: false,
          inlineAttachments: false,
          idempotency: { mode: "unsupported" },
        },
        send: () =>
          Effect.sync(() => {
            calls++;
            return { provider: "built-example", status: "accepted" as const, references: [] };
          }),
      }),
    );
    const program = Effect.gen(function* () {
      const email = yield* Email;
      return yield* email.send({
        from: "hello@example.com",
        to: "ada@example.com",
        subject: "Hello",
        text: "Offline",
      });
    }).pipe(Effect.provide(live));

    const result = await Effect.runPromise(program);
    expect(result.status).toBe("accepted");
    expect(calls).toBe(1);
  });
});
