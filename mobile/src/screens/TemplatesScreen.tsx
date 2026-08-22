import { Box, Text, Card, Badge, BadgeText, Button, ButtonText, ScrollView } from '@missed-lead/ui';
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

interface TemplatesScreenProps {
  leads: LeadWithLeaks[];
}

export function TemplatesScreen({ leads }: TemplatesScreenProps) {
  const flaggedLeads = leads.filter((l) => l.leaks.length > 0);

  if (flaggedLeads.length === 0) return null;

  return (
    <ScrollView flex={1} padding="lg" showsScrollIndicator={false}>
      <Box marginBottom="md" flexDirection="row" alignItems="center" justifyContent="space-between">
        <Text variant="heading4" weight="bold">Recovery Templates</Text>
        <Badge variant="outline" size="sm"><BadgeText size="sm">Copy only — no auto-send</BadgeText></Badge>
      </Box>
      <Text variant="body3" color="muted" marginBottom="xl">
        These are draft messages for human review. Copy, edit, and send manually — no automated sending.
      </Text>
      {flaggedLeads.map((lead) => (
        <Card key={lead.lead_id} variant="outlined" padding="lg" marginBottom="lg">
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom="lg" flexWrap="wrap" gap="sm">
            <Text variant="body2" weight="semibold">{lead.customer_name} ({lead.lead_id})</Text>
            <Box flexDirection="row" flexWrap="wrap" gap="sm">
              {lead.leaks.map((l) => (
                <Badge key={l} variant="outline" size="sm"><BadgeText size="sm">{l}</BadgeText></Badge>
              ))}
            </Box>
          </Box>
          {lead.leaks.map((leakType) => {
            const template = templates[leakType];
            if (!template) return null;
            const content = template(lead);
            return (
              <Box key={leakType} marginBottom="lg" paddingTop="lg" borderTopWidth={1} borderColor="$borderColor">
                <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom="sm">
                  <Text variant="body3" weight="medium" color="muted" textTransform="capitalize">
                    {leakType.replace('_', ' ')}
                  </Text>
                  <Button size="sm" variant="ghost" onPress={() => console.log('Copy to clipboard:', content)}>
                    <ButtonText variant="ghost" size="sm">Copy</ButtonText>
                  </Button>
                </Box>
                <Text fontFamily="$mono" fontSize={13} lineHeight={1.6} color="default">
                  {content}
                </Text>
              </Box>
            );
          })}
        </Card>
      ))}
    </ScrollView>
  );
}