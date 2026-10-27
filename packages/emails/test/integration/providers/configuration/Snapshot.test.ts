import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Lettermint from "@effect-kit/emails/lettermint";
import * as Mailgun from "@effect-kit/emails/mailgun";
import * as Postmark from "@effect-kit/emails/postmark";
import * as Scaleway from "@effect-kit/emails/scaleway";
import * as Ses from "@effect-kit/emails/ses";

import { message } from "#/test/fixtures/email.js";

describe("configuration captured during Layer acquisition", () => {
  it.effect("keeps the validated Mailgun routing domain for later sends", () =>
    Effect.gen(function* () {
      const options = { domain: "original.example.com" };
      const domains: string[] = [];
      const live = Mailgun.layerClient(
        {
          messages: {
            create: async (domain) => {
              domains.push(domain);
              return { id: "mailgun-id" };
            },
          },
        },
        options,
      );
      yield* Effect.gen(function* () {
        const email = yield* Email;
        options.domain = "changed.example.com";
        yield* email.send(message);
      }).pipe(Effect.provide(live));
      assert.deepStrictEqual(domains, ["original.example.com"]);
    }),
  );

  it.effect("keeps the validated Postmark stream instead of rereading mutable settings", () =>
    Effect.gen(function* () {
      const options = { messageStream: "original" };
      const streams: (string | undefined)[] = [];
      const live = Postmark.layerClient(
        {
          sendEmail: async (request) => {
            streams.push(request.MessageStream);
            return { MessageID: "postmark-id" };
          },
        },
        options,
      );
      yield* Effect.gen(function* () {
        const email = yield* Email;
        options.messageStream = "changed";
        yield* email.send(message);
      }).pipe(Effect.provide(live));
      assert.deepStrictEqual(streams, ["original"]);
    }),
  );

  it.effect("keeps the SES configuration set validated during acquisition", () =>
    Effect.gen(function* () {
      const options = { configurationSetName: "original" };
      let request: unknown;
      const live = Ses.layerClient(
        {
          send: async (command) => {
            request = command.input;
            return { MessageId: "ses-id" };
          },
        },
        options,
      );
      yield* Effect.gen(function* () {
        const email = yield* Email;
        options.configurationSetName = "changed";
        yield* email.send(message);
      }).pipe(Effect.provide(live));
      assert.propertyVal(request, "ConfigurationSetName", "original");
    }),
  );

  it.effect("keeps Scaleway project routing fixed for the acquired client", () =>
    Effect.gen(function* () {
      const original = "00000000-0000-4000-8000-000000000001";
      const options = { projectId: original, region: "fr-par" as const };
      let request: unknown;
      const live = Scaleway.layerClient(
        {
          createEmail: async (payload) => {
            request = payload;
            return { emails: [{ id: "scaleway-id" }] };
          },
        },
        options,
      );
      yield* Effect.gen(function* () {
        const email = yield* Email;
        options.projectId = "00000000-0000-4000-8000-000000000002";
        yield* email.send(message);
      }).pipe(Effect.provide(live));
      assert.propertyVal(request, "projectId", original);
    }),
  );

  it.effect("uses the acquired Lettermint sandbox policy for response association", () =>
    Effect.gen(function* () {
      const options = { sandbox: false };
      const live = Lettermint.layerClient(
        { emails: { send: async () => ({ message_id: "lettermint-id", status: "pending" }) } },
        options,
      );
      yield* Effect.gen(function* () {
        const email = yield* Email;
        options.sandbox = true;
        const receipt = yield* email.send(message);
        assert.strictEqual(receipt.provider, "lettermint");
      }).pipe(Effect.provide(live));
    }),
  );
});
