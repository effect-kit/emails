import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

import { Predicate } from "effect";

const loopback = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const requireLocal = (hostname: unknown) => {
  if (typeof hostname !== "string" || !loopback.has(hostname))
    throw new Error("External network access requires an explicit test fixture");
};

// SDKs can capture fetch/request at import time. Guard before importing providers so an incomplete
// fixture fails locally instead of making an accidental provider request.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  requireLocal(url.hostname);
  return nativeFetch(input, options);
};

const guardRequest = <F extends typeof http.request | typeof https.request>(request: F): F =>
  new Proxy(request, {
    apply(target, receiver, arguments_) {
      const first: unknown = arguments_[0];
      const extra: unknown = arguments_[1];
      const url = typeof first === "string" ? new URL(first) : first;
      const hostname =
        Predicate.isObject(extra) && "hostname" in extra
          ? extra.hostname
          : url instanceof URL
            ? url.hostname
            : Predicate.isObject(url) && "hostname" in url
              ? url.hostname
              : Predicate.isObject(url) && "host" in url
                ? url.host
                : undefined;
      requireLocal(hostname);
      return Reflect.apply(target, receiver, arguments_);
    },
  });
http.request = guardRequest(http.request);
https.request = guardRequest(https.request);
syncBuiltinESMExports();
