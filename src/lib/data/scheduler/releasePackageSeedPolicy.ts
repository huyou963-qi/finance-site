import { parseReleaseRule } from "./releaseRule";

/** Calendar proof and its future timestamp cannot survive a move to interval probing. */
export function calendarToProbeReset(previousTemplate: unknown, nextTemplate: unknown) {
  if (parseReleaseRule(previousTemplate).type !== "economic_calendar" ||
      parseReleaseRule(nextTemplate).type !== "probe_interval") return null;
  return { scheduleState: {}, nextRunAt: null };
}
