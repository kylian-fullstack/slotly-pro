# Dependency baseline

Verified against the npm registry on 2026-09-20.

| Dependency | Locked version | License | Decision |
|---|---:|---|---|
| Node.js | 24.x (tested with 24.14.0) | MIT | Supported LTS runtime |
| pnpm | 11.19.0 | MIT | Matches the installed compatible major |
| Next.js | 16.3.5 | MIT | Stable approved framework major |
| React / React DOM | 19.3.0 | MIT | Satisfies Next.js peer range |
| TypeScript | 6.0.3 | Apache-2.0 | Stable conservative choice; avoids a premature TS 7 jump |
| Prisma / client | 7.10.0 | Apache-2.0 | Latest stable Prisma 7; Prisma 8 was prerelease at review time |
| Prisma PostgreSQL adapter | 7.10.0 | Apache-2.0 | Matches Prisma exactly |
| pg | 8.23.0 | MIT | PostgreSQL driver required by the Prisma adapter and safety checks |
| Zod | 4.6.5 | MIT | Boundary validation |
| Vitest | 5.0.1 | MIT | Unit and integration runner |
| Playwright | 1.63.0 | Apache-2.0 | Browser verification; satisfies Next peer range |
| ESLint | 9.39.5 | MIT | Latest compatible major for the React plugin used by Next.js 16 |
| eslint-config-next | 16.3.5 | MIT | Matches Next.js |
| argon2 | 0.45.1 | MIT | Audited algorithm implementation; native artifact is pinned |

All direct production licenses are permissive. Transitive licenses remain part of the delivery audit and are not implied by this direct-dependency table.

ESLint 10.11.0 was checked first but rejected because the React plugin bundled with the current Next.js configuration still calls an ESLint 9 context API. The compatible major is deliberately pinned rather than bypassing lint rules.
