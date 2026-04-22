import { Text, View } from '@/components/Themed';
import { api } from '@/db/api';
import { useSettings } from '@/utils/settings';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();
  const [locations, setLocations] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const distinct = await api.getDistinctPlaces();
      // Merge with existing order to ensure everything is represented
      const merged = [...settings.locationOrder];
      distinct.forEach(loc => {
        if (!merged.includes(loc)) merged.push(loc);
      });
      // Filter out locations that no longer exist? 
      // User might want to keep them if they are just temporarily gone, but let's keep it simple.
      setLocations(merged);
    })();
  }, [settings.locationOrder]);

  const renderLocationItem = ({ item, drag, isActive }: RenderItemParams<string>) => {
    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.locationRow,
            { backgroundColor: isActive ? '#444' : '#333' }
          ]}>
          <FontAwesome name="bars" size={16} color="#888" style={styles.dragHandle} />
          <Text style={styles.locationText}>{item}</Text>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Settings</Text>

          {/* Draggable Locations (Order of Groups) */}
          <Text style={styles.sectionHeader}>Delivery Groups Order</Text>
          <Text style={styles.sectionHint}>Long press and drag to reorder how deliveries are grouped in "The Run".</Text>
          
          <View style={styles.listContainer}>
            <DraggableFlatList
              data={locations}
              onDragEnd={({ data }) => {
                setLocations(data);
                updateSetting('locationOrder', data);
              }}
              keyExtractor={(item) => item}
              renderItem={renderLocationItem}
              containerStyle={styles.flatList}
            />
          </View>

          <View style={styles.separator} />

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
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 15, flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 25 },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2f95dc',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 10,
  },
  sectionHint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 15,
  },
  listContainer: {
    height: 300, // Fixed height for the draggable list to allow scrolling in the main view if needed
    backgroundColor: '#222',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 20,
  },
  flatList: {
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  dragHandle: {
    marginRight: 15,
  },
  locationText: {
    fontSize: 16,
    color: '#fff',
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
  separator: {
    height: 1,
    backgroundColor: '#444',
    marginVertical: 20,
  },
});
