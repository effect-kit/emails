import type { Duration, Layer } from "effect";

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

type Request = (signal?: AbortSignal) => Promise<unknown>;
interface ProviderCase {
  readonly name: string;
  readonly response: unknown;
  readonly signal: boolean;
  readonly layer: (request: Request, timeout: Duration.Duration) => Layer.Layer<Email, unknown>;
}

export const providerCases: ReadonlyArray<ProviderCase> = [
  {
    name: "ses",
    response: { MessageId: "id" },
    signal: true,
    layer: (request, timeout) =>
      Ses.layerClient({ send: (_command, options) => request(options?.abortSignal) }, { timeout }),
  },
  {
    name: "azure",
    response: { id: "id", status: "Succeeded" },
    signal: true,
    layer: (request, timeout) =>
      Azure.layerClient(
        {
          beginSend: async (_message, options) => {
            const response = await request(options?.abortSignal);
            return {
              pollUntilDone: async () => response,
              getResult: () => response,
              stopPolling: () => undefined,
            };
          },
        },
        { timeout },
      ),
  },
  {
    name: "postmark",
    response: { MessageID: "id", ErrorCode: 0 },
    signal: false,
    layer: (request, timeout) => Postmark.layerClient({ sendEmail: () => request() }, { timeout }),
  },
  {
    name: "sendgrid",
    response: [{ statusCode: 202 }, {}],
    signal: false,
    layer: (request, timeout) => SendGrid.layerClient({ send: () => request() }, { timeout }),
  },
  {
    name: "mailgun",
    response: { id: "id" },
    signal: false,
    layer: (request, timeout) =>
      Mailgun.layerClient(
        { messages: { create: () => request() } },
        { domain: "mail.example.com", timeout },
      ),
  },
  {
    name: "mailersend",
    response: { statusCode: 202, headers: { "x-message-id": "id" }, body: "" },
    signal: false,
    layer: (request, timeout) =>
      MailerSend.layerClient({ email: { send: () => request() } }, { timeout }),
  },
  {
    name: "brevo",
    response: { messageId: "id" },
    signal: true,
    layer: (request, timeout) =>
      Brevo.layerClient(
        {
          transactionalEmails: {
            sendTransacEmail: (_message, options) => request(options?.abortSignal),
          },
        },
        { timeout },
      ),
  },
  {
    name: "mailtrap",
    response: { success: true, message_ids: ["id"] },
    signal: false,
    layer: (request, timeout) =>
      Mailtrap.layerClient({ send: () => request() }, { mode: "production", timeout }),
  },
  {
    name: "scaleway",
    response: { emails: [{ id: "id" }] },
    signal: true,
    layer: (request, timeout) =>
      Scaleway.layerClient(
        { createEmail: (_message, options) => request(options?.signal) },
        { projectId: "00000000-0000-4000-8000-000000000001", region: "fr-par", timeout },
      ),
  },
  {
    name: "lettermint",
    response: { message_id: "id", status: "pending" },
    signal: true,
    layer: (request, timeout) =>
      Lettermint.layerClient(
        { emails: { send: (_message, options) => request(options?.signal) } },
        { timeout },
      ),
  },
  {
    name: "eusend",
    response: { data: { id: "id" }, error: null, headers: null },
    signal: false,
    layer: (request, timeout) =>
      Eusend.layerClient({ emails: { send: () => request() } }, { timeout }),
  },
  {
    name: "zeptomail",
    response: { data: [{ code: "EM_104" }], request_id: "request" },
    signal: false,
    layer: (request, timeout) => ZeptoMail.layerClient({ sendMail: () => request() }, { timeout }),
  },
  {
    name: "plunk",
    response: { success: true, data: { emails: [{ status: "queued", email: "id" }] } },
    signal: false,
    layer: (request, timeout) =>
      Plunk.layerClient({ emails: { send: () => request() } }, { timeout }),
  },
  {
    name: "mailchimp-transactional",
    response: [{ email: "ada@example.com", status: "queued", _id: "id" }],
    signal: false,
    layer: (request, timeout) =>
      Mailchimp.layerClient({ messages: { send: () => request() } }, { timeout }),
  },
];
