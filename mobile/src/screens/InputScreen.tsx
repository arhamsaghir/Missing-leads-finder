import { Box, Text, Button, ButtonText, Badge, BadgeText, ScrollView } from '@missed-lead/ui';
import { TextInput } from 'react-native';

interface InputScreenProps {
  csvText: string;
  onCsvTextChange: (text: string) => void;
  defaultTicket: number;
  onDefaultTicketChange: (val: number) => void;
  errors: string[];
  warnings: string[];
  isLoading: boolean;
  onAnalyze: () => void;
  onLoadSample: () => void;
}

export function InputScreen({
  csvText,
  onCsvTextChange,
  defaultTicket,
  onDefaultTicketChange,
  errors,
  warnings,
  isLoading,
  onAnalyze,
  onLoadSample,
}: InputScreenProps) {
  return (
    <ScrollView flex={1} padding={24} showsScrollIndicator={false}>
      <Box marginBottom={24}>
        <Box display="flex" flexDirection="column" gap={12}>
          <TextInput
            value={csvText}
            onChangeText={onCsvTextChange}
            placeholder="lead_id,created_at,customer_name,contact,source,status,last_contact_at,next_follow_up_at,estimated_value,notes
L1,2024-01-01,John Doe,john@example.com,Web,new,,,50000,Interested"
            multiline
            numberOfLines={8}
            style={{ fontFamily: 'monospace', fontSize: 13, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff' }}
          />

          <Box display="flex" flexDirection="row" gap={8}>
            <Button variant="secondary" onPress={onLoadSample} disabled={isLoading}>
              <ButtonText variant="secondary">Load sample</ButtonText>
            </Button>
            <Button variant="primary" onPress={onAnalyze} disabled={isLoading}>
              <ButtonText variant="primary">{isLoading ? 'Analyzing...' : 'Analyze'}</ButtonText>
            </Button>
          </Box>
        </Box>

        <Box display="flex" flexDirection="row" gap={12} marginTop={16} alignItems="flex-end" flexWrap="wrap">
          <Box flex={1} minWidth={200}>
            <Text variant="body3" color="muted" marginBottom={4} display="block">
              Default average ticket (cents)
            </Text>
            <TextInput
              value={String(defaultTicket)}
              onChangeText={(val) => onDefaultTicketChange(parseInt(val) || 25000)}
              keyboardType="numeric"
              style={{ padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff' }}
            />
          </Box>
        </Box>

        {(errors.length > 0 || warnings.length > 0) && (
          <Box marginTop={16} display="flex" flexDirection="column" gap={8}>
            {errors.map((err, i) => (
              <Badge key={i} variant="error" size="md">
                <BadgeText size="md">{err}</BadgeText>
              </Badge>
            ))}
            {warnings.map((warn, i) => (
              <Badge key={i} variant="warning" size="md">
                <BadgeText size="md">{warn}</BadgeText>
              </Badge>
            ))}
          </Box>
        )}
      </Box>
    </ScrollView>
  );
}