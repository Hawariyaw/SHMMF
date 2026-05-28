# SHMMF

Shareholders Meeting Management Framework monorepo.

## Apps

- `apps/web`: React + TypeScript dashboard and operations UI.
- `apps/api`: Express + TypeScript API with Socket.IO support.
- `packages/shared`: shared domain models and API contracts.

## Run

```bash
npm install
npm run dev       # frontend
npm run dev:api   # backend
```

## Architecture Principles

- Modular domain-first backend (`modules` per business area).
- Shared contracts between UI and API to avoid data drift.
- Role-based workflow foundation for maker-checker approvals.
- Real-time-ready transport through Socket.IO events.
- Future-friendly path for SQLite now, PostgreSQL migration later.
