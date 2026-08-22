import { LeadWithLeaks } from '@missed-lead/core/leaks';

const templates: Record<string, (lead: LeadWithLeaks) => string> = {
  no_reply: (lead) => `Hi ${lead.customer_name || 'there'},

I noticed we haven't connected since your inquiry on ${lead.created_at ? new Date(lead.created_at).toLocaleDateString() : 'recently'}. I wanted to make sure you got the information you needed about our services.

Could we schedule a quick call this week? I'm available [days/times] or let me know what works for you.

Best regards,
[Your Name]
[Your Business]`,
  no_follow_up: (lead) => `Hi ${lead.customer_name || 'there'},

Following up on our conversation from ${lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : 'recently'}. I wanted to check in and see if you had any questions or if there's anything else I can help with.

Let me know if you'd like to move forward or need more information.

Best regards,
[Your Name]
[Your Business]`,
  stale_quote: (lead) => `Hi ${lead.customer_name || 'there'},

I wanted to touch base about the quote I sent on ${lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : 'recently'}. It's been a little while and I wanted to see if you had any questions or if there's anything I can clarify.

The quote is valid until [date]. Happy to discuss any adjustments.

Best regards,
[Your Name]
[Your Business]`,
};

interface TemplatesProps {
  leads: LeadWithLeaks[];
}

export default function Templates({ leads }: TemplatesProps) {
  const flaggedLeads = leads.filter(l => l.leaks.length > 0);

  if (flaggedLeads.length === 0) return null;

  return (
    <section className="templates-section">
      <h2>Recovery Templates</h2>
      <p className="templates-note">
        These are draft messages for human review. Copy, edit, and send manually — no automated sending.
      </p>
      {flaggedLeads.map((lead) => (
        <div key={lead.lead_id} className="template-card">
          <div className="template-header">
            <span className="template-lead">{lead.customer_name} ({lead.lead_id})</span>
            <span className="template-leaks">
              {lead.leaks.map(l => <span key={l} className="leak-tag">{l}</span>).join(', ')}
            </span>
          </div>
          {lead.leaks.map((leakType) => {
            const template = templates[leakType];
            if (!template) return null;
            return (
              <div key={leakType} className="template-item">
                <div className="template-type">{leakType.replace('_', ' ')}</div>
                <textarea
                  readOnly
                  value={template(lead)}
                  rows={6}
                  className="template-text"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(template(lead))}
                  className="btn-copy"
                >
                  Copy to clipboard
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}