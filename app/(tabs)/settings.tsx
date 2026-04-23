import { Text, View, StyleSheet, Switch, TouchableOpacity, Modal, SafeAreaView, ScrollView } from 'react-native';
import { api } from '@/db/api';
import { useSettings } from '@/utils/settings';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();
  const [locations, setLocations] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  
  const [activeModal, setActiveModal] = useState<'locations' | 'sources' | null>(null);

  useEffect(() => {
    (async () => {
      const distinct = await api.getDistinctPlaces();
      const merged = [...settings.locationOrder];
      distinct.forEach(loc => {
        if (!merged.includes(loc)) merged.push(loc);
      });
      setLocations(merged);
    })();
  }, [settings.locationOrder, activeModal]);

  useEffect(() => {
    (async () => {
      const distinct = await api.getDistinctSources();
      const merged = [...settings.sourceOrder];
      distinct.forEach(src => {
        if (!merged.includes(src)) merged.push(src);
      });
      setSources(merged);
    })();
  }, [settings.sourceOrder, activeModal]);

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
                {activeModal === 'locations' ? 'Reorder Deliveries' : 'Reorder Stores'}
              </Text>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={() => setActiveModal(null)}
              >
                <Text style={styles.closeButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
            
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
});
