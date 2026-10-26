import * as SendGrid from "@effect-kit/emails/sendgrid";
import sendgrid from "@sendgrid/mail";

// The SDK's declaration exports only a singleton. Borrowing that public declared type must still
// work even though owned construction needs a narrow bridge to its runtime MailService constructor.
export const acceptNativeClient = () => SendGrid.layerClient(sendgrid);
