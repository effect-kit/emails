import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Redacted, Result } from "effect";

import type { Email } from "@effect-kit/emails";
import * as Eusend from "@effect-kit/emails/eusend";
import * as Mailchimp from "@effect-kit/emails/mailchimp-transactional";
import * as Mailgun from "@effect-kit/emails/mailgun";
import * as Plunk from "@effect-kit/emails/plunk";
import * as Resend from "@effect-kit/emails/resend";
import * as Ses from "@effect-kit/emails/ses";
import * as ZeptoMail from "@effect-kit/emails/zeptomail";

type ConfigurationError =
  | Resend.ResendConfigurationError
  | Ses.SesConfigurationError
  | Mailgun.ProviderConfigurationError;
const token = Redacted.make("sk_offline-key");
const endpoints: ReadonlyArray<{
  name: string;
  path: string;
  field: string;
  layer: (url: URL) => Layer.Layer<Email, ConfigurationError>;
}> = [
  {
    name: "resend",
    path: "/",
    field: "baseUrl",
    layer: (baseUrl) => Resend.layer({ apiKey: token, baseUrl }),
  },
  {
    name: "ses",
    path: "/",
    field: "endpoint",
    layer: (endpoint) => Ses.layer({ region: "eu-west-1", endpoint }),
  },
  {
    name: "mailgun",
    path: "/",
    field: "endpoint",
    layer: (endpoint) =>
      Mailgun.layer({ apiKey: token, domain: "mail.example.com", region: "us", endpoint }),
  },
  {
    name: "eusend",
    path: "/",
    field: "baseUrl",
    layer: (baseUrl) => Eusend.layer({ apiKey: token, baseUrl }),
  },
  {
    name: "zeptomail",
    path: "/v1.1/email",
    field: "url",
    layer: (url) => ZeptoMail.layer({ token, url }),
  },
  {
    name: "mailchimp",
    path: "/api/1.4",
    field: "baseUrl",
    layer: (baseUrl) => Mailchimp.layer({ apiKey: token, baseUrl }),
  },
  {
    name: "plunk",
    path: "/v1/",
    field: "baseUrl",
    layer: (baseUrl) => Plunk.layer({ apiKey: token, baseUrl }),
  },
];

describe("explicit endpoint configuration", () => {
  it.effect.each(endpoints)(
    "rejects ambiguous or credential-bearing $name URLs without echoing them",
    (provider) =>
      Effect.gen(function* () {
        for (const mutation of [
          { search: "?private-token=private-value" },
          { hash: "#private-fragment" },
          { username: "private-user", password: "private-password" },
          { protocol: "ftp:" },
        ]) {
          const url = Object.assign(
            new URL(provider.path, "https://offline.example.com"),
            mutation,
          );
          const result = yield* Effect.scoped(Layer.build(provider.layer(url))).pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
          if (Result.isFailure(result)) {
            assert.strictEqual(result.failure.field, provider.field);
            assert.notInclude(JSON.stringify(result.failure), "private-");
            assert.notInclude(JSON.stringify(result.failure), "offline.example.com");
          }
        }
      }),
  );
});
