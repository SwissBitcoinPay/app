---
name: checkout-port
description: Port the integrators' server package @sattleme/checkout (TypeScript, sattleme/checkout-node) to another language — PHP, C#, Python, Java, Go… — or bring an existing port (its own repository, sattleme/checkout-<language>) in step with a new version of the specification (sattleme/checkout-spec). Use when asked to write, port, translate or update the checkout package, an integration SDK or a "checkout library" in a language other than TypeScript.
---

# Port the checkout package

A port lives in **its own repository**, `sattleme/checkout-<language>`, never in this
one. The procedure is the `PORTING.md` of
[sattleme/checkout-spec](https://github.com/sattleme/checkout-spec): read it first,
then `SPEC.md` in full, and follow both. The TypeScript package, the reference implementation, is
[sattleme/checkout-node](https://github.com/sattleme/checkout-node). In short:

- The port keeps a copy of checkout-spec's files pinned to one commit (`spec/` and its `PIN.json`,
  checked against checkout-spec's `manifest.json` by its tests), and reads the vectors from there.
- Done means: every vector passes (the app's and NIP-44's too), integration tests against a local
  relay and fakes (never the network), the stored JSON identical to the TypeScript package's, CI on
  GitHub-hosted runners, README, CHANGELOG, LICENSE, SECURITY.md.
- Ask the maintainers before adding a dependency, say which and why. Never publish to a registry
  and never push a tag (AGENTS.md, hard rule 2): propose the release workflow, a human runs it.
- Nothing internal in the port's repository: its history and its CI logs are public.
- Where SPEC.md and the TypeScript package disagree, stop and report it. A change to the
  specification itself is a pull request to checkout-spec; the app's vectors (vectors/app/app.json)
  are among this repository's test fixtures (`src/__tests__/fixtures/`).
