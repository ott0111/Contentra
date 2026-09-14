# Database migrations

The Prisma schema is the source of truth. The repository now contains a Part 3 hardening migration under `0002_part3_production/` for authentication token tables and common workspace query indexes.

Because the original environment did not have a PostgreSQL server or a working npm registry, the migration could not be executed here. In a database-enabled environment:

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Do not use `db push` for production. Review generated Prisma migrations against staging before applying them to production.
