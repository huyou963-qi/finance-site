# 2026-10-17 audit repairs

- Builds on PR #29 (NY Fed text dates, fiscal export-refund aliases, preserve schedule after failed bounded retry).
- Census SA/NSA country months are bounded by the earlier latest period of the two dated FT-900 end-use files. Published zero months remain valid; never truncate an individual country to its last nonzero month.
- Historical Netherlands Antilles 2771 ends 2011-04 in the official balance table. Preserve valid history, stop importing later placeholders, disable its obsolete ongoing subscription on explicit seed/maintenance.
- Explicit maintenance: `npx tsx scripts/data-worker/repair-census-placeholders.ts --published-through=YYYY-MM-01`. Save stdout **locally** as rollback evidence, review targets, then repeat under worker and calendar locks with `--apply=<digest>`. A different digest or any nonzero target aborts. Not run automatically during deployment. Vintage history retained; no report/backup files on HK.
- MOF anchors require an exact label followed by the amount; revenue cannot match revenue-related expenditure, tax revenue cannot match nontax revenue, stamp tax cannot match securities transaction stamp tax. Existing connectors reread source history and unified writer captures corrections, never write AI-extracted numbers.
- NBS PPI/industrial/retail consumption requires every eligible monthly member to reach the expected released observation month. Annual members do not block monthly consumption. The official annual calendar supplies the preceding release; successful empty checks cannot skip late detailed files.
- `data:seed -- --catalog=zzz-audited-definitions` is an idempotent metadata-only correction for ten existing FRED/WDI records. Does not resurrect retired instruments, rescale observations or overwrite schedules. GS2/GS10 monthly H.15 averages use probes, not note auctions.
- SAFE sourceRowPath guards and new independently corroborated breadth membership were already deployed on main during this investigation; recheck rather than overwrite them.

Official evidence: https://www.census.gov/foreign-trade/balance/c2771.html ; https://www.census.gov/foreign-trade/current/ ; https://gks.mof.gov.cn/tongjishuju/202609/t20260918_3997709.htm ; https://www.stats.gov.cn/sj/fbrc/bnxxfb/ .
