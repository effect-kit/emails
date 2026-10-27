# React rendering

Install `@effect-kit/emails`, `effect`, `@react-email/render@2.1.1`, `react@19.3.1` and
`react-dom@19.3.1`. TypeScript applications also need `@types/react@19.3.0`.
All rendering peers are optional; core/testing/provider-only consumers do not load React.
The focused renderer avoids installing the React Email preview application or component library.

```tsx
import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as EmailReact from "@effect-kit/emails/react";

const Welcome = ({ name }: { name: string }) => <p>Hello {name}!</p>;

const program = Effect.gen(function* () {
  const content = yield* EmailReact.render(<Welcome name="Ada" />);
  const email = yield* Email;
  return yield* email.send({
    from: "hello@example.com",
    to: "ada@example.com",
    subject: "Welcome",
    ...content,
  });
});
```

`render(element)` returns a cold `Effect<{ html, text }, RenderError>` with no service requirements.
It renders the component once and derives text from that same HTML through the renderer's stable
plain-text converter. `render(element, { mode: "html" })` returns only `{ html }`; mode `"text"`
returns only `{ text }`. Choose output compatible with the selected provider, such as HTML-only
for Plunk. No vendor-specific react option is used, and rendering never sends email or acquires a client.

React handles escaping. Plain text decodes entities, preserves meaningful links and honors
`data-skip-in-text="true"`. There is no pretty-print pass, unstable formatter, generated ID/key,
clock or implicit rendering retry. Deterministic templates produce corresponding content; components
that read time, randomness or external state remain the application's responsibility. The renderer
is not an HTML sanitizer: use trusted components and validate any raw HTML supplied to them.

RenderError reasons are InvalidElement, InvalidOptions and InvalidContent. InvalidContent includes
empty generated text; image-only templates should explicitly select HTML mode or supply suitable
text separately. Errors contain no template props, HTML or original exception. Unexpected component
or renderer exceptions remain defects with their original identity; applications own defect logging.

Interruption ends Effect waiting. The renderer exposes no AbortSignal, so it cannot stop asynchronous
work started by a component. Keep templates pure; perform Effectful data access before rendering.
Provider sends keep their existing errors, capability checks and acceptance semantics.

The repository's `examples/react-email.tsx` composes rendering with EmailTest. Offline semantic tests
cover escaping, text derivation, cold execution, typed failures and defects. A packed TSX consumer
uses only rendering peers and Effect, while the core-only consumer still works without React.
