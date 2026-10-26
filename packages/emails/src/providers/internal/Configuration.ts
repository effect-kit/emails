import { Duration, Schema } from "effect";

export const PositiveDuration = Schema.Duration.check(
  Schema.makeFilter((value) => Duration.isFinite(value) && Duration.toMillis(value) > 0),
);
export const SecretToken = Schema.String.check(Schema.isPattern(/^[!-~]+$/));
