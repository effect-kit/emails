import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Nodemailer from "@effect-kit/emails/nodemailer";
import { simpleParser } from "mailparser";

import { repeatedSubmission } from "#/test/fixtures/conformance/email-contract.js";
import { message } from "#/test/fixtures/email.js";
import { smtpError, smtpServer } from "#/test/fixtures/smtp/server.js";

describe("real SMTP transport", () => {
  it.effect("preserves decoded MIME, Unicode, binary/CID attachments and BCC privacy", () =>
    Effect.gen(function* () {
      const fixture = yield* smtpServer();
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const bytes = new Uint8Array([0, 255, 128]);
        const send = email.send({
          ...message,
          from: { email: "sender@example.com", name: 'Équipe, "Acme"' },
          to: ["Ada@example.com", "Ada@example.com"],
          cc: "copy@example.com",
          bcc: "hidden@example.com",
          replyTo: ["reply@example.com", "other@example.com"],
          html: '<p>Bienvenue 🌍</p><img src="cid:logo">',
          headers: { "X-Workflow": "welcome" },
          attachments: [
            {
              filename: "logo.bin",
              contentType: "application/octet-stream",
              content: bytes,
              contentId: "logo",
            },
          ],
        });
        const [receipt] = yield* repeatedSubmission(
          send,
          Effect.sync(() => fixture.messages.length),
        );
        const mime = yield* Effect.promise(() =>
          simpleParser(fixture.messages[0] ?? "", { skipImageLinks: true }),
        );
        assert.strictEqual(mime.from?.value[0]?.name, 'Équipe, "Acme"');
        assert.strictEqual(mime.text?.trim(), message.text);
        assert.include(mime.html, "Bienvenue 🌍");
        assert.isUndefined(mime.bcc);
        assert.strictEqual(mime.headers.get("x-workflow"), "welcome");
        assert.deepStrictEqual(new Uint8Array(mime.attachments[0]?.content ?? []), bytes);
        assert.strictEqual(mime.attachments[0]?.cid, "logo");
        assert.strictEqual(receipt.references[0]?.kind, "smtpMessageId");
        assert.strictEqual(receipt.references[0]?.value, mime.messageId);
        assert.deepStrictEqual(
          receipt.recipients?.map(({ role, index, status }) => ({ role, index, status })),
          [
            { role: "to", index: 0, status: "accepted" },
            { role: "to", index: 1, status: "accepted" },
            { role: "cc", index: 0, status: "accepted" },
            { role: "bcc", index: 0, status: "accepted" },
          ],
        );
      }).pipe(
        Effect.provide(
          Nodemailer.layer({
            transport: { host: "127.0.0.1", port: fixture.port, pool: true, maxConnections: 1 },
          }),
        ),
      );
      yield* Effect.promise(() => fixture.closed);
      assert.strictEqual(fixture.server.connections.size, 0);
    }),
  );

  it.effect(
    "returns partial acceptance for rejected RCPT while retaining duplicate/role positions",
    () =>
      Effect.gen(function* () {
        const fixture = yield* smtpServer({
          onRcptTo: (recipient, _session, callback) =>
            callback(recipient.address === "rejected@example.com" ? smtpError(550) : null),
        });
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const receipt = yield* email.send({
            ...message,
            to: ["ada@example.com", "ada@example.com"],
            bcc: ["rejected@example.com", "ada@example.com"],
          });
          assert.strictEqual(receipt.status, "partiallyAccepted");
          assert.deepStrictEqual(
            receipt.recipients?.map(({ role, index, status }) => ({ role, index, status })),
            [
              { role: "to", index: 0, status: "accepted" },
              { role: "to", index: 1, status: "accepted" },
              { role: "bcc", index: 0, status: "rejected" },
              { role: "bcc", index: 1, status: "accepted" },
            ],
          );
          assert.strictEqual(receipt.recipients?.[2]?.rejectionCode, "SMTP_550");
          assert.lengthOf(fixture.messages, 1);
        }).pipe(
          Effect.provide(
            Nodemailer.layer({ transport: { host: "127.0.0.1", port: fixture.port } }),
          ),
        );
      }),
  );

  it.effect.each([
    ["recipient", 550, "RecipientRejectedError", "rejected"],
    ["recipient", 450, "ProviderUnavailableError", "rejected"],
    ["sender", 550, "MessageRejectedError", "rejected"],
    ["data", 554, "MessageRejectedError", "rejected"],
    ["data", 451, "ProviderUnavailableError", "rejected"],
    ["auth", 535, "AuthenticationError", "notSubmitted"],
    ["auth", 454, "ProviderUnavailableError", "notSubmitted"],
  ] as const)("classifies SMTP rejection %j", ([stage, code, tag, acceptance]) =>
    Effect.gen(function* () {
      const fixture = yield* smtpServer({
        ...(stage === "recipient"
          ? { onRcptTo: (_recipient, _session, callback) => callback(smtpError(code)) }
          : {}),
        ...(stage === "sender"
          ? { onMailFrom: (_sender, _session, callback) => callback(smtpError(code)) }
          : {}),
        ...(stage === "data"
          ? {
              onData: (stream, _session, callback) => {
                stream.resume();
                stream.once("end", () => callback(smtpError(code)));
              },
            }
          : {}),
        ...(stage === "auth"
          ? {
              authOptional: false,
              disabledCommands: ["STARTTLS"],
              onAuth: (_auth, _session, callback) => callback(smtpError(code)),
            }
          : {}),
      });
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, tag);
          assert.strictEqual(result.failure.acceptance, acceptance);
          assert.notInclude(JSON.stringify(result.failure), "inert fixture rejection");
        }
      }).pipe(
        Effect.provide(
          Nodemailer.layer({
            transport: {
              host: "127.0.0.1",
              port: fixture.port,
              ...(stage === "auth"
                ? { auth: { user: "fixture-user", pass: Redacted.make("fixture-password") } }
                : {}),
            },
          }),
        ),
      );
    }),
  );

  it.effect("never requeues a pooled send when connection is lost after DATA", () =>
    Effect.gen(function* () {
      let submissions = 0;
      const fixture = yield* smtpServer({
        onData: (stream, session) => {
          stream.resume();
          stream.once("end", () => {
            submissions++;
            for (const connection of fixture.server.connections)
              if (connection.session.id === session.id) connection.close();
          });
        },
      });
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.acceptance, "unknown");
          assert.strictEqual(result.failure.reason._tag, "TransportError");
        }
        assert.strictEqual(submissions, 1);
      }).pipe(
        Effect.provide(
          Nodemailer.layer({ transport: { host: "127.0.0.1", port: fixture.port, pool: true } }),
        ),
      );
    }),
  );
});
