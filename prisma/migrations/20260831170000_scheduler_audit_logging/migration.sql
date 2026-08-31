CREATE TYPE "mds"."SchedulerInvocationStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

CREATE TABLE "mds"."scheduler_invocation" (
    "id" UUID NOT NULL,
    "job" VARCHAR(64) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" "mds"."SchedulerInvocationStatus" NOT NULL,
    "selected_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduler_invocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mds"."schedule_audit_event" (
    "id" UUID NOT NULL,
    "subscription_id" UUID,
    "release_package_id" VARCHAR(64),
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(128) NOT NULL,
    "previous_next_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "metadata" JSONB,
    CONSTRAINT "schedule_audit_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduler_invocation_job_started_at_idx" ON "mds"."scheduler_invocation"("job", "started_at");
CREATE INDEX "scheduler_invocation_status_started_at_idx" ON "mds"."scheduler_invocation"("status", "started_at");
CREATE INDEX "schedule_audit_event_subscription_id_changed_at_idx" ON "mds"."schedule_audit_event"("subscription_id", "changed_at");
CREATE INDEX "schedule_audit_event_release_package_id_changed_at_idx" ON "mds"."schedule_audit_event"("release_package_id", "changed_at");
CREATE INDEX "schedule_audit_event_changed_at_idx" ON "mds"."schedule_audit_event"("changed_at");

ALTER TABLE "mds"."schedule_audit_event"
  ADD CONSTRAINT "schedule_audit_event_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "mds"."data_subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mds"."schedule_audit_event"
  ADD CONSTRAINT "schedule_audit_event_release_package_id_fkey"
  FOREIGN KEY ("release_package_id") REFERENCES "mds"."release_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
