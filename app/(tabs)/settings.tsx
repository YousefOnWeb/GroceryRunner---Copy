import { Text, View, StyleSheet, Switch, TouchableOpacity, Modal, SafeAreaView, ScrollView } from 'react-native';
import { api } from '@/db/api';
import { useSettings } from '@/utils/settings';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const SHOW_DEV_SECTION = true; // Toggle this manually to show/hide the dev section

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();
  const [locations, setLocations] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  
  const [activeModal, setActiveModal] = useState<'locations' | 'sources' | 'seed' | null>(null);
  const [seedOptions, setSeedOptions] = useState({ peopleCount: 5, itemsCount: 10, seedOrders: true });
  const [importStrategy, setImportStrategy] = useState<'replace' | 'skip'>('skip');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const refreshPreviews = async () => {
    const distinctPlaces = await api.getDistinctPlaces();
    const mergedPlaces = [...settings.locationOrder];
    distinctPlaces.forEach(loc => {
      if (!mergedPlaces.includes(loc)) mergedPlaces.push(loc);
    });
    setLocations(mergedPlaces);

    const distinctSources = await api.getDistinctSources();
    const mergedSources = [...settings.sourceOrder];
    distinctSources.forEach(src => {
      if (!mergedSources.includes(src)) mergedSources.push(src);
    });
    setSources(mergedSources);
  };

  useEffect(() => {
    refreshPreviews();
  }, [settings.locationOrder, settings.sourceOrder, activeModal]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await api.getAllData();
      const fileName = `GroceryRunner_Export_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data), { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Sharing not available', 'The file was saved locally but cannot be shared.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Export Failed', 'An error occurred while generating the export file.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const importObj = JSON.parse(fileContent);

      setIsImporting(true);
      await api.importData(importObj, importStrategy);
      
      await refreshPreviews();
      Alert.alert('Import Successful', 'Your data has been merged successfully.');
    } catch (e: any) {
      console.error(e);
      Alert.alert('Import Failed', e.message || 'An error occurred while importing the file.');
    } finally {
      setIsImporting(false);
    }
  };

  const renderDraggableItem = ({ item, drag, isActive }: RenderItemParams<string>) => {
    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.draggableRow,
            { backgroundColor: isActive ? '#444' : '#333' }
          ]}>
          <FontAwesome name="bars" size={16} color="#888" style={styles.dragHandle} />
          <Text style={styles.draggableText}>{item}</Text>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <View collapsable={false} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, settings.compactMode && styles.contentCompact]}>
        <Text style={[styles.title, settings.compactMode && styles.titleCompact]}>Settings</Text>

        {/* Reorder Delivery Locations */}
        <View style={[styles.sectionCard, settings.compactMode && styles.cardCompact]}>
          <View style={[styles.sectionHeaderRow, settings.compactMode && styles.headerRowCompact]}>
            <View>
              <Text style={[styles.sectionHeader, settings.compactMode && styles.textSmall]}>Delivery Groups</Text>
              <Text style={[styles.sectionHint, settings.compactMode && styles.textExtraSmall]}>Manage how your run is grouped by location.</Text>
            </View>
            <TouchableOpacity 
              style={[styles.editButton, settings.compactMode && styles.btnCompact]} 
              onPress={() => setActiveModal('locations')}
            >
              <FontAwesome name="sort" size={settings.compactMode ? 12 : 14} color="#fff" style={{ marginRight: settings.compactMode ? 4 : 6 }} />
              <Text style={[styles.editButtonText, settings.compactMode && styles.textExtraSmall]}>Edit Order</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.previewContainer, settings.compactMode && styles.previewCompact]}>
            {locations.slice(0, settings.compactMode ? 2 : 3).map((loc, i) => (
              <Text key={loc} style={[styles.previewText, settings.compactMode && styles.textExtraSmall]}>
                {i + 1}. {loc}
              </Text>
            ))}
            {locations.length > (settings.compactMode ? 2 : 3) && (
              <Text style={[styles.previewTextMore, settings.compactMode && styles.textExtraSmall]}>+ {locations.length - (settings.compactMode ? 2 : 3)} more...</Text>
            )}
          </View>
        </View>

        {/* Reorder Sources */}
        <View style={[styles.sectionCard, settings.compactMode && styles.cardCompact]}>
          <View style={[styles.sectionHeaderRow, settings.compactMode && styles.headerRowCompact]}>
            <View>
              <Text style={[styles.sectionHeader, settings.compactMode && styles.textSmall]}>Shopping Sources</Text>
              <Text style={[styles.sectionHint, settings.compactMode && styles.textExtraSmall]}>Set the sequence of stores in your list.</Text>
            </View>
            <TouchableOpacity 
              style={[styles.editButton, settings.compactMode && styles.btnCompact]} 
              onPress={() => setActiveModal('sources')}
            >
              <FontAwesome name="sort" size={settings.compactMode ? 12 : 14} color="#fff" style={{ marginRight: settings.compactMode ? 4 : 6 }} />
              <Text style={[styles.editButtonText, settings.compactMode && styles.textExtraSmall]}>Edit Order</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.previewContainer, settings.compactMode && styles.previewCompact]}>
            {sources.slice(0, settings.compactMode ? 2 : 3).map((src, i) => (
              <Text key={src} style={[styles.previewText, settings.compactMode && styles.textExtraSmall]}>
                {i + 1}. {src}
              </Text>
            ))}
            {sources.length > (settings.compactMode ? 2 : 3) && (
              <Text style={[styles.previewTextMore, settings.compactMode && styles.textExtraSmall]}>+ {sources.length - (settings.compactMode ? 2 : 3)} more...</Text>
            )}
          </View>
        </View>

        <View style={styles.separator} />

        {/* UI Settings */}
        <Text style={[styles.sectionHeader, settings.compactMode && styles.textSmall]}>UI Settings</Text>
        
        <View style={[styles.settingRow, settings.compactMode && styles.rowCompact]}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, settings.compactMode && styles.textSmall]}>Compact Mode</Text>
            <Text style={[styles.settingHint, settings.compactMode && styles.textExtraSmall]}>
              Reduce padding and font sizes for a denser layout
            </Text>
          </View>
          <Switch
            value={settings.compactMode}
            onValueChange={(val) => updateSetting('compactMode', val)}
            trackColor={{ false: '#555', true: '#2f95dc' }}
            thumbColor={settings.compactMode ? '#fff' : '#ccc'}
          />
        </View>

        <View style={[styles.settingRow, settings.compactMode && styles.rowCompact]}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, settings.compactMode && styles.textSmall]}>Group by Freshness</Text>
            <Text style={[styles.settingHint, settings.compactMode && styles.textExtraSmall]}>
              Split the shopping list into "Fresh" and "Anytime"
            </Text>
          </View>
          <Switch
            value={settings.groupByFreshness}
            onValueChange={(val) => updateSetting('groupByFreshness', val)}
            trackColor={{ false: '#555', true: '#2f95dc' }}
            thumbColor={settings.groupByFreshness ? '#fff' : '#ccc'}
          />
        </View>

        <View style={styles.separator} />

        {/* Data Management */}
        <Text style={[styles.sectionHeader, settings.compactMode && styles.textSmall]}>Data Management</Text>
        
        <View style={[styles.sectionCard, settings.compactMode && styles.cardCompact, { marginTop: 10 }]}>
          <Text style={[styles.settingLabel, settings.compactMode && styles.textSmall]}>Export Data</Text>
          <Text style={[styles.settingHint, settings.compactMode && styles.textExtraSmall, { marginBottom: 15 }]}>
            Save all your persons, items, and orders to a file. You can use this file to move your data to another device or keep a backup.
          </Text>
          <TouchableOpacity 
            style={[styles.actionButton, isExporting && { opacity: 0.7 }, settings.compactMode && styles.btnCompact]} 
            onPress={handleExport}
            disabled={isExporting}
          >
            <FontAwesome name="upload" size={settings.compactMode ? 14 : 16} color="#fff" />
            <Text style={[styles.actionButtonText, settings.compactMode && styles.textSmall]}>
              {isExporting ? 'Exporting...' : 'Export to File'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionCard, settings.compactMode && styles.cardCompact]}>
          <Text style={[styles.settingLabel, settings.compactMode && styles.textSmall]}>Import Data</Text>
          <Text style={[styles.settingHint, settings.compactMode && styles.textExtraSmall, { marginBottom: 15 }]}>
            Load data from a previously exported file. New data will be merged with your current data.
          </Text>
          
          <View style={styles.strategyRow}>
            <Text style={[styles.strategyLabel, settings.compactMode && styles.textExtraSmall]}>Conflict Policy:</Text>
            <TouchableOpacity 
              style={[styles.strategyToggle, importStrategy === 'skip' && styles.strategyActive]} 
              onPress={() => setImportStrategy('skip')}
            >
              <Text style={[styles.strategyText, importStrategy === 'skip' && styles.strategyTextActive]}>Skip Duplicates</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.strategyToggle, importStrategy === 'replace' && styles.strategyActiveReplace]} 
              onPress={() => setImportStrategy('replace')}
            >
              <Text style={[styles.strategyText, importStrategy === 'replace' && styles.strategyTextActive]}>Replace Existing</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.strategyHint, settings.compactMode && styles.textExtraSmall]}>
            {importStrategy === 'skip' 
              ? 'If an item or person already exists, it will be skipped.' 
              : 'If an item or person already exists, its details will be updated with the file data.'}
          </Text>

          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#444' }, isImporting && { opacity: 0.7 }, settings.compactMode && styles.btnCompact]} 
            onPress={handleImport}
            disabled={isImporting}
          >
            <FontAwesome name="download" size={settings.compactMode ? 14 : 16} color="#fff" />
            <Text style={[styles.actionButtonText, settings.compactMode && styles.textSmall]}>
              {isImporting ? 'Importing...' : 'Import from File'}
            </Text>
          </TouchableOpacity>
        </View>

        {SHOW_DEV_SECTION && (
          <>
            <View style={styles.separator} />
            <Text style={[styles.sectionHeader, { color: '#ff4444' }, settings.compactMode && styles.textSmall]}>Developer/Tester</Text>
            
            <View style={[styles.settingRow, settings.compactMode && styles.rowCompact]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, settings.compactMode && styles.textSmall]}>Seed Dummy Data</Text>
                <Text style={[styles.settingHint, settings.compactMode && styles.textExtraSmall]}>
                  Generate test orders, people, and items
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.devButton, { backgroundColor: '#444' }, settings.compactMode && styles.btnCompact]}
                onPress={() => setActiveModal('seed')}
              >
                <FontAwesome name="database" size={settings.compactMode ? 12 : 14} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={[styles.settingRow, settings.compactMode && styles.rowCompact]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: '#ff4444' }, settings.compactMode && styles.textSmall]}>Wipe All Data</Text>
                <Text style={[styles.settingHint, settings.compactMode && styles.textExtraSmall]}>
                  Permanently delete everything
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.devButton, { backgroundColor: '#ff4444' }, settings.compactMode && styles.btnCompact]}
                onPress={() => {
                  Alert.alert(
                    'Wipe All Data',
                    'Are you sure? This is permanent.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Wipe', 
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await api.wipeAllData();
                            await refreshPreviews();
                            Alert.alert('Success', 'All data wiped.');
                          } catch (e) {
                            Alert.alert('Error', 'Failed to wipe data.');
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <FontAwesome name="trash" size={settings.compactMode ? 12 : 14} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Reorder Modal */}
      <Modal 
        visible={activeModal !== null} 
        animationType="slide" 
        presentationStyle="fullScreen"
      >
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#111' }}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                  {activeModal === 'locations' ? 'Reorder Deliveries' : activeModal === 'sources' ? 'Reorder Stores' : 'Seed Data Options'}
                </Text>
                <TouchableOpacity 
                  style={styles.closeButton} 
                  onPress={() => setActiveModal(null)}
                >
                  <Text style={styles.closeButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
              
              {activeModal !== 'seed' ? (
                <>
                  <Text style={styles.modalHint}>Long press and drag to reorder items.</Text>

                  <DraggableFlatList
                    data={activeModal === 'locations' ? locations : sources}
                    onDragEnd={({ data }) => {
                      if (activeModal === 'locations') {
                        setLocations(data);
                        updateSetting('locationOrder', data);
                      } else {
                        setSources(data);
                        updateSetting('sourceOrder', data);
                      }
                    }}
                    keyExtractor={(item) => item}
                    renderItem={renderDraggableItem}
                    containerStyle={{ flex: 1 }}
                  />
                </>
              ) : (
                <ScrollView style={styles.seedModalContent}>
                  <Text style={styles.modalHint}>Configure the dummy data to be generated.</Text>
                  
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Number of People</Text>
                    </View>
                    <View style={styles.numberInputContainer}>
                      <TouchableOpacity onPress={() => setSeedOptions(s => ({ ...s, peopleCount: Math.max(1, s.peopleCount - 1) }))} style={styles.numberBtn}>
                        <FontAwesome name="minus" size={12} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.numberText}>{seedOptions.peopleCount}</Text>
                      <TouchableOpacity onPress={() => setSeedOptions(s => ({ ...s, peopleCount: s.peopleCount + 1 }))} style={styles.numberBtn}>
                        <FontAwesome name="plus" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Number of Items</Text>
                    </View>
                    <View style={styles.numberInputContainer}>
                      <TouchableOpacity onPress={() => setSeedOptions(s => ({ ...s, itemsCount: Math.max(1, s.itemsCount - 1) }))} style={styles.numberBtn}>
                        <FontAwesome name="minus" size={12} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.numberText}>{seedOptions.itemsCount}</Text>
                      <TouchableOpacity onPress={() => setSeedOptions(s => ({ ...s, itemsCount: s.itemsCount + 1 }))} style={styles.numberBtn}>
                        <FontAwesome name="plus" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Seed Today's Orders</Text>
                    </View>
                    <Switch
                      value={seedOptions.seedOrders}
                      onValueChange={(val) => setSeedOptions(s => ({ ...s, seedOrders: val }))}
                      trackColor={{ false: '#555', true: '#2f95dc' }}
                      thumbColor={seedOptions.seedOrders ? '#fff' : '#ccc'}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.seedConfirmBtn, { marginTop: 30 }]}
                    onPress={async () => {
                      try {
                        await api.seedDummyData(seedOptions);
                        setActiveModal(null);
                        Alert.alert('Success', 'Dummy data generated.');
                      } catch (e) {
                        Alert.alert('Error', 'Failed to generate dummy data.');
                      }
                    }}
                  >
                    <Text style={styles.seedConfirmText}>Generate Data</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 30 },
  sectionCard: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderBottomColor: '#333',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2f95dc',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: '#888',
  },
  editButton: {
    backgroundColor: '#2f95dc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  previewContainer: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  previewText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  previewTextMore: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
  separator: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 25,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  settingInfo: { flex: 1, marginRight: 15 },
  settingLabel: { fontSize: 16, color: '#fff', fontWeight: '600', marginBottom: 4 },
  settingHint: { fontSize: 12, color: '#888' },
  
  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#111' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  modalHint: { padding: 20, color: '#888', fontSize: 14 },
  closeButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  closeButtonText: { color: '#2f95dc', fontSize: 16, fontWeight: 'bold' },
  draggableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  dragHandle: { marginRight: 15 },
  draggableText: { fontSize: 16, color: '#fff' },
  
  // Compact Modifiers
  contentCompact: { padding: 10 },
  titleCompact: { fontSize: 22, marginBottom: 15 },
  cardCompact: { padding: 10, marginBottom: 10 },
  headerRowCompact: { marginBottom: 6 },
  rowCompact: { padding: 10, marginTop: 5 },
  btnCompact: { paddingHorizontal: 8, paddingVertical: 4 },
  previewCompact: { paddingTop: 6 },
  textSmall: { fontSize: 14 },
  textExtraSmall: { fontSize: 11 },
  devButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedModalContent: { padding: 10 },
  numberInputContainer: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  numberBtn: { backgroundColor: '#444', padding: 8, borderRadius: 6 },
  numberText: { color: '#fff', fontSize: 18, fontWeight: 'bold', minWidth: 30, textAlign: 'center' },
  seedConfirmBtn: { backgroundColor: '#2f95dc', padding: 15, borderRadius: 12, alignItems: 'center' },
  seedConfirmText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  actionButton: {
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  strategyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  strategyLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: 'bold',
  },
  strategyToggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#333',
    borderWidth: 1,
    borderColor: '#444',
  },
  strategyActive: {
    backgroundColor: '#2f95dc',
    borderColor: '#2f95dc',
  },
  strategyActiveReplace: {
    backgroundColor: '#ff9800',
    borderColor: '#ff9800',
  },
  strategyText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  strategyTextActive: {
    color: '#fff',
  },
  strategyHint: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 15,
  },
});
