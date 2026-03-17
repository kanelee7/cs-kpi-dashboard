export interface VocTicketSummary {
  ticket_id: number;
  summary: string;
}

export interface VocWeek {
  iso_week: number;
  week_label: string;
  weekly_summary: string;
  ticket_count: number;
  ticket_summaries: VocTicketSummary[];
}
