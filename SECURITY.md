# Security Policy

Meta_Kim contains governance prompts, runtime adapters, local hooks, setup
scripts, and MCP integration code. Please report security issues privately.

## Supported Versions

Security fixes target the current `main` branch and the latest published package
version when publication is active. Older local worktrees may not receive
backports.

## Reporting A Vulnerability

Use GitHub private vulnerability reporting or a private maintainer channel when
available. If neither is configured for the repository, open a minimal public
issue that says a private security report is needed, without exploit details,
tokens, local paths containing secrets, or proof-of-concept payloads.

Please include:

- affected commit, version, or package artifact
- runtime involved: Claude Code, Codex, OpenClaw, Cursor, MCP, setup, hook, or
  packaging
- impact and prerequisites
- safe reproduction steps
- whether credentials, network calls, or local environment mutation are involved

## Handling Expectations

Maintainers should acknowledge reports, triage impact, and keep evidence layers
separate. A validator pass does not close a security issue when runtime or
user-visible behavior is still unverified.

## Sensitive Areas

Extra care is required for:

- hook execution and command blocking
- MCP Memory Service registration and HTTP access
- install, update, uninstall, and global sync scripts
- runtime projection boundaries
- generated artifacts that could leak local paths or secrets
