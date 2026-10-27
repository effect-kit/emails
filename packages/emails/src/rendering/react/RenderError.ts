import { Schema } from "effect";

/** Safe failures at the rendering boundary; component exceptions remain defects. */
export class RenderError extends Schema.TaggedError<RenderError>()("RenderError", {
  reason: Schema.Literals(["InvalidElement", "InvalidOptions", "InvalidContent"]),
}) {}
