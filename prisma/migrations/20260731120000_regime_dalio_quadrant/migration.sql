-- Dalio 式四象限（增长方向 × 通胀方向），与 regime 列并列而非替代。
-- 可空：方向未知（序列头部 lookback 期）时无值。
ALTER TABLE "mds"."macro_regime" ADD COLUMN "dalio_regime" VARCHAR(24);
