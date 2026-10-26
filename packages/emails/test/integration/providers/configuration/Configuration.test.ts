import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Redacted, Result } from "effect";

import type { Email } from "@effect-kit/emails";
import * as Azure from "@effect-kit/emails/azure";
import * as Brevo from "@effect-kit/emails/brevo";
import * as Eusend from "@effect-kit/emails/eusend";
import * as Lettermint from "@effect-kit/emails/lettermint";
import * as Mailchimp from "@effect-kit/emails/mailchimp-transactional";
import * as MailerSend from "@effect-kit/emails/mailersend";
import * as Mailgun from "@effect-kit/emails/mailgun";
import * as Mailtrap from "@effect-kit/emails/mailtrap";
import * as Plunk from "@effect-kit/emails/plunk";
import * as Postmark from "@effect-kit/emails/postmark";
import * as Scaleway from "@effect-kit/emails/scaleway";
import * as SendGrid from "@effect-kit/emails/sendgrid";
import * as Ses from "@effect-kit/emails/ses";
import * as ZeptoMail from "@effect-kit/emails/zeptomail";

const invalid = Redacted.make("private-token\ninvalid");
type ConfigurationError =
  | Azure.AzureConfigurationError
  | Ses.SesConfigurationError
  | Postmark.ProviderConfigurationError;
const configurations: ReadonlyArray<readonly [string, Layer.Layer<Email, ConfigurationError>]> = [
  ["ses", Ses.layer({ region: "private-region\ninvalid" })],
  ["azure", Azure.layer({ connectionString: invalid })],
  ["postmark", Postmark.layer({ serverToken: invalid })],
  ["sendgrid", SendGrid.layer({ apiKey: invalid })],
  [
    "mailgun",
    Mailgun.layer({
      apiKey: Redacted.make("offline-key"),
      domain: "mail.example.com",
      region: "eu",
      endpoint: new URL("https://offline.example.com/ignored-path"),
    }),
  ],
  ["mailersend", MailerSend.layer({ apiKey: invalid })],
  ["brevo", Brevo.layer({ apiKey: invalid })],
  ["mailtrap", Mailtrap.layer({ token: invalid, mode: "production" })],
  [
    "scaleway",
    Scaleway.layer({
      secretKey: invalid,
      accessKey: "SCWABCDEFGHIJKLMNOPQ",
      projectId: "00000000-0000-4000-8000-000000000001",
      region: "fr-par",
    }),
  ],
  ["lettermint", Lettermint.layer({ sendingToken: invalid })],
  ["eusend", Eusend.layer({ apiKey: invalid })],
  [
    "zeptomail",
    ZeptoMail.layer({ token: invalid, url: new URL("https://offline.example.com/v1.1/email") }),
  ],
  ["plunk", Plunk.layer({ apiKey: invalid })],
  ["mailchimp", Mailchimp.layer({ apiKey: invalid })],
] as const;

describe("owned configuration boundaries", () => {
  it.effect.each(configurations)(
    "fails %s acquisition without exposing credentials",
    ([_name, layer]) =>
      Effect.gen(function* () {
        const result = yield* Layer.build(layer).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.include(
            ["ProviderConfigurationError", "SesConfigurationError", "AzureConfigurationError"],
            result.failure._tag,
          );
          assert.notInclude(JSON.stringify(result.failure), "private-");
        }
      }),
  );
});
