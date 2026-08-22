import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const templates = {
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
export default function Templates({ leads }) {
    const flaggedLeads = leads.filter(l => l.leaks.length > 0);
    if (flaggedLeads.length === 0)
        return null;
    return (_jsxs("section", { className: "templates-section", children: [_jsx("h2", { children: "Recovery Templates" }), _jsx("p", { className: "templates-note", children: "These are draft messages for human review. Copy, edit, and send manually \u2014 no automated sending." }), flaggedLeads.map((lead) => (_jsxs("div", { className: "template-card", children: [_jsxs("div", { className: "template-header", children: [_jsxs("span", { className: "template-lead", children: [lead.customer_name, " (", lead.lead_id, ")"] }), _jsx("span", { className: "template-leaks", children: lead.leaks.map(l => _jsx("span", { className: "leak-tag", children: l }, l)).join(', ') })] }), lead.leaks.map((leakType) => {
                        const template = templates[leakType];
                        if (!template)
                            return null;
                        return (_jsxs("div", { className: "template-item", children: [_jsx("div", { className: "template-type", children: leakType.replace('_', ' ') }), _jsx("textarea", { readOnly: true, value: template(lead), rows: 6, className: "template-text" }), _jsx("button", { onClick: () => navigator.clipboard.writeText(template(lead)), className: "btn-copy", children: "Copy to clipboard" })] }, leakType));
                    })] }, lead.lead_id)))] }));
}
//# sourceMappingURL=Templates.js.map