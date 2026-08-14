CREATE TABLE "mds"."macro_observation_vintage" (
  "id" UUID NOT NULL,
  "instrument_id" UUID NOT NULL,
  "obs_date" DATE NOT NULL,
  "available_at" TIMESTAMP(3) NOT NULL,
  "realtime_start" DATE,
  "realtime_end" DATE,
  "value" DOUBLE PRECISION NOT NULL,
  "source" VARCHAR(32) NOT NULL,
  "source_series_id" VARCHAR(64),
  "is_initial_release" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "macro_observation_vintage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "macro_observation_vintage_realtime_check"
    CHECK ("realtime_end" IS NULL OR "realtime_start" IS NULL OR "realtime_end" >= "realtime_start")
);

CREATE TABLE "mds"."sector_regime_signal_snapshot" (
  "id" UUID NOT NULL,
  "signal_date" DATE NOT NULL,
  "return_start_date" DATE NOT NULL,
  "frozen_at" TIMESTAMP(3) NOT NULL,
  "model_version" VARCHAR(64) NOT NULL,
  "protocol_version" VARCHAR(32) NOT NULL,
  "signal_hash" VARCHAR(64) NOT NULL,
  "regime" VARCHAR(24) NOT NULL,
  "growth_direction" VARCHAR(16),
  "inflation_state" VARCHAR(16),
  "vintage_mode" VARCHAR(32) NOT NULL,
  "process_grade" VARCHAR(8) NOT NULL,
  "evidence_grade" VARCHAR(8) NOT NULL,
  "inputs" JSONB NOT NULL,
  "methodology" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sector_regime_signal_snapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sector_regime_signal_return_start_check" CHECK ("return_start_date" >= "frozen_at"::date)
);

CREATE TABLE "mds"."sector_regime_forecast" (
  "id" UUID NOT NULL,
  "snapshot_id" UUID NOT NULL,
  "horizon_months" INTEGER NOT NULL,
  "target_date" DATE NOT NULL,
  "sector" VARCHAR(64) NOT NULL,
  "etf" VARCHAR(16) NOT NULL,
  "rank" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "model_id" VARCHAR(32) NOT NULL,
  "selection_passed" BOOLEAN NOT NULL,
  "entry_trade_date" DATE,
  "exit_trade_date" DATE,
  "sector_return" DOUBLE PRECISION,
  "benchmark_return" DOUBLE PRECISION,
  "excess_return" DOUBLE PRECISION,
  "outcome_hash" VARCHAR(64),
  "evaluated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sector_regime_forecast_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sector_regime_forecast_horizon_check" CHECK ("horizon_months" IN (3, 6, 12)),
  CONSTRAINT "sector_regime_forecast_rank_check" CHECK ("rank" > 0),
  CONSTRAINT "sector_regime_forecast_evaluation_check" CHECK (
    ("evaluated_at" IS NULL AND "entry_trade_date" IS NULL AND "exit_trade_date" IS NULL
      AND "sector_return" IS NULL AND "benchmark_return" IS NULL AND "excess_return" IS NULL AND "outcome_hash" IS NULL)
    OR
    ("evaluated_at" IS NOT NULL AND "entry_trade_date" IS NOT NULL AND "exit_trade_date" IS NOT NULL
      AND "sector_return" IS NOT NULL AND "benchmark_return" IS NOT NULL AND "excess_return" IS NOT NULL AND "outcome_hash" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "macro_observation_vintage_instrument_id_obs_date_available_at_key"
  ON "mds"."macro_observation_vintage"("instrument_id", "obs_date", "available_at");
CREATE INDEX "macro_observation_vintage_instrument_id_available_at_obs_date_idx"
  ON "mds"."macro_observation_vintage"("instrument_id", "available_at", "obs_date");
CREATE INDEX "macro_observation_vintage_source_source_series_id_realtime_start_idx"
  ON "mds"."macro_observation_vintage"("source", "source_series_id", "realtime_start");

CREATE UNIQUE INDEX "sector_regime_signal_snapshot_signal_date_model_version_key"
  ON "mds"."sector_regime_signal_snapshot"("signal_date", "model_version");
CREATE INDEX "sector_regime_signal_snapshot_frozen_at_idx"
  ON "mds"."sector_regime_signal_snapshot"("frozen_at" DESC);
CREATE INDEX "sector_regime_signal_snapshot_model_version_signal_date_idx"
  ON "mds"."sector_regime_signal_snapshot"("model_version", "signal_date" DESC);

CREATE UNIQUE INDEX "sector_regime_forecast_snapshot_id_horizon_months_sector_key"
  ON "mds"."sector_regime_forecast"("snapshot_id", "horizon_months", "sector");
CREATE INDEX "sector_regime_forecast_target_date_evaluated_at_idx"
  ON "mds"."sector_regime_forecast"("target_date", "evaluated_at");
CREATE INDEX "sector_regime_forecast_snapshot_id_horizon_months_rank_idx"
  ON "mds"."sector_regime_forecast"("snapshot_id", "horizon_months", "rank");

ALTER TABLE "mds"."macro_observation_vintage"
  ADD CONSTRAINT "macro_observation_vintage_instrument_id_fkey"
  FOREIGN KEY ("instrument_id") REFERENCES "mds"."Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mds"."sector_regime_forecast"
  ADD CONSTRAINT "sector_regime_forecast_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "mds"."sector_regime_signal_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
