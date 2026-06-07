# Contributing

## Development

1. Fork the repository and branch from `dev`.
2. Run `./scripts/setup.sh`.
3. Use `local-template` mode unless the change specifically needs Jungle Grid.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:python`, and `npm run build`.
5. Open a focused pull request using the repository template.

Feature work should use a feature branch. `main` is stable and `dev` is active
development.

## Safety requirements

Contributions must preserve manual-approval ZeptoMail behavior, public
professional contact provenance, evidence-bound personalization, one allowed
link, domain caps, suppression controls, and fail-closed artifact validation. Do
not add auto-send paths, tracking, attachments, guessed addresses, or hosted
model credentials.

## Reports

Use the issue templates for bugs, integrations, documentation, and features.
Report security or abuse issues through `SECURITY.md`.
