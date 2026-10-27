import type { EmailMessage, EmailRequest } from "@effect-kit/emails";

const sender = { email: "sender@example.com", name: "Équipe" };
const to = { email: "ada@example.com", name: "Ada" };
const otherTo = { email: "grace@example.com", name: "Grâce" };
const cc = { email: "copy@example.com", name: "Copie" };
const bcc = { email: "private@example.com", name: "Privé" };
const replies = [
  { email: "reply@example.com", name: "Réponse" },
  { email: "support@example.com", name: "Support" },
] as const;
const subject = "Bienvenue 🌍";
const text = "Texte 🌍";
const html = '<p>Bienvenue 🌍</p><img src="cid:logo@example.com">';
const headers = { "X-Workflow": "welcome" };
const singleReply = new Set(["sendgrid", "mailersend", "brevo", "mailtrap"]);
const noAttachments = new Set(["mailersend", "brevo"]);
const noInline = new Set(["mailgun", "scaleway", "mailchimp-transactional"]);

export const capabilityMessage = (provider: string): EmailMessage => {
  if (provider === "plunk") return { from: sender, to: to.email, subject, html };
  // A view protects against accidentally serializing the entire backing buffer.
  const content = new Uint8Array([99, 0, 255, 128, 99]).subarray(1, 4);
  const attachment = {
    filename: "facture-é.bin",
    contentType: "application/octet-stream",
    content,
  };
  return {
    from: provider === "azure" ? sender.email : sender,
    to: [to, otherTo],
    cc,
    bcc,
    subject,
    text,
    html,
    headers,
    replyTo: singleReply.has(provider) ? [replies[0]] : replies,
    ...(noAttachments.has(provider)
      ? {}
      : {
          attachments: noInline.has(provider)
            ? [attachment]
            : [
                attachment,
                { ...attachment, filename: "logo-é.bin", contentId: "logo@example.com" },
              ],
        }),
  };
};

export const rejectedCapabilityRequests = (provider: string) => {
  const message = { from: sender.email, to: to.email, subject, html };
  const rejected: {
    request: EmailRequest;
    reason: "InvalidMessageError" | "UnsupportedFeatureError";
  }[] = [
    {
      request: { message: { ...message, headers: { Authorization: "private-token" } } },
      reason: "InvalidMessageError",
    },
    {
      request: { message, options: { idempotencyKey: "x".repeat(257) } },
      reason: ["resend", "eusend", "lettermint", "brevo"].includes(provider)
        ? "InvalidMessageError"
        : "UnsupportedFeatureError",
    },
  ];
  if (singleReply.has(provider))
    rejected.push({
      request: { message: { ...message, replyTo: replies } },
      reason: "UnsupportedFeatureError",
    });
  if (noAttachments.has(provider) || noInline.has(provider))
    rejected.push({
      request: {
        message: {
          ...message,
          attachments: [
            {
              filename: "logo.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0]),
              contentId: "logo@example.com",
            },
          ],
        },
      },
      reason: "UnsupportedFeatureError",
    });
  if (provider === "azure")
    rejected.push({
      request: { message: { ...message, from: sender } },
      reason: "UnsupportedFeatureError",
    });
  if (provider === "lettermint")
    rejected.push({
      request: {
        message: {
          ...message,
          attachments: [
            {
              filename: "logo.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0]),
              contentId: "bare-cid",
            },
          ],
        },
      },
      reason: "InvalidMessageError",
    });
  if (provider === "plunk") {
    for (const fields of [
      { text },
      { cc },
      { bcc },
      { replyTo: replies },
      { headers },
      {
        attachments: [
          {
            filename: "logo.bin",
            contentType: "application/octet-stream",
            content: new Uint8Array([0]),
          },
        ],
      },
    ])
      rejected.push({
        request: { message: { ...message, ...fields } },
        reason: "UnsupportedFeatureError",
      });
    rejected.push(
      {
        request: { message: { ...message, to: [to.email, cc.email] } },
        reason: "InvalidMessageError",
      },
      { request: { message: { ...message, to } }, reason: "InvalidMessageError" },
    );
  }
  return rejected;
};

const fromText = '"Équipe" <sender@example.com>';
const toText = ['"Ada" <ada@example.com>', '"Grâce" <grace@example.com>'];
const ccText = '"Copie" <copy@example.com>';
const bccText = '"Privé" <private@example.com>';
const replyText = ['"Réponse" <reply@example.com>', '"Support" <support@example.com>'];
const common = { subject, text, html, headers };
const stringAddresses = { from: fromText, to: toText, cc: [ccText], bcc: [bccText] };
const objectAddresses = { from: sender, to: [to, otherTo], cc: [cc], bcc: [bcc] };
const bytes = "AP+A";
const nativeAttachments = [
  { filename: "facture-é.bin", contentType: "application/octet-stream", content: bytes },
  {
    filename: "logo-é.bin",
    contentType: "application/octet-stream",
    content: bytes,
    contentId: "logo@example.com",
  },
];
const smtpAddress = ({ email, name }: typeof sender) => ({ address: email, name });
const azureAddress = ({ email, name }: typeof sender) => ({ address: email, displayName: name });
const zeptoAddress = ({ email, name }: typeof sender) => ({ address: email, name });

/** Independently specified native boundary fields; SDK transport behavior has separate fixtures. */
export const capabilityPayloads: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  resend: { ...common, ...stringAddresses, replyTo: replyText, attachments: nativeAttachments },
  nodemailer: {
    ...common,
    from: smtpAddress(sender),
    to: [smtpAddress(to), smtpAddress(otherTo)],
    cc: [smtpAddress(cc)],
    bcc: [smtpAddress(bcc)],
    replyTo: replies.map(smtpAddress),
    envelope: { from: sender.email, to: [to.email, otherTo.email, cc.email, bcc.email] },
    attachments: nativeAttachments.map(({ contentId, ...attachment }) => ({
      ...attachment,
      encoding: "base64",
      ...(contentId === undefined ? {} : { cid: contentId }),
    })),
  },
  ses: {
    FromEmailAddress: fromText,
    Destination: { ToAddresses: toText, CcAddresses: [ccText], BccAddresses: [bccText] },
    ReplyToAddresses: replyText,
    "Content.Simple.Subject.Data": subject,
    "Content.Simple.Body.Text.Data": text,
    "Content.Simple.Body.Html.Data": html,
    "Content.Simple.Headers": [{ Name: "X-Workflow", Value: "welcome" }],
    "Content.Simple.Attachments": nativeAttachments.map(({ filename, contentType, contentId }) => ({
      FileName: filename,
      RawContent: { 0: 0, 1: 255, 2: 128 },
      ContentType: contentType,
      ContentTransferEncoding: "BASE64",
      ContentDisposition: contentId === undefined ? "ATTACHMENT" : "INLINE",
      ...(contentId === undefined ? {} : { ContentId: contentId }),
    })),
  },
  azure: {
    senderAddress: sender.email,
    content: { subject, plainText: text, html },
    recipients: {
      to: [azureAddress(to), azureAddress(otherTo)],
      cc: [azureAddress(cc)],
      bcc: [azureAddress(bcc)],
    },
    replyTo: replies.map(azureAddress),
    headers,
    attachments: nativeAttachments.map(({ filename, contentType, contentId }) => ({
      name: filename,
      contentType,
      contentInBase64: bytes,
      ...(contentId === undefined ? {} : { contentId }),
    })),
  },
  postmark: {
    From: fromText,
    To: toText.join(", "),
    Cc: ccText,
    Bcc: bccText,
    ReplyTo: replyText.join(", "),
    Subject: subject,
    TextBody: text,
    HtmlBody: html,
    Headers: [{ Name: "X-Workflow", Value: "welcome" }],
    Attachments: nativeAttachments.map(({ filename, contentType, contentId }) => ({
      Name: filename,
      Content: bytes,
      ContentType: contentType,
      ContentID: contentId === undefined ? null : `cid:${contentId}`,
    })),
  },
  sendgrid: {
    ...objectAddresses,
    subject,
    replyTo: replies[0],
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
    headers,
    attachments: nativeAttachments.map(({ filename, contentType, contentId }) => ({
      filename,
      type: contentType,
      content: bytes,
      disposition: contentId === undefined ? "attachment" : "inline",
      ...(contentId === undefined ? {} : { content_id: contentId }),
    })),
  },
  mailgun: {
    subject,
    text,
    html,
    ...stringAddresses,
    "h:Reply-To": replyText.join(", "),
    "h:X-Workflow": "welcome",
    attachment: [
      {
        filename: "facture-é.bin",
        contentType: "application/octet-stream",
        data: { type: "Buffer", data: [0, 255, 128] },
      },
    ],
  },
  mailersend: {
    ...common,
    ...objectAddresses,
    reply_to: replies[0],
    headers: [{ name: "X-Workflow", value: "welcome" }],
  },
  brevo: {
    sender,
    to: [to, otherTo],
    cc: [cc],
    bcc: [bcc],
    subject,
    textContent: text,
    htmlContent: html,
    replyTo: replies[0],
    headers,
  },
  mailtrap: {
    ...common,
    ...objectAddresses,
    reply_to: replies[0],
    attachments: nativeAttachments.map(({ filename, contentType, contentId }) => ({
      filename,
      type: contentType,
      content: bytes,
      disposition: contentId === undefined ? "attachment" : "inline",
      ...(contentId === undefined ? {} : { content_id: contentId }),
    })),
  },
  scaleway: {
    ...objectAddresses,
    subject,
    text,
    html,
    additionalHeaders: [
      { key: "X-Workflow", value: "welcome" },
      { key: "Reply-To", value: replyText.join(", ") },
    ],
    attachments: [{ name: "facture-é.bin", type: "application/octet-stream", content: bytes }],
  },
  lettermint: {
    ...common,
    ...stringAddresses,
    reply_to: replyText,
    attachments: nativeAttachments.map(({ contentType, contentId, ...attachment }) => ({
      ...attachment,
      content_type: contentType,
      ...(contentId === undefined ? {} : { content_id: contentId }),
    })),
  },
  eusend: { ...common, ...stringAddresses, replyTo: replyText, attachments: nativeAttachments },
  zeptomail: {
    from: zeptoAddress(sender),
    to: [{ email_address: zeptoAddress(to) }, { email_address: zeptoAddress(otherTo) }],
    cc: [{ email_address: zeptoAddress(cc) }],
    bcc: [{ email_address: zeptoAddress(bcc) }],
    subject,
    textbody: text,
    htmlbody: html,
    reply_to: replies.map(zeptoAddress),
    mime_headers: headers,
    attachments: [{ name: "facture-é.bin", mime_type: "application/octet-stream", content: bytes }],
    inline_images: [
      {
        name: "logo-é.bin",
        mime_type: "application/octet-stream",
        content: bytes,
        cid: "logo@example.com",
      },
    ],
  },
  "mailchimp-transactional": {
    "message.from_email": sender.email,
    "message.from_name": sender.name,
    "message.to": [
      { ...to, type: "to" },
      { ...otherTo, type: "to" },
      { ...cc, type: "cc" },
      { ...bcc, type: "bcc" },
    ],
    "message.subject": subject,
    "message.text": text,
    "message.html": html,
    "message.headers": { ...headers, "Reply-To": replyText.join(", ") },
    "message.preserve_recipients": true,
    "message.attachments": [
      { name: "facture-é.bin", type: "application/octet-stream", content: bytes },
    ],
  },
  plunk: { from: sender.email, name: sender.name, to: to.email, subject, body: html },
};
