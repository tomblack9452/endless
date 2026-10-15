import { describe, expect, it } from 'vitest';
import { REPORT_REASONS, reportAnswer } from '../src/ui/report';
import REPORTS from '../supabase/migrations/0017_reports.sql?raw';

// Reporting a pilot from their card on the boards (the database side is in sql.test.ts).

describe('the report link', () => {
  it('offers the reasons the server takes, in words', () => {
    expect(REPORT_REASONS.map(([id]) => id)).toEqual(['name', 'score', 'other']);
    expect(REPORT_REASONS.map(([, text]) => text)).toEqual(['offensive name', 'impossible score', 'other']);
    expect(REPORTS).toContain("check (reason in ('name', 'score', 'other'))");
  });

  it('answers with thanks, already, or why not', () => {
    expect(reportAnswer({ ok: true, already: false })).toBe("thanks. we'll take a look");
    expect(reportAnswer({ ok: true, already: true })).toBe('you reported them this week already');
    expect(reportAnswer({ ok: false, message: 'no connection' })).toBe('no connection');
  });
});
