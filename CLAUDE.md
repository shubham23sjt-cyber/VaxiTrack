# VaxiTrack

Newborn vaccination schedule app (India). Requirements live in [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) – read it before adding features, and update its "Implementation notes" section when the code diverges from the spec.

## Git workflow
Branches: `prod` (production) and `beta` (testing). New features are branched from `beta` as `feature/<name>`, merged into `beta` by PR, and only promoted `beta` → `prod` after beta testing is done. Never commit directly to `prod` or `beta`. Full rules in [docs/BRANCHING.md](docs/BRANCHING.md).

## Layout
- `backend/` – NestJS 11 + Prisma 6 + PostgreSQL REST API (the only part built so far).
- `docs/` – project reference.

## Backend commands (run in `backend/`)
- `npm run start:dev` – dev server (needs `.env`, copy from `.env.example`)
- `npm run build` · `npm test` · `npm run test:e2e` · `npx eslint "{src,test}/**/*.ts"`
- `npx prisma validate` / `npx prisma migrate dev` / `npx prisma generate`

## Conventions
- API prefix `/api/v1`; every response uses `{ success, data, message, errors }` (interceptor + exception filter in `src/common`).
- All routes are authenticated by default; opt out with `@Public()`, restrict with `@Roles(Role.DOCTOR, ...)`.
- Scope data by `hospitalId` – doctors and receptionists must never see another hospital's data.
- Pin `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport` to the Nest 11 majors (v12 packages are ESM-only and break Jest/CJS).
- Prisma does not support PostGIS or materialised views natively – use raw SQL migrations for those.
