# Releasing

1. Merge release changes to `main`.
2. Update `CHANGELOG.md` with Added, Changed, Fixed, and Security sections.
3. Verify CI, worker smoke tests, dependency audit, and forbidden credential checks.
4. Tag the commit with a semantic version such as `v0.1.0`.
5. Push the tag.
6. Confirm `worker-image.yml` publishes the Docker Hub image.
7. Confirm `release.yml` creates the GitHub release and attaches example artifacts.

Each release body should include:

- Summary and features
- Breaking changes
- Migration notes
- Docker image tag
- Install commands
- Verification steps
- Known limitations

Milestones: `v0.1.0` MVP, `v0.2.0` Jungle Grid worker mode, `v0.3.0`
Qwen/Ollama mode, and `v1.0.0` stable.
