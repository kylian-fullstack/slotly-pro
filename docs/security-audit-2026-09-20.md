# Security audit — 2026-09-20

Scope: the Slotly Pro identity and tenancy slice and its locked dependency graph.

## Results

- `pnpm audit --audit-level moderate`: no known vulnerabilities after pinning patched transitive versions of `deepmerge-ts` and `mysql2` through workspace overrides.
- Repository secret-pattern scan: no private-key blocks, AWS access-key identifiers, GitHub personal access tokens or OpenAI-style secret keys found outside ignored local environment files.
- Direct dependency licenses are recorded in `dependency-baseline.md`; all direct production dependencies use permissive licenses.
- Local production credentials remain in ignored `.env.production.local`; `.env.example` contains development-only placeholders and no reusable secret.

This is a point-in-time engineering check, not a compliance certification. It must be rerun when the lockfile changes.
