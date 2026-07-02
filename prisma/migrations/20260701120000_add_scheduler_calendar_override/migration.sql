-- CreateTable
CREATE TABLE "public"."data_scheduler_calendar_override" (
    "key" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'fred',
    "spec" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_scheduler_calendar_override_pkey" PRIMARY KEY ("key")
);
