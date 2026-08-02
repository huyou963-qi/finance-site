-- 增长方向（rising/falling）：增长 z 相对 N 期前的变化符号，与 growth_state 的「水平」正交。
-- 可空：早期不足 lookback 期时无方向。
ALTER TABLE "mds"."macro_regime" ADD COLUMN "growth_direction" VARCHAR(16);
