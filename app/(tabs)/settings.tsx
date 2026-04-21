import { Text, View } from '@/components/Themed';
import { useSettings } from '@/utils/settings';
import React from 'react';
import { ScrollView, StyleSheet, Switch } from 'react-native';

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Shopping List Settings */}
        <Text style={styles.sectionHeader}>Shopping List</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Group by Freshness</Text>
            <Text style={styles.settingHint}>
              Split the shopping list into "Fresh" and "Anytime" groups
            </Text>
          </View>
          <Switch
            value={settings.groupByFreshness}
            onValueChange={(val) => updateSetting('groupByFreshness', val)}
            trackColor={{ false: '#555', true: '#2f95dc' }}
            thumbColor={settings.groupByFreshness ? '#fff' : '#ccc'}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 15 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 25 },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2f95dc',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 10,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  settingInfo: { flex: 1, marginRight: 15 },
  settingLabel: { fontSize: 16, color: '#fff', fontWeight: '600', marginBottom: 3 },
  settingHint: { fontSize: 12, color: '#888' },
});
