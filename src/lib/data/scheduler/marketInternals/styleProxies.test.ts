import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDailyStyleProxies } from './styleProxies';
test('日更代理按复权单日收益差，缺任一天不跨日计算', () => {
  const calendar = ['2026-10-19','2026-10-20','2026-10-21','2026-10-22'];
  const prices = calendar.map(date=>({symbol:'SPY',date,adjClose:100}));
  prices.push({symbol:'IWM',date:calendar[0],adjClose:50},{symbol:'IWM',date:calendar[1],adjClose:51},{symbol:'IWM',date:calendar[3],adjClose:52});
  const rows=computeDailyStyleProxies(calendar,prices);
  assert.deepEqual(rows.map(r=>r.values.size),[2,null,null]);
  assert.deepEqual(rows.map(r=>r.values.quality),[null,null,null]);
});
