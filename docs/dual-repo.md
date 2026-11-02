[English](./dual-repo.md) · [中文](./dual-repo.zh-CN.md)

# Dual-repo sync

This GitHub repository is the public release surface. Private development lives in a private Cursor Origin codebase.

Bring a change here by transplanting the public-safe diff onto the current `main` of this repository, then opening a normal pull request. Do not force-push. Do not rewrite published history.

Leave these out of commits and docs that land here:

- Course identifiers
- Personal names, email addresses, and phone numbers
- Notion tokens and Internal Integration secrets
- Private classroom material
