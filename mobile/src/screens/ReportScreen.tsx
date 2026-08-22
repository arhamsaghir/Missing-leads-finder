import { Box, Text, Card, Badge, BadgeText, ScrollView } from '@missed-lead/ui';
import { formatCurrency, RevenueSummary } from '@missed-lead/core/revenue';
import { LeakSummary, LeadWithLeaks } from '@missed-lead/core/leaks';

interface ReportScreenProps {
  summary: LeakSummary;
  revenue: RevenueSummary;
  leads: LeadWithLeaks[];
}

const statusColors: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  new: 'default',
  contacted: 'primary',
  qualified: 'warning',
  booked: 'success',
  lost: 'error',
  recovered: 'success',
  won: 'success',
};

export function ReportScreen({ summary, revenue, leads }: ReportScreenProps) {
  return (
    <ScrollView flex={1} padding="lg" showsScrollIndicator={false}>
      <Text variant="heading4" weight="bold" marginBottom="lg">
        Revenue Leak Report
      </Text>

      <Box display="flex" flexDirection="row" flexWrap="wrap" gap="md" marginBottom="xl">
        <Card variant="outlined" padding="lg">
          <Text variant="body3" color="muted" marginBottom="sm" display="block">
            Potential Missed Revenue
          </Text>
          <Text variant="heading3" weight="bold" color="error">
            {formatCurrency(revenue.potentialMissedRevenue)}
          </Text>
          <Text variant="caption" color="muted">Estimated</Text>
        </Card>
        <Card variant="outlined" padding="lg">
          <Text variant="body3" color="muted" marginBottom="sm" display="block">
            Contacted Revenue at Risk
          </Text>
          <Text variant="heading3" weight="bold" color="warning">
            {formatCurrency(revenue.contactedRevenueAtRisk)}
          </Text>
          <Text variant="caption" color="muted">Estimated</Text>
        </Card>
        <Card variant="outlined" padding="lg">
          <Text variant="body3" color="muted" marginBottom="sm" display="block">
            Confirmed Recovered Revenue
          </Text>
          <Text variant="heading3" weight="bold" color="success">
            {formatCurrency(revenue.confirmedRecoveredRevenue)}
          </Text>
          <Text variant="caption" color="muted">Confirmed</Text>
        </Card>
      </Box>

      <Box display="flex" flexDirection="row" flexWrap="wrap" gap="md" marginBottom="xl">
        <Card variant="outlined" padding="md" alignItems="center" flex={1} minWidth={140}>
          <Text variant="heading2" weight="bold">{summary.uniqueAffected}</Text>
          <Text variant="caption" color="muted" textAlign="center">Unique Affected Leads</Text>
        </Card>
        <Card variant="outlined" padding="md" alignItems="center" flex={1} minWidth={140}>
          <Text variant="heading2" weight="bold" color="error">{summary.noReply}</Text>
          <Text variant="caption" color="muted" textAlign="center">No Reply</Text>
        </Card>
        <Card variant="outlined" padding="md" alignItems="center" flex={1} minWidth={140}>
          <Text variant="heading2" weight="bold" color="warning">{summary.slowReply}</Text>
          <Text variant="caption" color="muted" textAlign="center">Slow Reply ({'>'}24h)</Text>
        </Card>
        <Card variant="outlined" padding="md" alignItems="center" flex={1} minWidth={140}>
          <Text variant="heading2" weight="bold" color="primary">{summary.noFollowUp}</Text>
          <Text variant="caption" color="muted" textAlign="center">No Follow-up</Text>
        </Card>
        <Card variant="outlined" padding="md" alignItems="center" flex={1} minWidth={140}>
          <Text variant="heading2" weight="bold" color="warning">{summary.staleQuote}</Text>
          <Text variant="caption" color="muted" textAlign="center">Stale Quote ({'>'}7d)</Text>
        </Card>
      </Box>

      <Box marginBottom="md">
        <Text variant="heading5" weight="semibold" marginBottom="md">
          Lead Details
        </Text>
        <Box borderWidth={1} borderColor="$borderColor" borderRadius="lg" overflow="hidden">
          <Box display="flex" flexDirection="row" backgroundColor="$backgroundSecondary" borderBottomWidth={1} borderColor="$borderColor" padding="md">
            <Text variant="caption" weight="bold" width="15%">ID</Text>
            <Text variant="caption" weight="bold" width="20%">Customer</Text>
            <Text variant="caption" weight="bold" width="20%">Contact</Text>
            <Text variant="caption" weight="bold" width="15%">Source</Text>
            <Text variant="caption" weight="bold" width="15%">Status</Text>
            <Text variant="caption" weight="bold" width="15%">Value</Text>
          </Box>
          {leads.map((lead) => (
            <Box key={lead.lead_id} display="flex" flexDirection="row" borderBottomWidth={1} borderColor="$borderColor" padding="md">
              <Text variant="caption" width="15%">{lead.lead_id}</Text>
              <Text variant="caption" width="20%">{lead.customer_name}</Text>
              <Text variant="caption" width="20%">{lead.contact}</Text>
              <Text variant="caption" width="15%">{lead.source}</Text>
              <Box width="15%" alignItems="center">
                <Badge variant={statusColors[lead.status] || 'default'} size="sm">
                  <BadgeText size="sm">{lead.status}</BadgeText>
                </Badge>
              </Box>
              <Text variant="caption" width="15%">{formatCurrency(lead.estimated_value)}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </ScrollView>
  );
}