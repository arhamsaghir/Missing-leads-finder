import { LeakSummary, LeadWithLeaks } from '@missed-lead/core/leaks';
import { RevenueSummary, formatCurrency } from '@missed-lead/core/revenue';

interface ReportProps {
  summary: LeakSummary;
  revenue: RevenueSummary;
  leads: LeadWithLeaks[];
}

const statusColors: Record<string, string> = {
  new: 'status-new',
  contacted: 'status-contacted',
  qualified: 'status-qualified',
  booked: 'status-booked',
  lost: 'status-lost',
  recovered: 'status-recovered',
  won: 'status-won',
};

export default function Report({ summary, revenue, leads }: ReportProps) {
  return (
    <section className="report-section">
      <h2>Revenue Leak Report</h2>

      <div className="summary-cards">
        <div className="card">
          <span className="card-label">Potential Missed Revenue</span>
          <span className="card-value estimated">{formatCurrency(revenue.potentialMissedRevenue)}</span>
          <span className="card-note">Estimated</span>
        </div>
        <div className="card">
          <span className="card-label">Contacted Revenue at Risk</span>
          <span className="card-value estimated">{formatCurrency(revenue.contactedRevenueAtRisk)}</span>
          <span className="card-note">Estimated</span>
        </div>
        <div className="card">
          <span className="card-label">Confirmed Recovered Revenue</span>
          <span className="card-value confirmed">{formatCurrency(revenue.confirmedRecoveredRevenue)}</span>
          <span className="card-note">Confirmed</span>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric">
          <span className="metric-value">{summary.uniqueAffected}</span>
          <span className="metric-label">Unique Affected Leads</span>
        </div>
        <div className="metric">
          <span className="metric-value">{summary.noReply}</span>
          <span className="metric-label">No Reply</span>
        </div>
        <div className="metric">
          <span className="metric-value">{summary.slowReply}</span>
          <span className="metric-label">Slow Reply ({'>'}24h)</span>
        </div>
        <div className="metric">
          <span className="metric-value">{summary.noFollowUp}</span>
          <span className="metric-label">No Follow-up</span>
        </div>
        <div className="metric">
          <span className="metric-value">{summary.staleQuote}</span>
          <span className="metric-label">Stale Quote ({'>'}7d)</span>
        </div>
      </div>

      <div className="lead-table-container">
        <h3>Lead Details</h3>
        <table className="lead-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Contact</th>
              <th>Source</th>
              <th>Status</th>
              <th>Created</th>
              <th>Last Contact</th>
              <th>Next Follow-up</th>
              <th>Value</th>
              <th>Leaks</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.lead_id}>
                <td>{lead.lead_id}</td>
                <td>{lead.customer_name}</td>
                <td>{lead.contact}</td>
                <td>{lead.source}</td>
                <td><span className={statusColors[lead.status] || 'status-new'}>{lead.status}</span></td>
                <td>{lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '-'}</td>
                <td>{lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : '-'}</td>
                <td>{lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleDateString() : '-'}</td>
                <td>{formatCurrency(lead.estimated_value)}</td>
                <td>
                  {lead.leaks.length > 0 ? (
                    <span className="leaks-badge">
                      {lead.leaks.map(l => <span key={l} className="leak-tag">{l}</span>).join(', ')}
                    </span>
                  ) : (
                    <span className="no-leaks">\u2014</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}