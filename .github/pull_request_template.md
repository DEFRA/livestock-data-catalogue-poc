<!-- Title: 50 characters or fewer, imperative, capitalised, no full stop (for example "Add EA admin area lookup") -->

## What and why

<!-- What this PR changes and why. Describe the actual change, not the story title. -->

Ticket: <!-- link -->

## How it was tested

<!-- Tests added or updated (scenario names), real results, manual or exploratory checks -->

## Checklist

**Process**

- [ ] Small, focused change on a branch, linked to a ticket. Commit messages follow the Defra rules.
- [ ] README, docs, environment variable lists, `.env.example` and CDP config updated where affected.
- [ ] Version bumped in source (SemVer) if this is a release.

**Quality**

- [ ] Formatter and linter pass, with no rule loosened (neostandard).
- [ ] Tests cover the change, including negative cases. Coverage is at least 90% and not lower. No assertion was weakened or skipped.
- [ ] Readable names, no commented-out code or debug leftovers, no speculative abstraction.

**Security and privacy**

- [ ] External input is validated server-side with allow-lists. Output is encoded. Queries are parameterised.
- [ ] Authorisation is checked on every request and object. Failures are closed, with generic errors.
- [ ] No secrets, credentials or personal data in code, tests, logs or this PR.
- [ ] New or updated dependencies are vetted (Defra choice, maintained, secure, licensed) and pinned to exact versions.
- [ ] Personal data: only what the service needs, kept no longer than needed, and possible to find and delete for one person. New personal data, special category or children's data, automated decisions, new uses of existing data and new third parties (analytics, error tracking, session recording, AI services) are flagged for the privacy notice and DPIA.

**Platform** (tick what applies)

- [ ] Node: Hapi, ES modules, vanilla JS, `npm ci`, `.npmrc` intact, no blocking calls, no in-memory sessions.
- [ ] UI: GOV.UK Design System, works without JavaScript, WCAG 2.2 AA checked, GOV.UK error pattern, accessibility statement still accurate.
- [ ] Every UI element uses GOV.UK Frontend macros, classes and Sass helpers: no hand-written components, hard-coded colours, font sizes or spacing, or restyled `govuk-` classes.
- [ ] GOV.UK service rules: branding fits the domain, cookies page and analytics updated, end pages and feedback intact, no CAPTCHA.
- [ ] CI: actions pinned to full commit SHAs, least-privilege permissions.
- [ ] Containers (CDP): Defra base image, non-root, Linux x86 with `curl` and a shell, listens on `PORT`, and `GET /health` works.
- [ ] Config and scripts: new variables documented, no secrets committed, nothing applied to shared environments outside the pipeline.

**AI assistance** (if used)

- [ ] I have read every AI-assisted line, I understand it and I take responsibility for it.
- [ ] No secrets, credentials or personal data were put into prompts.

## Deviations from standards

<!-- Any Defra standard not met (needs an approved exception), or "None" -->

## Deployment notes

<!-- Config or secret changes, migrations, feature flags, rollback plan, or "None" -->
