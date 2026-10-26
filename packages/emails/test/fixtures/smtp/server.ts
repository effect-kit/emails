import { Buffer } from "node:buffer";

import { Effect } from "effect";

import { SMTPServer } from "smtp-server";
import type { SMTPServerOptions } from "smtp-server";

export const smtpError = (responseCode: number) =>
  Object.assign(new Error("inert fixture rejection"), { responseCode });

export const smtpServer = (options: SMTPServerOptions = {}) =>
  Effect.acquireRelease(
    Effect.promise(
      () =>
        new Promise<{
          server: SMTPServer;
          port: number;
          messages: Buffer[];
          errors: Error[];
          closed: Promise<void>;
        }>((resolve, reject) => {
          const messages: Buffer[] = [];
          const errors: Error[] = [];
          const closed = Promise.withResolvers<void>();
          const server = new SMTPServer({
            authOptional: true,
            disabledCommands: ["STARTTLS", "AUTH"],
            disableReverseLookup: true,
            logger: false,
            closeTimeout: 100,
            onClose: () => closed.resolve(),
            onData: (stream, _session, callback) => {
              const chunks: Buffer[] = [];
              stream.on("data", (chunk: Buffer) => chunks.push(chunk));
              stream.once("error", callback);
              stream.once("end", () => {
                messages.push(Buffer.concat(chunks));
                callback(null, "queued offline");
              });
            },
            ...options,
          });
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            server.on("error", (error) => errors.push(error));
            const address = server.server.address();
            if (address === null || typeof address === "string") {
              reject(new Error("Missing fixture port"));
              return;
            }
            resolve({ server, port: address.port, messages, errors, closed: closed.promise });
          });
        }),
    ),
    (fixture) =>
      Effect.promise(async () => {
        for (const connection of fixture.server.connections) connection.close();
        await new Promise<void>((resolve) => fixture.server.close(resolve));
        if (fixture.errors.length > 0)
          throw new AggregateError(fixture.errors, "SMTP fixture server errors");
      }),
  );
