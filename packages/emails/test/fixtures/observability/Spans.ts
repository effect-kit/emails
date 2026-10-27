import { Tracer } from "effect";

export const captureSpans = () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { spans, tracer };
};

export const serializeSpan = (span: Tracer.NativeSpan) =>
  JSON.stringify(
    { attributes: [...span.attributes], events: span.events, status: span.status },
    (_key, value: unknown) => (typeof value === "bigint" ? String(value) : value),
  );
