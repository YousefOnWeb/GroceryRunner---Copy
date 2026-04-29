import React, { useMemo, useState } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSettings } from '@/utils/settings';
import { Text, View } from '@/components/Themed';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '@/db';
import { persons, items, orderItems, orders, itemAliases, placeAliases, sourceAliases } from '@/db/schema';
import { api } from '@/db/api';
import CreateItemModal from '@/components/CreateItemModal';
import EditStringEntityModal from '@/components/EditStringEntityModal';
import MergeModal from '@/components/MergeModal';
import FontAwesome from '@expo/vector-icons/FontAwesome';

const EMPTY_ARRAY: any[] = [];

export default function StatsScreen() {
  const { data: peopleList } = useLiveQuery(db.select().from(persons));
  const { data: catalog } = useLiveQuery(db.select().from(items));
  const { data: allOrders } = useLiveQuery(db.select().from(orders));
  const { data: allOrderItems } = useLiveQuery(db.select().from(orderItems));
  
  const { data: itemAliasesList } = useLiveQuery(db.select().from(itemAliases));
  const { data: placeAliasesList } = useLiveQuery(db.select().from(placeAliases));
  const { data: sourceAliasesList } = useLiveQuery(db.select().from(sourceAliases));

  const { settings } = useSettings();

  const [activeTab, setActiveTab] = useState<'Items' | 'Places' | 'Sources'>('Items');
  const [searchQuery, setSearchQuery] = useState('');

  // Item Edit State
  const [editingItem, setEditingItem] = useState<any | null>(null);
  
  // String Entity Edit State
  const [editingStringEntity, setEditingStringEntity] = useState<{ type: 'Place' | 'Source', name: string } | null>(null);

  // Selection & Merge State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeModalVisible, setMergeModalVisible] = useState(false);

  // Derive Places and Sources
  const places = useMemo(() => {
    const set = new Set([
      ...(peopleList || []).map(p => p.typicalPlace), 
      ...(allOrders || []).map(o => o.deliveryPlace)
    ]);
    return Array.from(set).filter(Boolean) as string[];
  }, [peopleList, allOrders]);

  const sources = useMemo(() => {
    const set = new Set((catalog || []).map(c => c.source));
    return Array.from(set).filter(Boolean) as string[];
  }, [catalog]);

  const editingItemAliases = useMemo(() => {
    if (!editingItem || !itemAliasesList) return EMPTY_ARRAY;
    return itemAliasesList.filter(a => a.itemId === editingItem.id).map(a => a.alias);
  }, [editingItem?.id, itemAliasesList]);

  const editingStringEntityAliases = useMemo(() => {
    if (!editingStringEntity) return EMPTY_ARRAY;
    if (editingStringEntity.type === 'Place') {
      return placeAliasesList?.filter(a => a.placeName === editingStringEntity.name).map(a => a.alias) || EMPTY_ARRAY;
    } else {
      return sourceAliasesList?.filter(a => a.sourceName === editingStringEntity.name).map(a => a.alias) || EMPTY_ARRAY;
    }
  }, [editingStringEntity, placeAliasesList, sourceAliasesList]);

  // Stats derivation
  const stats = useMemo(() => {
    if (!peopleList || !catalog || !allOrders || !allOrderItems) return null;

    const personTotals: Record<string, { name: string; total: number }> = {};
    const itemPopularity: Record<string, { name: string; qty: number }> = {};
    let totalSpent = 0;

    peopleList.forEach((p) => { personTotals[p.id] = { name: p.name, total: 0 }; });
    catalog.forEach((c) => { itemPopularity[c.id] = { name: c.name, qty: 0 }; });

    allOrderItems.forEach((oi) => {
      const order = allOrders.find((o) => o.id === oi.orderId);
      if (order && personTotals[order.personId]) {
        const cost = (oi.unitPrice ?? 0) * oi.quantity;
        personTotals[order.personId].total += cost;
        totalSpent += cost;
      }
      if (itemPopularity[oi.itemId]) {
        itemPopularity[oi.itemId].qty += oi.quantity;
      }
    });

    const topItems = Object.values(itemPopularity).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topSpenders = Object.values(personTotals).sort((a, b) => b.total - a.total).slice(0, 5);

    return { totalSpent, topItems, topSpenders, totalOrders: allOrders.length };
  }, [peopleList, catalog, allOrders, allOrderItems]);

  // --- ACTIONS ---

  const handleEditClick = (item: any) => { setEditingItem(item); };

  const handleSaveItem = async (name: string, defaultPrice: number | null, source: string | null, timing: 'Fresh' | 'Anytime', isCorrection: boolean, aliases: string[]) => {
    if (!editingItem) return;
    await api.updateItem(editingItem.id, { name, defaultPrice, source, timing, aliases }, isCorrection);
    setEditingItem(null);
  };

  const handleSaveStringEntity = async (oldName: string, newName: string, aliases: string[]) => {
    if (!editingStringEntity) return;
    if (editingStringEntity.type === 'Place') {
      await api.updatePlace(oldName, newName, aliases);
    } else {
      await api.updateSource(oldName, newName, aliases);
    }
    setEditingStringEntity(null);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const handleLongPress = (id: string) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds(new Set([id]));
    }
  };

  const handleBulkDelete = () => {
    Alert.alert(
      `Delete Selected ${activeTab}`,
      `Are you sure you want to delete ${selectedIds.size} ${activeTab.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const id of Array.from(selectedIds)) {
                if (activeTab === 'Items') await api.deleteItem(id);
                else if (activeTab === 'Places') await api.deletePlace(id);
                else if (activeTab === 'Sources') await api.deleteSource(id);
              }
              setSelectionMode(false);
              setSelectedIds(new Set());
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Failed to delete some entries.');
            }
          },
        },
      ]
    );
  };

  const getMergeEntities = () => {
    if (selectedIds.size !== 2) return { entityA: null, entityB: null };
    const ids = Array.from(selectedIds);
    
    if (activeTab === 'Items') {
      const i1 = catalog?.find(c => c.id === ids[0]);
      const i2 = catalog?.find(c => c.id === ids[1]);
      if (!i1 || !i2) return { entityA: null, entityB: null };
      return {
        entityA: { id: i1.id, name: i1.name, details: `Source: ${i1.source || 'N/A'}` },
        entityB: { id: i2.id, name: i2.name, details: `Source: ${i2.source || 'N/A'}` }
      };
    } else {
      return {
        entityA: { id: ids[0], name: ids[0] },
        entityB: { id: ids[1], name: ids[1] }
      };
    }
  };

  const handleConfirmMerge = async (primaryId: string, secondaryId: string, keepAsAlias: boolean) => {
    if (activeTab === 'Items') await api.mergeItems(primaryId, secondaryId, keepAsAlias);
    else if (activeTab === 'Places') await api.mergePlaces(primaryId, secondaryId, keepAsAlias);
    else if (activeTab === 'Sources') await api.mergeSources(primaryId, secondaryId, keepAsAlias);
    
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // --- RENDER HELPERS ---

  const renderItemCard = (item: any) => {
    const isSelected = selectedIds.has(item.id);
    const aliases = itemAliasesList?.filter(a => a.itemId === item.id).map(a => a.alias) || [];
    
    return (
      <TouchableOpacity 
        key={item.id} 
        style={[styles.itemCard, settings.compactMode && styles.itemCardCompact, isSelected && styles.cardSelected]}
        onLongPress={() => handleLongPress(item.id)}
        onPress={() => selectionMode ? toggleSelection(item.id) : null}
        activeOpacity={0.8}
        disabled={!selectionMode && !isSelected && false /* meaning it's always touchable to start selection */}
      >
        <View style={styles.cardContentWrapper}>
          <View style={[styles.itemHeader, settings.compactMode && styles.itemHeaderCompact]}>
            <View>
              <Text style={[styles.itemName, settings.compactMode && styles.itemNameCompact]}>{item.name}</Text>
              {aliases.length > 0 && <Text style={[styles.aliasesText, settings.compactMode && styles.textExtraSmall]}>aka: {aliases.join(', ')}</Text>}
            </View>
            {!selectionMode && (
              <TouchableOpacity onPress={() => handleEditClick(item)} style={[styles.iconBtn, settings.compactMode && styles.paddingSmall]}>
                <FontAwesome name="pencil" size={settings.compactMode ? 14 : 18} color="#2f95dc" />
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.itemDetails, settings.compactMode && styles.itemDetailsCompact]}>
            <Text style={[styles.detailText, settings.compactMode && styles.textExtraSmall]}>Price: {item.defaultPrice ? `$${item.defaultPrice}` : 'N/A'}</Text>
            <Text style={[styles.detailText, settings.compactMode && styles.textExtraSmall]}>Source: {item.source || 'N/A'}</Text>
            <Text style={[styles.detailText, settings.compactMode && styles.textExtraSmall]}>Timing: {item.timing}</Text>
          </View>
        </View>

        {selectionMode && (
          <View style={styles.checkboxContainer}>
            <FontAwesome name={isSelected ? "check-circle" : "circle-thin"} size={24} color={isSelected ? "#2f95dc" : "#888"} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderStringEntityCard = (name: string, type: 'Place' | 'Source') => {
    const isSelected = selectedIds.has(name);
    let aliases: string[] = [];
    if (type === 'Place') aliases = placeAliasesList?.filter(a => a.placeName === name).map(a => a.alias) || [];
    else aliases = sourceAliasesList?.filter(a => a.sourceName === name).map(a => a.alias) || [];

    return (
      <TouchableOpacity 
        key={name} 
        style={[styles.itemCard, settings.compactMode && styles.itemCardCompact, isSelected && styles.cardSelected]}
        onLongPress={() => handleLongPress(name)}
        onPress={() => selectionMode ? toggleSelection(name) : null}
        activeOpacity={0.8}
      >
        <View style={styles.cardContentWrapper}>
          <View style={[styles.itemHeader, settings.compactMode && styles.itemHeaderCompact]}>
            <View>
              <Text style={[styles.itemName, settings.compactMode && styles.itemNameCompact]}>{name}</Text>
              {aliases.length > 0 && <Text style={[styles.aliasesText, settings.compactMode && styles.textExtraSmall]}>aka: {aliases.join(', ')}</Text>}
            </View>
            {!selectionMode && (
              <TouchableOpacity onPress={() => setEditingStringEntity({ type, name })} style={[styles.iconBtn, settings.compactMode && styles.paddingSmall]}>
                <FontAwesome name="pencil" size={settings.compactMode ? 14 : 18} color="#2f95dc" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {selectionMode && (
          <View style={styles.checkboxContainer}>
            <FontAwesome name={isSelected ? "check-circle" : "circle-thin"} size={24} color={isSelected ? "#2f95dc" : "#888"} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // --- FILTERING ---

  const filteredItems = catalog?.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const aliases = itemAliasesList?.filter(a => a.itemId === item.id).map(a => a.alias) || [];
    const searchString = [item.name, item.defaultPrice?.toString(), item.source, item.timing, ...aliases].join(' ').toLowerCase();
    return searchString.includes(q);
  }) || [];

  const filteredPlaces = places.filter(place => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const aliases = placeAliasesList?.filter(a => a.placeName === place).map(a => a.alias) || [];
    return [place, ...aliases].join(' ').toLowerCase().includes(q);
  });

  const filteredSources = sources.filter(source => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const aliases = sourceAliasesList?.filter(a => a.sourceName === source).map(a => a.alias) || [];
    return [source, ...aliases].join(' ').toLowerCase().includes(q);
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
      <ScrollView contentContainerStyle={[styles.content, settings.compactMode && styles.contentCompact]}>
        
        {/* STATISTICS SECTION */}
        <Text style={[styles.sectionTitle, settings.compactMode && styles.sectionTitleCompact]}>📊 App Statistics</Text>
        {stats && (
          <View style={[styles.statsCard, settings.compactMode && styles.statsCardCompact]}>
            <Text style={[styles.statText, settings.compactMode && styles.textSmall]}>Total Money Handled: <Text style={[styles.highlight, settings.compactMode && styles.highlightCompact]}>${stats.totalSpent.toFixed(2)}</Text></Text>
            <Text style={[styles.statText, settings.compactMode && styles.textSmall]}>Total Orders Created: <Text style={[styles.highlight, settings.compactMode && styles.highlightCompact]}>{stats.totalOrders}</Text></Text>
            
            <Text style={[styles.subTitle, settings.compactMode && styles.subTitleCompact]}>🏆 Top Spenders</Text>
            {stats.topSpenders.map((p, idx) => (
              <Text key={idx} style={[styles.listItem, settings.compactMode && styles.textSmall]}>{idx + 1}. {p.name} - ${p.total.toFixed(2)}</Text>
            ))}

            <Text style={[styles.subTitle, settings.compactMode && styles.subTitleCompact]}>🔥 Most Popular Items</Text>
            {stats.topItems.map((i, idx) => (
              <Text key={idx} style={[styles.listItem, settings.compactMode && styles.textSmall]}>{idx + 1}. {i.name} ({i.qty} ordered)</Text>
            ))}
          </View>
        )}

        <View style={styles.separator} />

        {/* DICTIONARY SECTION */}
        {!selectionMode ? (
          <View style={styles.dictionaryHeader}>
            <Text style={[styles.sectionTitle, settings.compactMode && styles.sectionTitleCompact]}>📖 Dictionary</Text>
            <View style={styles.tabRow}>
              {(['Items', 'Places', 'Sources'] as const).map(tab => (
                <TouchableOpacity 
                  key={tab} 
                  style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]} 
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive, settings.compactMode && styles.textSmall]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={[styles.selectionHeader, settings.compactMode && styles.selectionHeaderCompact]}>
            <View style={styles.selectionLeft}>
              <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
                <FontAwesome name="times" size={settings.compactMode ? 20 : 24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.selectionTitle}>{selectedIds.size} Selected</Text>
            </View>
            <View style={styles.headerActions}>
              {selectedIds.size === 2 && (
                <TouchableOpacity style={[styles.mergeBtn, settings.compactMode && styles.compactBtn]} onPress={() => setMergeModalVisible(true)}>
                  <FontAwesome name="compress" size={settings.compactMode ? 14 : 16} color="#fff" />
                  <Text style={[styles.addBtnText, settings.compactMode && styles.textExtraSmall]}>Merge</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.bulkDeleteBtn, settings.compactMode && styles.compactBtn]} onPress={handleBulkDelete}>
                <FontAwesome name="trash" size={settings.compactMode ? 14 : 16} color="#fff" />
                <Text style={[styles.addBtnText, settings.compactMode && styles.textExtraSmall]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TextInput
          style={[styles.dictionarySearch, settings.compactMode && styles.dictionarySearchCompact]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={`Search ${activeTab.toLowerCase()}...`}
          placeholderTextColor="#888"
        />
        <Text style={[styles.helperText, settings.compactMode && styles.textExtraSmall]}>
          Long press any item to select, merge, or bulk delete.
        </Text>

        {activeTab === 'Items' && filteredItems.map(renderItemCard)}
        {activeTab === 'Places' && filteredPlaces.map(p => renderStringEntityCard(p, 'Place'))}
        {activeTab === 'Sources' && filteredSources.map(s => renderStringEntityCard(s, 'Source'))}

      </ScrollView>

      {editingItem && (
        <CreateItemModal
          visible={!!editingItem}
          title="Edit Item"
          submitLabel="Save Changes"
          initialName={editingItem.name}
          initialPrice={editingItem.defaultPrice}
          initialSource={editingItem.source}
          initialTiming={editingItem.timing}
          initialAliases={editingItemAliases}
          onCancel={() => setEditingItem(null)}
          onSubmit={handleSaveItem}
        />
      )}

      {editingStringEntity && (
        <EditStringEntityModal
          visible={!!editingStringEntity}
          entityType={editingStringEntity.type}
          initialName={editingStringEntity.name}
          initialAliases={editingStringEntityAliases}
          onClose={() => setEditingStringEntity(null)}
          onSubmit={handleSaveStringEntity}
        />
      )}

      {mergeModalVisible && (
        <MergeModal
          visible={mergeModalVisible}
          entityType={activeTab === 'Items' ? 'Item' : activeTab === 'Places' ? 'Place' : 'Source'}
          entityA={getMergeEntities().entityA}
          entityB={getMergeEntities().entityB}
          onClose={() => setMergeModalVisible(false)}
          onConfirm={handleConfirmMerge}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 15 },
  sectionTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 15, color: '#fff' },
  statsCard: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginBottom: 20 },
  statText: { fontSize: 16, color: '#ccc', marginBottom: 5 },
  highlight: { color: '#ffeb3b', fontWeight: 'bold', fontSize: 18 },
  subTitle: { fontSize: 18, fontWeight: 'bold', color: '#2f95dc', marginTop: 15, marginBottom: 10 },
  listItem: { color: '#ddd', fontSize: 15, marginLeft: 10, marginBottom: 5 },
  separator: { height: 1, backgroundColor: '#555', marginVertical: 20 },
  helperText: { color: '#888', marginBottom: 15 },
  
  dictionaryHeader: { marginBottom: 10 },
  tabRow: { flexDirection: 'row', backgroundColor: '#222', borderRadius: 8, padding: 4, marginBottom: 10 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabBtnActive: { backgroundColor: '#333' },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 16 },
  tabTextActive: { color: '#2f95dc' },
  
  selectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, backgroundColor: '#333', padding: 15, borderRadius: 10 },
  selectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  selectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerActions: { flexDirection: 'row', gap: 10 },
  bulkDeleteBtn: { backgroundColor: '#ff4444', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  mergeBtn: { backgroundColor: '#ff9800', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  dictionarySearch: { backgroundColor: '#333', color: '#fff', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, fontSize: 16, width: '100%', marginBottom: 5 },
  
  itemCard: { backgroundColor: '#222', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSelected: { borderColor: '#2f95dc', borderWidth: 2, backgroundColor: 'rgba(47, 149, 220, 0.1)' },
  cardContentWrapper: { flex: 1 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
  itemName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  aliasesText: { fontSize: 12, color: '#aaa', marginTop: 2 },
  iconBtn: { padding: 5 },
  itemDetails: { gap: 5 },
  detailText: { color: '#ccc' },
  checkboxContainer: { paddingLeft: 15 },
  
  // Compact Modifiers
  contentCompact: { padding: 8 },
  sectionTitleCompact: { fontSize: 20, marginBottom: 10 },
  statsCardCompact: { padding: 10, marginBottom: 15 },
  highlightCompact: { fontSize: 16 },
  subTitleCompact: { fontSize: 16, marginTop: 10, marginBottom: 5 },
  dictionarySearchCompact: { paddingVertical: 6, fontSize: 14 },
  itemCardCompact: { padding: 10, marginBottom: 8 },
  itemHeaderCompact: { marginBottom: 3 },
  itemNameCompact: { fontSize: 16 },
  itemDetailsCompact: { gap: 2 },
  textSmall: { fontSize: 13 },
  textExtraSmall: { fontSize: 11 },
  paddingSmall: { padding: 2 },
  selectionHeaderCompact: { padding: 10 },
  compactBtn: { paddingVertical: 6, paddingHorizontal: 10 },
});
