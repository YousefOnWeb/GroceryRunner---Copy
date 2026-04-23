import React, { useMemo, useState } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useSettings } from '@/utils/settings';
import { Text, View } from '@/components/Themed';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '@/db';
import { persons, items, orderItems, orders } from '@/db/schema';
import { api } from '@/db/api';
import CreateItemModal from '@/components/CreateItemModal';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function StatsScreen() {
  const { data: peopleList } = useLiveQuery(db.select().from(persons));
  const { data: catalog } = useLiveQuery(db.select().from(items));
  const { data: allOrders } = useLiveQuery(db.select().from(orders));
  const { data: allOrderItems } = useLiveQuery(db.select().from(orderItems));
  const { settings } = useSettings();

  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [itemSearch, setItemSearch] = useState('');

  const stats = useMemo(() => {
    if (!peopleList || !catalog || !allOrders || !allOrderItems) return null;

    const personTotals: Record<string, { name: string; total: number }> = {};
    const itemPopularity: Record<string, { name: string; qty: number }> = {};
    let totalSpent = 0;

    peopleList.forEach((p) => {
      personTotals[p.id] = { name: p.name, total: 0 };
    });

    catalog.forEach((c) => {
      itemPopularity[c.id] = { name: c.name, qty: 0 };
    });

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

    const topItems = Object.values(itemPopularity)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const topSpenders = Object.values(personTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return { totalSpent, topItems, topSpenders, totalOrders: allOrders.length };
  }, [peopleList, catalog, allOrders, allOrderItems]);

  const handleEditClick = (item: any) => {
    setEditingItem(item);
  };

  const handleSaveItem = async (name: string, defaultPrice: number | null, source: string | null, timing: 'Fresh' | 'Anytime') => {
    if (!editingItem) return;
    await api.updateItem(editingItem.id, {
      name,
      defaultPrice,
      source,
      timing,
    });
    setEditingItem(null);
  };

  const handleDeleteItem = (item: any) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.name}"? This will not delete orders containing this item, but they might show incorrect information.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteItem(item.id);
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
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

        {/* ITEMS DICTIONARY SECTION */}
        <View style={styles.dictionaryHeader}>
          <Text style={[styles.sectionTitle, settings.compactMode && styles.sectionTitleCompact]}>📖 Items Dictionary</Text>
          <TextInput
            style={[styles.dictionarySearch, settings.compactMode && styles.dictionarySearchCompact]}
            value={itemSearch}
            onChangeText={setItemSearch}
            placeholder="Search items..."
            placeholderTextColor="#888"
          />
        </View>
        <Text style={[styles.helperText, settings.compactMode && styles.textExtraSmall]}>Update default prices, sources, and timing for your items here.</Text>

        {catalog?.filter(item => item.name.toLowerCase().includes(itemSearch.toLowerCase().trim())).map((item) => (
          <View key={item.id} style={[styles.itemCard, settings.compactMode && styles.itemCardCompact]}>
            <View style={[styles.itemHeader, settings.compactMode && styles.itemHeaderCompact]}>
              <Text style={[styles.itemName, settings.compactMode && styles.itemNameCompact]}>{item.name}</Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity onPress={() => handleEditClick(item)} style={[styles.iconBtn, settings.compactMode && styles.paddingSmall]}>
                  <FontAwesome name="pencil" size={settings.compactMode ? 14 : 18} color="#2f95dc" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteItem(item)} style={[styles.iconBtn, settings.compactMode && styles.paddingSmall]}>
                  <FontAwesome name="trash" size={settings.compactMode ? 14 : 18} color="#ff4444" />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={[styles.itemDetails, settings.compactMode && styles.itemDetailsCompact]}>
              <Text style={[styles.detailText, settings.compactMode && styles.textExtraSmall]}>Price: {item.defaultPrice ? `$${item.defaultPrice}` : 'Not known yet'}</Text>
              <Text style={[styles.detailText, settings.compactMode && styles.textExtraSmall]}>Source: {item.source || 'Not known yet'}</Text>
              <Text style={[styles.detailText, settings.compactMode && styles.textExtraSmall]}>Timing: {item.timing}</Text>
            </View>
          </View>
        ))}

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
          onCancel={() => setEditingItem(null)}
          onSubmit={handleSaveItem}
        />
      )}
    </View>
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
  itemCard: { backgroundColor: '#222', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#444' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  actionButtons: { flexDirection: 'row', gap: 15 },
  iconBtn: { padding: 5 },
  dictionaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dictionarySearch: {
    backgroundColor: '#333',
    color: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 14,
    width: '40%',
  },
  itemDetails: { gap: 5 },
  detailText: { color: '#ccc' },
  
  // Compact Modifiers
  contentCompact: { padding: 8 },
  sectionTitleCompact: { fontSize: 20, marginBottom: 10 },
  statsCardCompact: { padding: 10, marginBottom: 15 },
  highlightCompact: { fontSize: 16 },
  subTitleCompact: { fontSize: 16, marginTop: 10, marginBottom: 5 },
  dictionarySearchCompact: { paddingVertical: 4, fontSize: 12 },
  itemCardCompact: { padding: 10, marginBottom: 10 },
  itemHeaderCompact: { marginBottom: 5 },
  itemNameCompact: { fontSize: 16 },
  itemDetailsCompact: { gap: 2 },
  textSmall: { fontSize: 13 },
  textExtraSmall: { fontSize: 11 },
  paddingSmall: { padding: 2 },
});
