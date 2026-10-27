import { assert, describe, it } from "@effect/vitest";
import { Cause, Duration, Effect, Exit, Fiber, Redacted, Result } from "effect";
import { Layer } from "effect";
import { TestClock } from "effect/testing";

import { SESv2Client } from "@aws-sdk/client-sesv2";
import { Email } from "@effect-kit/emails";
import * as Ses from "@effect-kit/emails/ses";
import { afterEach, vi } from "vitest";

import { repeatedSubmission } from "#/test/fixtures/conformance/email-contract.js";
import { message } from "#/test/fixtures/email.js";
import { httpServer } from "#/test/fixtures/http/server.js";

afterEach(() => vi.restoreAllMocks());

const credentials = {
  accessKeyId: "offline-access",
  secretAccessKey: Redacted.make("offline-secret"),
};

describe("SES SDK boundary", () => {
  it.effect("signs one request per execution and preserves MIME fields and raw bytes", () =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({
        body: { MessageId: "ses-id" },
        headers: { "x-amzn-requestid": "request-id" },
      }));
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const [receipt] = yield* repeatedSubmission(
          email.send({
            ...message,
            cc: "copy@example.com",
            bcc: "private@example.com",
            html: '<img src="cid:logo">',
            attachments: [
              {
                filename: "logo.bin",
                contentType: "application/octet-stream",
                content: new Uint8Array([0, 255, 128]),
                contentId: "logo",
              },
            ],
          }),
          Effect.sync(() => server.requests.length),
        );
        assert.strictEqual(receipt.references[0]?.value, "ses-id");
        assert.strictEqual(receipt.requestId, "request-id");
        const request = server.requests[0];
        assert.include(request?.headers.authorization, "/eu-west-1/ses/");
        const payload = JSON.parse(request?.body.toString() ?? "{}");
        assert.deepStrictEqual(payload.Destination.BccAddresses, ["private@example.com"]);
        assert.strictEqual(payload.Content.Simple.Body.Text.Data, message.text);
        assert.strictEqual(payload.Content.Simple.Attachments[0].RawContent, "AP+A");
        assert.strictEqual(payload.Content.Simple.Attachments[0].ContentId, "logo");
      }).pipe(
        Effect.provide(Ses.layer({ region: "eu-west-1", credentials, endpoint: server.url })),
      );
    }),
  );

  it.effect.each([
    ["TooManyRequestsException", 429, "RateLimitedError"],
    ["LimitExceededException", 400, "QuotaExceededError"],
    ["MessageRejected", 400, "MessageRejectedError"],
    ["BadRequestException", 400, "InvalidMessageError"],
    ["MailFromDomainNotVerifiedException", 400, "PermissionDeniedError"],
    ["AccountSuspendedException", 400, "PermissionDeniedError"],
    ["InternalServiceErrorException", 500, "ProviderUnavailableError"],
  ] as const)("maps %s without replay or raw error disclosure", ([name, status, tag]) =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({
        status,
        body: { __type: name, message: "private-provider-content" },
      }));
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, tag);
          assert.notInclude(JSON.stringify(result.failure), "private-provider-content");
        }
        assert.strictEqual(server.requests.length, 1);
      }).pipe(
        Effect.provide(Ses.layer({ region: "eu-west-1", credentials, endpoint: server.url })),
      );
    }),
  );

  it.effect("keeps lost acknowledgements uncertain and never resends", () =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({ disconnect: true }));
      const result = yield* Effect.gen(function* () {
        const email = yield* Email;
        return yield* email.send(message);
      }).pipe(
        Effect.provide(Ses.layer({ region: "eu-west-1", credentials, endpoint: server.url })),
        Effect.result,
      );
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result) && result.failure._tag === "EmailError")
        assert.strictEqual(result.failure.acceptance, "unknown");
      assert.strictEqual(server.requests.length, 1);
    }),
  );

  it.effect("aborts real SDK request handlers on the Effect deadline", () =>
    Effect.gen(function* () {
      const started = Promise.withResolvers<void>();
      let signal: AbortSignal | undefined;
      const client = new SESv2Client({
        region: "eu-west-1",
        credentials: { accessKeyId: "offline", secretAccessKey: "offline" },
        maxAttempts: 1,
        requestHandler: {
          handle: async (_request: unknown, options?: { abortSignal?: AbortSignal }) => {
            signal = options?.abortSignal;
            started.resolve();
            return new Promise(() => undefined);
          },
        },
      });
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const fiber = yield* Effect.forkChild(email.send(message).pipe(Effect.result));
        yield* Effect.promise(() => started.promise);
        yield* TestClock.adjust("1 second");
        const result = yield* Fiber.join(fiber);
        assert.isTrue(signal?.aborted);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result))
          assert.strictEqual(result.failure.reason._tag, "TimeoutError");
      }).pipe(
        Effect.provide(Ses.layerClient(client, { timeout: Duration.seconds(1) })),
        Effect.ensuring(Effect.sync(() => client.destroy())),
      );
    }),
  );
});

it.effect("keeps borrowed programmer errors as defects", () =>
  Effect.gen(function* () {
    const defect = new Error("SDK programmer defect");
    const exit = yield* Effect.gen(function* () {
      const email = yield* Email;
      return yield* email.send(message);
    }).pipe(
      Effect.provide(
        Ses.layerClient({
          send: async () => {
            throw defect;
          },
        }),
      ),
      Effect.exit,
    );
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      const die = Cause.findDie(exit.cause);
      assert.isTrue(Result.isSuccess(die));
      if (Result.isSuccess(die)) assert.strictEqual(die.success.defect, defect);
    }
  }),
);

it.effect("maps a native credential provider failure before submitting", () =>
  Effect.gen(function* () {
    const server = yield* httpServer(() => ({ body: { MessageId: "unused" } }));
    const layer = Ses.layer({
      region: "eu-west-1",
      endpoint: server.url,
      credentials: async () => {
        const failure = new Error("private-credential");
        failure.name = "CredentialsProviderError";
        throw failure;
      },
    });
    yield* Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "AuthenticationError");
        assert.strictEqual(result.failure.acceptance, "notSubmitted");
        assert.notInclude(JSON.stringify(result.failure), "private-credential");
      }
    }).pipe(Effect.provide(layer));
    assert.strictEqual(server.requests.length, 0);
  }),
);

it.effect("destroys owned clients on scope close and preserves borrowed clients", () =>
  Effect.gen(function* () {
    const destroy = vi.spyOn(SESv2Client.prototype, "destroy");
    yield* Effect.scoped(Layer.build(Ses.layer({ region: "eu-west-1", credentials })));
    assert.strictEqual(destroy.mock.calls.length, 1);
    const client = yield* Effect.acquireRelease(
      Effect.sync(() => new SESv2Client({ region: "eu-west-1", maxAttempts: 1 })),
      (native) => Effect.sync(() => native.destroy()),
    );
    yield* Effect.scoped(Layer.build(Ses.layerClient(client)));
    assert.strictEqual(destroy.mock.calls.length, 1);
    const invalid = yield* Effect.scoped(
      Layer.build(
        Ses.layer({ region: "eu-west-1", credentials, configurationSetName: "invalid\n" }),
      ),
    ).pipe(Effect.result);
    assert.isTrue(Result.isFailure(invalid));
    if (Result.isFailure(invalid))
      assert.strictEqual(invalid.failure.field, "configurationSetName");
    assert.strictEqual(destroy.mock.calls.length, 2);
  }),
);
