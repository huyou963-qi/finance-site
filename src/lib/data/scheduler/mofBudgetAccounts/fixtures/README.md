# Official MOF annual final-account fixtures

Captured on 2026-10-21 from public Ministry of Finance pages, without login.
The 2025 article fixtures retain the exact official tables and title; surrounding
page navigation was removed. Index fixtures preserve the official HTML links.

- `index-2025.html`: https://yss.mof.gov.cn/2025zyjs/
- `capital-2025.html`: https://yss.mof.gov.cn/2025zyjs/202609/t20260916_3997517.htm
- `capital-expenditure-2025.html`: https://yss.mof.gov.cn/2025zyjs/202609/t20260916_3997514.htm
- `social-2025.html`: https://yss.mof.gov.cn/2025zyjs/202609/t20260916_3997512.htm
- `balance-2025.html`: https://yss.mof.gov.cn/2025zyjs/202609/t20260916_3997508.htm
- `central-social-2025.html`: https://yss.mof.gov.cn/2025zyjs/202607/t20260715_3993569.htm
- `index-2018.html`: https://yss.mof.gov.cn/2018czjs/
- `social-2018.html`: discovered by the nationwide social-insurance revenue-table link in `index-2018.html`.
- `capital-expenditure-2018.html`: https://yss.mof.gov.cn/2018czjs/201907/t20190718_3303334.htm
- `index-2019*.html`: https://yss.mof.gov.cn/2019qgczjs/ and `index_1.htm`, `index_2.htm` below that directory.

Compliance check: `https://yss.mof.gov.cn/robots.txt` redirects to the Ministry's
404 HTML page (HTTP 200 after redirect), so it provides no machine-readable rules.
The official index footer says reproduction should credit the source. No access
wall or explicit automation prohibition appeared on these public statistics pages.
Use a single request queue (350 ms minimum spacing), a shared 30-minute promise
cache, a 24-hour HTTP disk cache under `.data/mof-budget-accounts/`, and a weekly
update probe. `MOF_BUDGET_BYPASS_CACHE=1` bypasses the disk cache for live validation.
Never treat a redirected 404 page as valid data.

Important scope notes: the central social-insurance subtotal excludes national
pooling transfers; the nationwide table is used directly, never reconstructed by
adding central and local totals. The 2025 central notes explicitly move some former
industry pension pools into local accounts and bring central-office injury
insurance into scope. These published figures are annual final accounts, not
historical first-release vintages or a constant-scope reconstructed time series.

## Verified accounting identities, 2018–2025

All 24 scope/year balances reconcile using the official original amounts:

- Nationwide: base insurance revenue minus expenditure equals annual balance,
  except 2020, when revenue **total** includes a separately published transfer of 500 亿元. The actual values are 75,863.50 + 500.00 −
  78,372.17 = −2,008.67 亿元. This was a transfer from the National Social Security
  Fund to cover selected local enterprise-pension shortfalls; it is not premium income.
- Local: revenue **including pooling receipts and upper-level subsidies** minus
  expenditure **including pooling remittances** equals balance. The upper-level
  subsidy rows explicitly include 500 亿元 in 2020 and 82 亿元 in 2022.
- Central, 2018–2024: the corresponding final revenue/expenditure **including
  pooling transfers and lower-level subsidies** reconcile to the published balance.
- Central, 2025: the official note redefines central balance as **base subtotals**
  only: 391.86 − 374.61 = 17.25. Pooling balance is separately published:
  2,545.74 + 0.74 − 2,546.44 = 0.04. Do not merge the pooling balance into 17.25.

The 2021 central expenditure page has a source label typo: both the base subtotal
1,308.47 and final total 10,602.99 are labelled `中央社会保险基金支出合计`; its
own note calls the former a subtotal. The parser uses the explicit start of the
central-pooling block as a section boundary to distinguish these rows, preserving
both published values. It does not choose the first/last same-name row arbitrarily.

Adjustment and inclusive-total rows are separate catalog keys; base revenue is
never overwritten with a derived or financing-inclusive value.
