import DropdownSelect from '@/components/DropdownSelect';
import UnknownPriceModal from '@/components/UnknownPriceModal';
import { Text, View } from '@/components/Themed';
import { db } from '@/db';
import { api } from '@/db/api';
import { items, orderItems, orders, persons } from '@/db/schema';
import { extractDateValue, generateDateOptions } from '@/utils/dates';
import { useSettings } from '@/utils/settings';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

export default function TheRunScreen() {
  const dateOptions = useMemo(() => generateDateOptions(30), []);
  // Set default to Tomorrow's label
  const [targetDateSelection, setTargetDateSelection] = useState(dateOptions[1]);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [paidItems, setPaidItems] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Unknown price notes modal
  const [unknownPricePerson, setUnknownPricePerson] = useState<{ id: string; name: string } | null>(null);

  const { settings } = useSettings();

  const { data: allOrders } = useLiveQuery(db.select().from(orders));
  const { data: allOrderItems } = useLiveQuery(db.select().from(orderItems));
  const { data: catalog } = useLiveQuery(db.select().from(items));
  const { data: people } = useLiveQuery(db.select().from(persons));

  const { aggregatedItems, peopleOrders } = useMemo(() => {
    const agg: Record<string, { item: any; totalQuantity: number; totalCost: number }> = {};
    const pOrders: Record<string, { person: any; order: any; items: any[]; totalCost: number; unpaidCost: number }> = {};

    if (!allOrders || !allOrderItems || !catalog || !people) {
      return { aggregatedItems: {}, peopleOrders: [] };
    }

    const targetDateDb = extractDateValue(targetDateSelection);
    // JS-based filtering ensures perfect reactivity when targetDateSelection changes
    const filteredOrders = allOrders.filter(o => o.targetDate === targetDateDb);

    filteredOrders.forEach((order) => {
      const person = people.find((p) => p.id === order.personId);
      const itemsForOrder = allOrderItems.filter((oi) => oi.orderId === order.id);

      let totalCost = 0;
      let unpaidCost = 0;
      let hasUnpaidItems = false;
      let hasUnknownPriceItems = false;

      const orderDetails = itemsForOrder.map((oi) => {
        const itemDef = catalog.find((c) => c.id === oi.itemId);
        const cost = (oi.unitPrice ?? 0) * oi.quantity;
        totalCost += cost;
        
        if (!oi.isPaid) {
          unpaidCost += cost;
          hasUnpaidItems = true;
          if (oi.unitPrice === null) hasUnknownPriceItems = true;
        }

        // Aggregate for shopping list
        if (itemDef) {
          if (!agg[itemDef.id]) {
            agg[itemDef.id] = { item: itemDef, totalQuantity: 0, totalCost: 0 };
          }
          agg[itemDef.id].totalQuantity += oi.quantity;
          agg[itemDef.id].totalCost += cost;
        }

        return { ...oi, itemDef };
      });

      if (person) {
        pOrders[person.id] = { 
          person, 
          order, 
          items: orderDetails, 
          totalCost, 
          unpaidCost, 
          hasUnpaidItems,
          hasUnknownPriceItems,
          deliveryPlace: order.deliveryPlace || person.typicalPlace 
        };
      }
    });

    // Group aggregated items based on groupByFreshness setting
    type AggItem = typeof agg[string];
    let groupedList: Record<string, Record<string, AggItem[]>>;

    if (settings.groupByFreshness) {
      // Group by timing → source
      groupedList = Object.values(agg).reduce((acc, curr) => {
        const timing = curr.item.timing || 'Anytime';
        const source = curr.item.source || 'Unknown';
        if (!acc[timing]) acc[timing] = {};
        if (!acc[timing][source]) acc[timing][source] = [];
        acc[timing][source].push(curr);
        return acc;
      }, {} as Record<string, Record<string, AggItem[]>>);
    } else {
      // Group by source only (single top-level group)
      const bySource = Object.values(agg).reduce((acc, curr) => {
        const source = curr.item.source || 'Unknown';
        if (!acc[source]) acc[source] = [];
        acc[source].push(curr);
        return acc;
      }, {} as Record<string, AggItem[]>);
      // Wrap in a single key so the rendering logic stays consistent
      groupedList = { _all: bySource };
    }

    return {
      aggregatedItems: groupedList,
      peopleOrders: Object.values(pOrders),
    };
  }, [allOrders, allOrderItems, catalog, people, targetDateSelection, settings.groupByFreshness]);

  const toggleCheck = (itemId: string) => {
    setCheckedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleToggleItemPaid = async (itemId: string, personId: string, itemCost: number, isPaid: boolean) => {
    try {
      if (isPaid) {
        await api.markItemUnpaid(itemId, personId, itemCost);
      } else {
        await api.markItemPaid(itemId, personId, itemCost);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update item status');
    }
  };

  const handleMarkAllPaid = async (orderId: string, personId: string) => {
    try {
      await api.markOrderPaid(orderId, personId);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to mark order as paid');
    }
  };

  const handleMarkAllUnpaid = async (orderId: string, personId: string) => {
    try {
      await api.markOrderUnpaid(orderId, personId);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to mark order as unpaid');
    }
  };

  const handleDeleteOrder = (orderId: string, personName: string) => {
    Alert.alert(
      'Delete Order',
      `Are you sure you want to delete the order for ${personName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteOrder(orderId);
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Failed to delete order');
            }
          },
        },
      ]
    );
  };

  /** Calculate total cost for all items in a source group */
  const getSourceTotal = (itemsList: { totalCost: number }[]) => {
    return itemsList.reduce((sum, ag) => sum + ag.totalCost, 0);
  };

  const hasItems = Object.keys(aggregatedItems).length > 0 &&
    Object.values(aggregatedItems).some(sources => Object.keys(sources).length > 0);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.header, { zIndex: 10 }]}>
        <Text style={styles.headerTitle}>Target Date:</Text>
        <View style={{ flex: 1 }}>
          <DropdownSelect
            value={targetDateSelection}
            options={dateOptions}
            onSelect={setTargetDateSelection}
            allowCustom
            placeholder="Select Date"
          />
        </View>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>🛍️ The Shopping List</Text>
        {Object.entries(aggregatedItems).map(([timingKey, sources]) => (
          <View key={timingKey} style={styles.timingGroup}>
            {/* Only show timing header if groupByFreshness is on */}
            {settings.groupByFreshness && timingKey !== '_all' && (
              <Text style={styles.timingTitle}>{timingKey}</Text>
            )}
            {Object.entries(sources).map(([source, itemsList]) => {
              const sourceTotal = getSourceTotal(itemsList);
              return (
                <View key={source} style={styles.sourceGroup}>
                  <View style={styles.sourceHeader}>
                    <Text style={styles.sourceTitle}>📍 {source}</Text>
                    <Text style={styles.sourceCost}>${sourceTotal.toFixed(2)}</Text>
                  </View>
                  {itemsList.map((ag) => (
                    <TouchableOpacity
                      key={ag.item.id}
                      style={styles.itemRow}
                      onPress={() => toggleCheck(ag.item.id)}>
                      <FontAwesome
                        name={checkedItems[ag.item.id] ? 'check-square-o' : 'square-o'}
                        size={24}
                        color={checkedItems[ag.item.id] ? '#28a745' : '#ccc'}
                      />
                      <Text
                        style={[
                          styles.itemText,
                          checkedItems[ag.item.id] && styles.itemTextCrossed,
                        ]}>
                        {ag.totalQuantity}x {ag.item.name}
                      </Text>
                      {ag.totalCost > 0 && (
                        <Text style={[
                          styles.itemPrice,
                          checkedItems[ag.item.id] && styles.itemTextCrossed,
                        ]}>
                          ${ag.totalCost.toFixed(2)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </View>
        ))}

        {!hasItems && (
          <Text style={styles.emptyText}>No items to buy for this date.</Text>
        )}

        <View style={styles.separator} />

        <View style={styles.deliveriesHeader}>
          <Text style={styles.sectionTitle}>🚚 Deliveries & Payments</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search person or location..."
            placeholderTextColor="#888"
          />
        </View>

        {peopleOrders
          .filter(po => {
            const q = searchQuery.toLowerCase().trim();
            if (!q) return true;
            return po.person.name.toLowerCase().includes(q) || 
                   (po.deliveryPlace && po.deliveryPlace.toLowerCase().includes(q));
          })
          .map((po) => (
          <View key={po.person.id} style={styles.personCard}>
            <View style={styles.personHeader}>
              <View>
                <Text style={styles.personName}>{po.person.name}</Text>
                {po.deliveryPlace ? (
                  <Text style={styles.deliveryPlace}>📍 {po.deliveryPlace}</Text>
                ) : null}
              </View>
              <View style={styles.costInfo}>
                <View style={styles.orderActions}>
                  <TouchableOpacity onPress={() => handleDeleteOrder(po.order.id, po.person.name)} style={styles.deleteOrderBtn}>
                    <FontAwesome name="trash" size={16} color="#ff4444" />
                  </TouchableOpacity>
                  <Text style={styles.personTotal}>
                    ${po.totalCost.toFixed(2)}{po.hasUnknownPriceItems ? ' + TBD' : ''}
                  </Text>
                </View>
                {po.unpaidCost > 0 && (
                  <Text style={styles.unpaidCost}>(${po.unpaidCost.toFixed(2)} unpaid)</Text>
                )}
              </View>
            </View>

            <View style={styles.personItems}>
              {po.items.map((i) => {
                const itemCost = (i.unitPrice ?? 0) * i.quantity;
                return (
                  <View key={i.id} style={styles.itemRow2}>
                    <TouchableOpacity
                      onPress={() => handleToggleItemPaid(i.id, po.person.id, itemCost, i.isPaid)}
                      style={styles.itemToggle}>
                      <FontAwesome
                        name={i.isPaid ? 'check-square-o' : 'square-o'}
                        size={18}
                        color={i.isPaid ? '#28a745' : '#ccc'}
                      />
                    </TouchableOpacity>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.personItemText, i.isPaid && styles.personItemPaid]}>
                        {i.quantity}x {i.itemDef?.name} - {i.unitPrice === null ? 'Price TBD' : `$${itemCost.toFixed(2)}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.personFooter}>
              <View>
                <View style={styles.balanceHeaderRow}>
                  <Text style={[styles.balanceLabel, po.person.balance < 0 ? styles.debtLabel : po.person.balance > 0 ? styles.creditLabel : po.hasUnknownPriceItems ? styles.pendingLabel : styles.settledLabel]}>
                    {po.person.balance < 0
                      ? 'Your money with them: '
                      : po.person.balance > 0
                      ? 'Their money with you: '
                      : po.hasUnknownPriceItems
                      ? 'Awaiting Prices: '
                      : 'Settled: '}
                  </Text>
                  {/* Notes icon for unknown prices */}
                  {po.hasUnknownPriceItems && (
                    <TouchableOpacity
                      onPress={() => setUnknownPricePerson({ id: po.person.id, name: po.person.name })}
                      style={styles.notesBtn}>
                      <FontAwesome name="exclamation-circle" size={18} color="#ff9800" />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={po.person.balance < 0 ? styles.debt : po.person.balance > 0 ? styles.credit : po.hasUnknownPriceItems ? styles.pending : styles.settled}>
                  ${Math.abs(po.person.balance).toFixed(2)}
                </Text>
              </View>
              <View style={styles.buttonGroup}>
                {po.hasUnpaidItems ? (
                  <TouchableOpacity
                    style={styles.markAllPaidBtn}
                    onPress={() => handleMarkAllPaid(po.order.id, po.person.id)}>
                    <Text style={styles.markAllPaidText}>Mark All Paid</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.markAllUnpaidBtn}
                    onPress={() => handleMarkAllUnpaid(po.order.id, po.person.id)}>
                    <Text style={styles.markAllUnpaidText}>Mark All Unpaid</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Unknown Price Notes Modal */}
      {unknownPricePerson && (
        <UnknownPriceModal
          visible={!!unknownPricePerson}
          personId={unknownPricePerson.id}
          personName={unknownPricePerson.name}
          onClose={() => setUnknownPricePerson(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#222',
  },
  headerTitle: { fontSize: 16, color: '#fff', marginRight: 10 },
  content: { padding: 15 },
  deliveriesHeader: {
    marginBottom: 15,
  },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  searchInput: {
    backgroundColor: '#333',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
    width: '100%',
  },
  timingGroup: { marginBottom: 15 },
  timingTitle: { fontSize: 18, fontWeight: 'bold', color: '#2f95dc', marginBottom: 5 },
  sourceGroup: { marginLeft: 10, marginBottom: 12 },
  sourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  sourceTitle: { fontSize: 16, color: '#aaa' },
  sourceCost: { fontSize: 16, fontWeight: 'bold', color: '#ffeb3b' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 10 },
  itemText: { fontSize: 18, color: '#fff', marginLeft: 10, flex: 1 },
  itemPrice: { fontSize: 14, color: '#aaa', marginLeft: 8 },
  itemTextCrossed: { textDecorationLine: 'line-through', color: '#666' },
  emptyText: { color: '#888', fontStyle: 'italic', marginBottom: 20 },
  separator: { height: 1, backgroundColor: '#444', marginVertical: 20 },
  personCard: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginBottom: 15 },
  personHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  personName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  personTotal: { fontSize: 18, fontWeight: 'bold', color: '#ffeb3b' },
  deliveryPlace: { fontSize: 12, color: '#8bb8e8', marginTop: 2 },
  costInfo: { alignItems: 'flex-end' },
  orderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteOrderBtn: { padding: 4 },
  unpaidCost: { fontSize: 12, color: '#ff9800', fontWeight: 'bold' },
  personItems: { marginBottom: 10 },
  itemRow2: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemToggle: { padding: 8 },
  itemInfo: { flex: 1 },
  personItemText: { color: '#ccc', fontSize: 14 },
  personItemPaid: { textDecorationLine: 'line-through', color: '#666' },
  personFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#555', paddingTop: 10 },
  balanceHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  balanceLabel: { fontSize: 12, fontWeight: '600', marginBottom: 3 },
  notesBtn: { padding: 4 },
  debtLabel: { color: '#ff4444' },
  creditLabel: { color: '#00C851' },
  pendingLabel: { color: '#ff9800' },
  settledLabel: { color: '#aaa' },
  debt: { color: '#ff4444', fontWeight: 'bold', fontSize: 16 },
  credit: { color: '#00C851', fontWeight: 'bold', fontSize: 16 },
  pending: { color: '#ff9800', fontWeight: 'bold', fontSize: 16 },
  settled: { color: '#aaa', fontWeight: 'bold', fontSize: 16 },
  buttonGroup: { alignItems: 'flex-end' },
  markAllPaidBtn: { backgroundColor: '#2f95dc', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5 },
  markAllPaidText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  markAllUnpaidBtn: { backgroundColor: '#444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5 },
  markAllUnpaidText: { color: '#ccc', fontWeight: 'bold', fontSize: 13 },
});
