import defineConfig from "klarity/tsdown/library";

export default defineConfig({
  entry: {
    postmark: "src/postmark.ts",
    sendgrid: "src/sendgrid.ts",
    mailgun: "src/mailgun.ts",
    mailersend: "src/mailersend.ts",
    brevo: "src/brevo.ts",
    mailtrap: "src/mailtrap.ts",
    scaleway: "src/scaleway.ts",
    index: "src/index.ts",
    azure: "src/azure.ts",
    ses: "src/ses.ts",
    testing: "src/testing.ts",
    resend: "src/resend.ts",
    nodemailer: "src/nodemailer.ts",
  },
  exports: { devExports: "workspace-source" },
  unbundle: true,
  deps: { neverBundle: [/^node:/] },
  // TypeScript 7.1 changes the warning text handled by Klarity’s 7.0 preset.
  suppressWarnings: [/^TypeScript Go is experimental\. Some options will be unavailable\.$/],
});
