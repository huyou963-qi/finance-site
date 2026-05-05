-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "mds";

-- CreateEnum
CREATE TYPE "mds"."InstrumentKind" AS ENUM ('MACRO_SERIES', 'CRYPTO_SPOT', 'EQUITY', 'INDEX_SPOT', 'FX', 'COMMODITY', 'OTHER');

-- CreateTable
CREATE TABLE "mds"."Instrument" (
    "id" UUID NOT NULL,
    "kind" "mds"."InstrumentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "description" TEXT,
    "freq_label" TEXT,
    "unit" TEXT,
    "wind_wd_id" VARCHAR(64),
    "wind_cat_id" BIGINT,
    "fred_series_id" VARCHAR(64),
    "exchange" VARCHAR(32),
    "ticker_symbol" VARCHAR(64),
    "external_refs" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."MacroObservation" (
    "id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "obs_date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MacroObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."Bar" (
    "id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "timeframe" VARCHAR(16) NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Bar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_wind_wd_id_key" ON "mds"."Instrument"("wind_wd_id");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_fred_series_id_key" ON "mds"."Instrument"("fred_series_id");

-- CreateIndex
CREATE INDEX "Instrument_kind_idx" ON "mds"."Instrument"("kind");

-- CreateIndex
CREATE INDEX "Instrument_exchange_ticker_symbol_idx" ON "mds"."Instrument"("exchange", "ticker_symbol");

-- CreateIndex
CREATE INDEX "MacroObservation_instrument_id_obs_date_idx" ON "mds"."MacroObservation"("instrument_id", "obs_date");

-- CreateIndex
CREATE UNIQUE INDEX "MacroObservation_instrument_id_obs_date_key" ON "mds"."MacroObservation"("instrument_id", "obs_date");

-- CreateIndex
CREATE INDEX "Bar_instrument_id_timeframe_opened_at_idx" ON "mds"."Bar"("instrument_id", "timeframe", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "Bar_instrument_id_timeframe_opened_at_key" ON "mds"."Bar"("instrument_id", "timeframe", "opened_at");

-- AddForeignKey
ALTER TABLE "mds"."MacroObservation" ADD CONSTRAINT "MacroObservation_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "mds"."Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mds"."Bar" ADD CONSTRAINT "Bar_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "mds"."Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
