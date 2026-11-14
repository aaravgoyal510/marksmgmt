// Shared Query SLA Configuration Constants

export const DEFAULT_QUERY_SLA_HOURS = 48;
export const DEFAULT_QUERY_ESCALATION_HOURS = 96;

export function getQuerySlaHours(): { reminderHours: number; escalationHours: number } {
  const reminderHours = parseInt(process.env.QUERY_SLA_HOURS || `${DEFAULT_QUERY_SLA_HOURS}`, 10) || DEFAULT_QUERY_SLA_HOURS;
  const escalationHours = reminderHours * 2; // e.g. 48h -> 96h
  return { reminderHours, escalationHours };
}
