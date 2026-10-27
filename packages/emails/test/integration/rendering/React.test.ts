import { createElement } from "react";

import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as EmailReact from "@effect-kit/emails/react";
import { EmailTest } from "@effect-kit/emails/testing";

import { offlineWelcome } from "#/examples/react-email.js";
import { Welcome } from "#/test/fixtures/rendering/Welcome.js";

const element = createElement(Welcome, {
  name: 'Ada & <friends> "hello"',
  url: "https://example.com/welcome?a=1&b=2",
});

describe("React content rendering", () => {
  it.effect(
    "escapes user content, derives text from one execution and sends canonical content",
    () =>
      Effect.gen(function* () {
        let executions = 0;
        const Component = () => {
          executions++;
          return element;
        };
        const rendered = EmailReact.render(createElement(Component));
        assert.strictEqual(executions, 0);

        const content = yield* rendered;
        assert.strictEqual(executions, 1);
        assert.include(content.html, "&lt;friends&gt;");
        assert.include(content.html, "Ada &amp;");
        assert.include(content.html, "a=1&amp;b=2");
        assert.include(content.text, 'Ada & <friends> "hello" 🌍');
        assert.include(content.text, "https://example.com/welcome?a=1&b=2");
        assert.notInclude(content.text, "HTML-only preview");

        const email = yield* Email;
        const recorder = yield* EmailTest;
        yield* email.send({
          from: "hello@example.com",
          to: "ada@example.com",
          subject: "Welcome",
          ...content,
        });
        const captured = yield* recorder.messages;
        assert.strictEqual(captured[0]?.html, content.html);
        assert.strictEqual(captured[0]?.text, content.text);
        yield* rendered;
        assert.strictEqual(executions, 2);
      }).pipe(Effect.provide(EmailTest.layer())),
  );

  it.effect("supports explicit single-body modes and reports empty text safely", () =>
    Effect.gen(function* () {
      const html = yield* EmailReact.render(element, { mode: "html" });
      const text = yield* EmailReact.render(element, { mode: "text" });
      assert.deepStrictEqual(Object.keys(html), ["html"]);
      assert.deepStrictEqual(Object.keys(text), ["text"]);

      const empty = yield* EmailReact.render(
        createElement("div", { "data-private": "secret-prop" }),
      ).pipe(Effect.result);
      assert.isTrue(Result.isFailure(empty));
      if (Result.isFailure(empty)) {
        assert.strictEqual(empty.failure.reason, "InvalidContent");
        assert.notInclude(JSON.stringify(empty.failure), "secret-prop");
      }
    }),
  );

  it.effect("keeps component failures as defects instead of expected send/render failures", () =>
    Effect.gen(function* () {
      const defect = new Error("Component failed");
      const Broken = (): never => {
        throw defect;
      };
      const exit = yield* EmailReact.render(createElement(Broken)).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        const die = Cause.findDie(exit.cause);
        assert.isTrue(Result.isSuccess(die));
        if (Result.isSuccess(die)) assert.strictEqual(die.success.defect, defect);
      }
    }),
  );

  it.effect("runs the documented TSX example through the public testing Layer", () =>
    Effect.gen(function* () {
      const receipt = yield* offlineWelcome;
      assert.strictEqual(receipt.status, "accepted");
    }),
  );
});

it.effect("rejects invalid JavaScript input/options without exposing rejected values", () =>
  Effect.gen(function* () {
    // @ts-expect-error Exercise the JavaScript caller boundary.
    const invalidElement = yield* EmailReact.render({ private: "secret-prop" }).pipe(Effect.result);
    // @ts-expect-error Exercise the runtime option boundary without weakening the public type.
    const invalidOptions = yield* EmailReact.render(element, { mode: "secret-prop" }).pipe(
      Effect.result,
    );
    assert.isTrue(Result.isFailure(invalidElement));
    assert.isTrue(Result.isFailure(invalidOptions));
    if (Result.isFailure(invalidElement))
      assert.strictEqual(invalidElement.failure.reason, "InvalidElement");
    if (Result.isFailure(invalidOptions)) {
      assert.strictEqual(invalidOptions.failure.reason, "InvalidOptions");
      assert.notInclude(JSON.stringify(invalidOptions.failure), "secret-prop");
    }
  }),
);
