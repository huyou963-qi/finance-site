# Deployment runtime policy

Production deployment must be bounded and must not depend on long-running or rate-limited data acquisition. The GitHub Actions deployment therefore performs only:

1. Prisma migration.
2. Idempotent catalog definitions, subscriptions, release packages, and global catalog layout.
3. Local application restart and HTTP health check.

The deployment invokes:

```bash
npm run data:apply -- --skip-migrate --skip-equity --skip-calendar --skip-backfill --skip-verify
```

The following work is deliberately excluded from a deployment:

- historical archive scans and bulk backfills;
- `data:backfill-empty`;
- `data:sync-calendar` and all external economic-calendar requests;
- full-domain data verification;
- S&P 500 / US-equity universe discovery;
- quant derived-table rebuilds.

These operations belong to either the server cron jobs (`data:worker` every five minutes and `data:sync-calendar` hourly) or an explicit, logged, `flock`-protected background task. Examples for the rate-limited China archive backfills are documented in their domain specifications. COT's 60-week history is likewise explicit:

```bash
npm run data:seed-cot -- --bulk-only
```

`npm run data:apply` without skip flags remains available for a planned first-time initialization or full maintenance window, never as the normal deployment hook.
