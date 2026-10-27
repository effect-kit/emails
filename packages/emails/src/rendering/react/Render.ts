import { isValidElement } from "react";
import type { ReactElement } from "react";

import { Effect, Result, Schema } from "effect";

import { render as renderHtml, toPlainText } from "@react-email/render";

import { EmailBody } from "#/message/EmailMessage.js";
import { RenderError } from "#/rendering/react/RenderError.js";

export const RenderOptions = Schema.Struct({
  mode: Schema.optionalKey(Schema.Literals(["htmlAndText", "html", "text"])),
});
export type RenderOptions = typeof RenderOptions.Type;

export interface HtmlContent {
  readonly html: string;
}
export interface TextContent {
  readonly text: string;
}
export interface HtmlAndTextContent extends HtmlContent, TextContent {}
export type RenderedContent = HtmlAndTextContent | HtmlContent | TextContent;

const renderContent = Effect.fnUntraced(function* (
  element: ReactElement,
  options: RenderOptions,
): Effect.fn.Return<RenderedContent, RenderError> {
  const decoded = Schema.decodeUnknownResult(RenderOptions)(options, { onExcessProperty: "error" });
  if (Result.isFailure(decoded)) return yield* new RenderError({ reason: "InvalidOptions" });
  if (!isValidElement(element)) return yield* new RenderError({ reason: "InvalidElement" });

  // Render once so HTML and text describe the same component execution. The renderer has no
  // cancellation API; interruption ends local waiting, and component-owned work may continue.
  const html = yield* Effect.promise(() => renderHtml(element));
  const mode = decoded.success.mode ?? "htmlAndText";
  const text = mode === "html" ? undefined : toPlainText(html);

  if (
    (mode !== "text" && !Schema.is(EmailBody)(html)) ||
    (mode !== "html" && !Schema.is(EmailBody)(text))
  ) {
    return yield* new RenderError({ reason: "InvalidContent" });
  }

  if (mode === "html") return { html };
  if (text === undefined) return yield* new RenderError({ reason: "InvalidContent" });
  return mode === "text" ? { text } : { html, text };
});

/** Optional rendering only: no Email service, provider SDK, or send operation is acquired. */
export function render(
  element: ReactElement,
  options?: { readonly mode?: "htmlAndText" },
): Effect.Effect<HtmlAndTextContent, RenderError>;
export function render(
  element: ReactElement,
  options: { readonly mode: "html" },
): Effect.Effect<HtmlContent, RenderError>;
export function render(
  element: ReactElement,
  options: { readonly mode: "text" },
): Effect.Effect<TextContent, RenderError>;
export function render(
  element: ReactElement,
  options: RenderOptions,
): Effect.Effect<RenderedContent, RenderError>;
export function render(
  element: ReactElement,
  options: RenderOptions = {},
): Effect.Effect<RenderedContent, RenderError> {
  return renderContent(element, options);
}
