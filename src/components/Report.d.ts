import { LeakSummary, LeadWithLeaks } from '@missed-lead/core/leaks';
import { RevenueSummary } from '@missed-lead/core/revenue';
interface ReportProps {
    summary: LeakSummary;
    revenue: RevenueSummary;
    leads: LeadWithLeaks[];
}
export default function Report({ summary, revenue, leads }: ReportProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=Report.d.ts.map