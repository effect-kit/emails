import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { formatMailbox } from "#/providers/internal/Mailboxes.js";

export const toSesMessage = (message: NormalizedEmailMessage, configurationSetName?: string) => ({
  FromEmailAddress: formatMailbox(message.from),
  Destination: {
    ToAddresses: message.to.map(formatMailbox),
    CcAddresses: message.cc?.map(formatMailbox),
    BccAddresses: message.bcc?.map(formatMailbox),
  },
  ReplyToAddresses: message.replyTo?.map(formatMailbox),
  ConfigurationSetName: configurationSetName,
  Content: {
    Simple: {
      Subject: { Data: message.subject, Charset: "UTF-8" },
      Body: {
        ...(message.text === undefined ? {} : { Text: { Data: message.text, Charset: "UTF-8" } }),
        ...(message.html === undefined ? {} : { Html: { Data: message.html, Charset: "UTF-8" } }),
      },
      Headers: Object.entries(message.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
      Attachments: message.attachments?.map((attachment) => ({
        FileName: attachment.filename,
        RawContent: attachment.content,
        ContentType: attachment.contentType,
        ContentTransferEncoding: "BASE64" as const,
        ContentDisposition:
          attachment.contentId === undefined ? ("ATTACHMENT" as const) : ("INLINE" as const),
        ...(attachment.contentId === undefined ? {} : { ContentId: attachment.contentId }),
      })),
    },
  },
});
export type SesMessage = ReturnType<typeof toSesMessage>;
