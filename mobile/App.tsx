import { StatusBar } from 'expo-status-bar';
import { TamaguiRoot } from './TamaguiRoot';
import { Box, Text, Button } from '@missed-lead/ui';
import { useState, useCallback } from 'react';
import { InputScreen } from './src/screens/InputScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { TemplatesScreen } from './src/screens/TemplatesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useLeadAnalysis } from './src/hooks/useLeadAnalysis';

const sampleCsv = `lead_id,created_at,customer_name,contact,source,status,last_contact_at,next_follow_up_at,estimated_value,notes
L1,2024-01-15,John Smith,john.smith@email.com,Website,booked,2024-01-16,2024-01-20,75000,Booked for consultation
L2,2024-01-10,Jane Doe,jane.doe@email.com,Referral,new,,,50000,No reply yet
L3,2024-01-05,Bob Wilson,bob.wilson@email.com,Ad,contacted,2024-01-06,,60000,Slow reply - 25 hours
L4,2024-01-08,Alice Brown,alice.brown@email.com,Phone,contacted,2024-01-09,,45000,No follow-up scheduled
L5,2024-01-01,Charlie Davis,charlie.davis@email.com,Website,qualified,2024-01-01,,80000,Stale quote - 9 days old`;

const tabs = [
  { id: 'input', label: 'Analyze', icon: '📊' },
  { id: 'report', label: 'Report', icon: '📈' },
  { id: 'templates', label: 'Templates', icon: '📝' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
] as const;

export default function App() {
  const [activeTab, setActiveTab] = useState<'input' | 'report' | 'templates' | 'settings'>('input');
  const {
    csvText,
    setCsvText,
    defaultTicket,
    setDefaultTicket,
    report,
    errors,
    warnings,
    isLoading,
    handleAnalyze,
  } = useLeadAnalysis();

  const canShowReport = report !== null;
  const canShowTemplates = report !== null;

  const handleLoadSample = useCallback(() => {
    setCsvText(sampleCsv);
  }, [setCsvText]);

  const onAnalyzeAndNavigate = useCallback(() => {
    handleAnalyze();
    setActiveTab('report');
  }, [handleAnalyze]);

  return (
    <TamaguiRoot>
      <Box flex={1} backgroundColor="$background">
        <StatusBar style="auto" />
        
        <Box flex={1} display="flex" flexDirection="column">
          <Box padding="$4" borderBottomWidth={1} borderColor="$borderColor" backgroundColor="$background">
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="heading4" weight="bold" margin={0}>
                Missed Lead Revenue Finder
              </Text>
            </Box>
          </Box>

          <Box flex={1} display="flex" flexDirection="column">
            {activeTab === 'input' && (
              <InputScreen
                csvText={csvText}
                onCsvTextChange={setCsvText}
                defaultTicket={defaultTicket}
                onDefaultTicketChange={setDefaultTicket}
                errors={errors}
                warnings={warnings}
                isLoading={isLoading}
                onAnalyze={onAnalyzeAndNavigate}
                onLoadSample={handleLoadSample}
              />
            )}
            {activeTab === 'report' && canShowReport && report && <ReportScreen summary={report.summary} revenue={report.revenue} leads={report.leads} />}
            {activeTab === 'templates' && canShowTemplates && report && <TemplatesScreen leads={report.leads} />}
            {activeTab === 'settings' && <SettingsScreen />}
            
            {(activeTab === 'report' && !canShowReport) && (
              <Box flex={1} display="flex" alignItems="center" justifyContent="center" padding={48}>
                <Text variant="body2" color="muted" textAlign="center">
                  No report yet. Go to Analyze tab and run an analysis first.
                </Text>
              </Box>
            )}
            {(activeTab === 'templates' && !canShowTemplates) && (
              <Box flex={1} display="flex" alignItems="center" justifyContent="center" padding={48}>
                <Text variant="body2" color="muted" textAlign="center">
                  No templates yet. Run an analysis to generate recovery templates.
                </Text>
              </Box>
            )}
          </Box>

          <Box borderTopWidth={1} borderColor="E5E7EB" backgroundColor="#FFFFFF" paddingBottom={48}>
            <Box flexDirection="row" justifyContent="space-around" paddingVertical={12}>
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'primary' : 'ghost'}
                  size="sm"
                  onPress={() => {
                    if (tab.id === 'report' && !canShowReport) return;
                    if (tab.id === 'templates' && !canShowTemplates) return;
                    setActiveTab(tab.id);
                  }}
                  disabled={(tab.id === 'report' && !canShowReport) || (tab.id === 'templates' && !canShowTemplates)}
                >
                  <Box flexDirection="row" alignItems="center" gap={4}>
                    <Text variant="body3">{tab.icon}</Text>
                    <Text variant="body3" weight="medium">{tab.label}</Text>
                  </Box>
                </Button>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </TamaguiRoot>
  );
}