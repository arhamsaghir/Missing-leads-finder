import { useState, useCallback } from 'react';
import { parseLeadsCSV } from '@missed-lead/core/parser';
import { detectLeaks, LeakSummary, LeadWithLeaks } from '@missed-lead/core/leaks';
import { computeRevenue, RevenueSummary } from '@missed-lead/core/revenue';

export function useLeadAnalysis() {
  const [csvText, setCsvText] = useState('');
  const [defaultTicket, setDefaultTicket] = useState(25000);
  const [report, setReport] = useState<{ summary: LeakSummary; revenue: RevenueSummary; leads: LeadWithLeaks[] } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAnalyze = useCallback(() => {
    if (!csvText.trim()) {
      setErrors(['Please paste CSV data or load sample data']);
      return;
    }
    setIsLoading(true);
    setErrors([]);
    setWarnings([]);

    try {
      const result = parseLeadsCSV(csvText);
      const leakSummary = detectLeaks(result.leads);
      const revenueSummary = computeRevenue(leakSummary.leads, leakSummary, defaultTicket);

      setReport({ summary: leakSummary, revenue: revenueSummary, leads: leakSummary.leads });
      setErrors(result.errors.map((e) => e.message));
      setWarnings(result.warnings.map((w) => w.message));
    } catch (err) {
      setErrors(['Failed to analyze: ' + (err as Error).message]);
    } finally {
      setIsLoading(false);
    }
  }, [csvText, defaultTicket]);

  return {
    csvText,
    setCsvText,
    defaultTicket,
    setDefaultTicket,
    report,
    errors,
    warnings,
    isLoading,
    handleAnalyze,
  };
}