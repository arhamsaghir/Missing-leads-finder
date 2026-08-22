import { Box, Text, Button, Badge, Card, ScrollView } from '@missed-lead/ui';
import { TextInput, Switch } from 'react-native';
import { useState } from 'react';

export function SettingsScreen() {
  const [defaultTicket, setDefaultTicket] = useState(25000);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [showLeakDetails, setShowLeakDetails] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  return (
    <ScrollView flex={1} padding="lg" showsScrollIndicator={false}>
      <Text variant="heading4" weight="bold" marginBottom="xl">
        Settings
      </Text>

      <Card variant="outlined" padding="lg" marginBottom="lg">
        <Text variant="heading5" weight="semibold" marginBottom="md">
          Analysis Defaults
        </Text>
        <Box marginBottom="md">
          <Text variant="body3" color="muted" marginBottom="sm" display="block">
            Default Average Ticket (cents)
          </Text>
          <TextInput
            value={String(defaultTicket)}
            onChangeText={(val) => setDefaultTicket(parseInt(val) || 25000)}
            keyboardType="numeric"
            style={{ padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff' }}
          />
        </Box>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Text variant="body2">Auto-analyze on paste</Text>
          <Switch value={autoAnalyze} onValueChange={setAutoAnalyze} />
        </Box>
      </Card>

      <Card variant="outlined" padding="lg" marginBottom="lg">
        <Text variant="heading5" weight="semibold" marginBottom="md">
          Display Options
        </Text>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom="sm">
          <Text variant="body2">Show leak details in table</Text>
          <Switch value={showLeakDetails} onValueChange={setShowLeakDetails} />
        </Box>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Text variant="body2">Dark mode</Text>
          <Switch value={theme === 'dark'} onValueChange={(val) => setTheme(val ? 'dark' : 'light')} />
        </Box>
      </Card>

      <Card variant="outlined" padding="lg" marginBottom="lg">
        <Text variant="heading5" weight="semibold" marginBottom="md">
          About
        </Text>
        <Box gap="sm">
          <Text variant="body2" weight="semibold">Missed Lead Revenue Finder</Text>
          <Text variant="body3" color="muted">Version 1.0.0</Text>
          <Text variant="body3" color="muted">Find missed revenue from lead leaks</Text>
        </Box>
      </Card>

      <Card variant="outlined" padding="lg" marginBottom="lg" backgroundColor="$errorBackground" borderColor="$errorBorder" borderWidth={1}>
        <Text variant="heading5" weight="semibold" color="error" marginBottom="sm">
          Data Privacy
        </Text>
        <Text variant="body3" color="muted">
          All analysis runs locally on your device. No data is sent to any server.
        </Text>
      </Card>
    </ScrollView>
  );
}