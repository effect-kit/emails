import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";

import { Effect } from "effect";

export interface HttpRequest {
  readonly path: string;
  readonly method: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}
export interface HttpResponse {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly disconnect?: boolean;
}

export const httpServer = (respond: (request: HttpRequest, index: number) => HttpResponse) =>
  Effect.acquireRelease(
    Effect.promise(
      () =>
        new Promise<{ url: URL; requests: HttpRequest[]; close(): Promise<void> }>(
          (resolve, reject) => {
            const requests: HttpRequest[] = [];
            const errors: unknown[] = [];
            const server = createServer(async (request, response) => {
              try {
                const chunks: Buffer[] = [];
                for await (const chunk of request) chunks.push(Buffer.from(chunk));
                const captured = {
                  path: request.url ?? "/",
                  method: request.method ?? "GET",
                  headers: request.headers,
                  body: Buffer.concat(chunks),
                };
                requests.push(captured);
                const reply = respond(captured, requests.length - 1);
                if (reply.disconnect) {
                  response.destroy();
                  return;
                }
                response.writeHead(reply.status ?? 200, {
                  "content-type": "application/json",
                  ...reply.headers,
                });
                response.end(
                  typeof reply.body === "string"
                    ? reply.body
                    : reply.body === undefined
                      ? ""
                      : JSON.stringify(reply.body),
                );
              } catch (error) {
                errors.push(error);
                response.destroy();
              }
            });
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
              server.off("error", reject);
              server.on("error", (error) => errors.push(error));
              const address = server.address();
              if (!address || typeof address === "string") {
                reject(new Error("Missing HTTP fixture port"));
                return;
              }
              resolve({
                url: new URL(`http://127.0.0.1:${address.port}`),
                requests,
                close: async () => {
                  server.closeAllConnections();
                  await new Promise<void>((done) => server.close(() => done()));
                  if (errors.length > 0) throw new AggregateError(errors, "HTTP fixture failed");
                },
              });
            });
          },
        ),
    ),
    (server) => Effect.promise(() => server.close()),
  );
