/** Minimal declarations for the exact untyped 1.4.1 SDK surface exercised by this adapter. */
declare module "@mailchimp/mailchimp_transactional" {
  export default function createClient(apiKey: string): {
    basePath: string;
    requestConfig: { timeout?: number };
    messages: { send(body: unknown): Promise<unknown> };
  };
}
