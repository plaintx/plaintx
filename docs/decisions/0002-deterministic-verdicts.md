# 2. Deterministic checks decide verdicts, LLMs only explain

Date: 2026-10-11

## Status

Accepted

## Context

A wrong "all clear" can cost users their funds. LLM output is not reproducible and can be
manipulated by content inside the very transactions and sites we inspect.

## Decision

- The verdict (`danger`, `caution`, `no_known_risks`) is computed only by deterministic,
  tested checks in `packages/core`.
- An LLM may turn a verdict and its findings into plain-English text. It cannot change the level.
- There is no "safe" level. The best result is "no known risks found".

## Consequences

Verdicts are reproducible and auditable. Coverage depends on the checks we write, so missing
checks show up as "no known risks", which is why the wording matters.
