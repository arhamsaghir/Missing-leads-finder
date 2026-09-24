import { useState } from 'react';
import { parseLeadsCSV, detectLeaks, LeakSummary, LeadWithLeaks, computeRevenue, RevenueSummary } from '@missed-lead/core';
import Report from './Report';
import Templates from './Templates';

/**
 * The v1 CSV analyzer, unchanged from the original single-screen app.
 *
 * Extracted verbatim from App so the session gate can render it as one option
 * without altering its behavior. It is the backfill path the milestone keeps
 * ("CSV upload remains as backfill option") alongside the new live connections.
 */
export function CsvAnalyzer() {
  const [csvText, setCsvText] = useState('');
  const [defaultTicket, setDefaultTicket] = useState(25000);
  const [report, setReport] = useState<{ summary: LeakSummary; revenue: RevenueSummary; leads: LeadWithLeaks[] } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleAnalyze = () => {
    if (!csvText.trim()) {
      setErrors(['Please paste CSV data or load sample data']);
      return;
    }
    setErrors([]);
    setWarnings([]);

    const result = parseLeadsCSV(csvText);
    const leakSummary = detectLeaks(result.leads);
    const revenueSummary = computeRevenue(leakSummary.leads, leakSummary, defaultTicket);

    setReport({ summary: leakSummary, revenue: revenueSummary, leads: leakSummary.leads });
    setErrors(result.errors.map((e) => e.message));
    setWarnings(result.warnings.map((w) => w.message));
  };

  const handleLoadSample = async () => {
    try {
      const response = await fetch('/src/data/sample.csv');
      const text = await response.text();
      setCsvText(text);
      setErrors([]);
      setWarnings([]);
    } catch {
      setErrors(['Failed to load sample data']);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvText(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  return (
    <section className="input-section">
      <div className="input-group">
        <label htmlFor="csv-input">Paste CSV or upload file</label>
        <textarea
          id="csv-input"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="lead_id,created_at,customer_name,contact,source,status,last_contact_at,next_follow_up_at,estimated_value,notes
L1,2024-01-01,John Doe,john@example.com,Web,new,,,50000,Interested"
          rows={8}
        />
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileUpload}
          className="file-input"
        />
      </div>

      <div className="controls-row">
        <div className="input-group">
          <label htmlFor="default-ticket">Default average ticket (cents)</label>
          <input
            id="default-ticket"
            type="number"
            value={defaultTicket}
            onChange={(e) => setDefaultTicket(parseInt(e.target.value) || 25000)}
            min="0"
          />
        </div>
        <div className="button-group">
          <button onClick={handleLoadSample} className="btn-secondary">Load sample data</button>
          <button onClick={handleAnalyze} className="btn-primary">Analyze</button>
        </div>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="messages">
          {errors.map((err, i) => (
            <div key={i} className="error">{err}</div>
          ))}
          {warnings.map((warn, i) => (
            <div key={i} className="warning">{warn}</div>
          ))}
        </div>
      )}

      {report && (
        <>
          <Report
            summary={report.summary}
            revenue={report.revenue}
            leads={report.leads}
          />
          <Templates leads={report.leads} />
        </>
      )}
    </section>
  );
}
