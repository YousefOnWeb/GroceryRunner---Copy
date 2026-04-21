import CreateItemModal from '@/components/CreateItemModal';
import DropdownSelect from '@/components/DropdownSelect';
import { Text, View } from '@/components/Themed';
import { db } from '@/db';
import { api } from '@/db/api';
import { items, orderItems, orders, persons } from '@/db/schema';
import { extractDateValue, generateDateOptions } from '@/utils/dates';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

export default function AddOrderScreen() {
  const { data: people } = useLiveQuery(db.select().from(persons));
  const { data: catalog } = useLiveQuery(db.select().from(items));
  const { data: allOrders } = useLiveQuery(db.select().from(orders));
  const { data: allOrderItems } = useLiveQuery(db.select().from(orderItems));

  const dateOptions = useMemo(() => generateDateOptions(30), []);
  const [targetDateSelection, setTargetDateSelection] = useState<string>(dateOptions[1]); // Default tomorrow
  const [cart, setCart] = useState<{ item: any; quantity: number }[]>([]);
  
  // Item search state
  const [searchQuery, setSearchQuery] = useState('');
  const [itemModalVisible, setItemModalVisible] = useState(false);

  // Person search state
  const [personSearchQuery, setPersonSearchQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const [editModeOrderId, setEditModeOrderId] = useState<string | null>(null);

  const targetDateDb = extractDateValue(targetDateSelection);
  const existingOrder = useMemo(() => {
    if (!allOrders || !selectedPersonId) return null;
    return allOrders.find(o => o.personId === selectedPersonId && o.targetDate === targetDateDb);
  }, [allOrders, selectedPersonId, targetDateDb]);

  const loadExistingOrder = () => {
    if (!existingOrder || !allOrderItems || !catalog) return;
    const itemsForOrder = allOrderItems.filter(oi => oi.orderId === existingOrder.id);
    const newCart = itemsForOrder.map(oi => {
      const itemDef = catalog.find(c => c.id === oi.itemId);
      return { item: itemDef, quantity: oi.quantity };
    }).filter(c => c.item);
    
    setCart(newCart);
    setEditModeOrderId(existingOrder.id);
  };

  const addToCart = (itemObj: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === itemObj.id);
      if (existing) {
        return prev.map((i) => (i.item.id === itemObj.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { item: itemObj, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map((i) => (i.item.id === itemId ? { ...i, quantity: i.quantity - 1 } : i));
      }
      return prev.filter((i) => i.item.id !== itemId);
    });
  };

  const handleSaveOrder = async () => {
    if (!selectedPersonId) {
      Alert.alert('Error', 'Please select a person');
      return;
    }
    
    if (existingOrder && editModeOrderId !== existingOrder.id) {
      Alert.alert('Cannot Add', 'This person already has an order for this date. Please edit the existing order instead.');
      return;
    }

    if (cart.length === 0 && !editModeOrderId) {
      Alert.alert('Error', 'Cart is empty');
      return;
    }

    try {
      const orderLines = cart.map((c) => {
        return {
          itemId: c.item.id,
          quantity: c.quantity,
          unitPrice: c.item.defaultPrice ?? null,
        };
      });

      if (editModeOrderId) {
        if (cart.length === 0) {
          Alert.alert('Notice', 'Cart is empty. If you want to delete the order, you should delete it from the run tab (Feature coming soon).');
          return;
        }
        await api.updateOrder(editModeOrderId, selectedPersonId, orderLines);
        Alert.alert('Success', 'Order updated successfully (Note: all items have been reset to Unpaid)');
      } else {
        await api.createOrder(selectedPersonId, targetDateDb, orderLines);
        Alert.alert('Success', 'Order saved successfully');
      }
      
      setCart([]);
      setSelectedPersonId(null);
      setPersonSearchQuery('');
      setEditModeOrderId(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save order');
    }
  };

  const handleCreateItemSubmit = async (name: string, defaultPrice: number | null, source: string | null, timing: 'Fresh' | 'Anytime') => {
    setItemModalVisible(false);
    try {
      const newItem = await api.addItem(name, defaultPrice, source, timing);
      if (newItem && newItem.length > 0) {
        addToCart(newItem[0]);
        setSearchQuery('');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create item');
    }
  };

  const handleCreatePerson = async () => {
    if (!personSearchQuery.trim()) return;
    try {
      const res = await api.addPerson(personSearchQuery);
      if (res && res.length > 0) {
        setSelectedPersonId(res[0].id);
        setPersonSearchQuery('');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to add person');
    }
  };

  const filteredCatalog = catalog?.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];
  const exactItemMatch = filteredCatalog.find(i => i.name.toLowerCase() === searchQuery.toLowerCase().trim());

  const filteredPeople = people?.filter((p) => p.name.toLowerCase().includes(personSearchQuery.toLowerCase())) || [];
  const exactPersonMatch = filteredPeople.find(p => p.name.toLowerCase() === personSearchQuery.toLowerCase().trim());

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
        
        {/* 1. Who is this for? */}
        <View style={[styles.section, { zIndex: 20 }]}>
          <Text style={styles.sectionTitle}>1. Who is this for?</Text>
          
          {selectedPersonId ? (
            <View style={styles.selectedRow}>
              <Text style={styles.selectedText}>
                {people?.find(p => p.id === selectedPersonId)?.name}
              </Text>
              <TouchableOpacity onPress={() => { setSelectedPersonId(null); setEditModeOrderId(null); setCart([]); }} style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={personSearchQuery}
                  onChangeText={setPersonSearchQuery}
                  placeholder="Search person..."
                  placeholderTextColor="#888"
                />
                {personSearchQuery.trim().length > 0 && !exactPersonMatch && (
                  <TouchableOpacity style={styles.addButton} onPress={handleCreatePerson}>
                    <Text style={styles.addButtonText}>Create "{personSearchQuery.trim()}"</Text>
                  </TouchableOpacity>
                )}
              </View>

              {filteredPeople.length > 0 && (
                <View style={styles.grid}>
                  {filteredPeople.slice(0, 8).map((p) => (
                    <TouchableOpacity key={p.id} style={styles.gridItemPerson} onPress={() => setSelectedPersonId(p.id)}>
                      <Text style={styles.gridItemName}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* 2. When? */}
        <View style={[styles.section, { zIndex: 10 }]}>
          <Text style={styles.sectionTitle}>2. When?</Text>
          <View style={{ zIndex: 10 }}>
            <DropdownSelect
              value={targetDateSelection}
              options={dateOptions}
              onSelect={(val) => { setTargetDateSelection(val); setEditModeOrderId(null); }}
              allowCustom
              placeholder="Select Date"
            />
          </View>
        </View>

        {/* Edit Mode Banner */}
        {existingOrder && editModeOrderId !== existingOrder.id && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⚠️ An order already exists for this person on this date.</Text>
            <TouchableOpacity style={styles.loadBtn} onPress={loadExistingOrder}>
              <Text style={styles.loadBtnText}>Edit Existing Order</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 3. What do they want? */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            3. What do they want? {editModeOrderId && <Text style={{color: '#ff9800'}}>(Editing)</Text>}
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search or add item..."
              placeholderTextColor="#888"
            />
            {searchQuery.trim().length > 0 && !exactItemMatch && (
              <TouchableOpacity style={styles.addButton} onPress={() => setItemModalVisible(true)}>
                <Text style={styles.addButtonText}>Create "{searchQuery.trim()}"</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.grid}>
            {filteredCatalog.slice(0, 12).map((item) => {
              const inCart = cart.find((c) => c.item.id === item.id);
              return (
                <TouchableOpacity key={item.id} style={styles.gridItem} onPress={() => addToCart(item)}>
                  <Text style={styles.gridItemName}>{item.name}</Text>
                  {inCart && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{inCart.quantity}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Cart Review */}
        {cart.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cart Review</Text>
            {cart.map((c) => {
              return (
                <View key={c.item.id} style={styles.cartRow}>
                  <Text style={styles.cartText}>{c.item.name}</Text>
                  <View style={styles.cartActions}>
                    <TouchableOpacity onPress={() => removeFromCart(c.item.id)} style={styles.cartBtn}>
                      <FontAwesome name="minus" size={16} color="#000" />
                    </TouchableOpacity>
                    <Text style={styles.cartQuantity}>{c.quantity}</Text>
                    <TouchableOpacity onPress={() => addToCart(c.item)} style={styles.cartBtn}>
                      <FontAwesome name="plus" size={16} color="#000" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity 
        style={[
          styles.saveButton, 
          existingOrder && editModeOrderId !== existingOrder.id && styles.saveButtonDisabled
        ]} 
        onPress={handleSaveOrder}
        disabled={existingOrder && editModeOrderId !== existingOrder.id}>
        <Text style={styles.saveButtonText}>{editModeOrderId ? 'Save Edited Order' : 'Save Order'}</Text>
      </TouchableOpacity>

      <CreateItemModal
        visible={itemModalVisible}
        initialName={searchQuery}
        onCancel={() => setItemModalVisible(false)}
        onSubmit={handleCreateItemSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#fff' },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
  },
  selectedText: { color: '#2f95dc', fontSize: 18, fontWeight: 'bold' },
  changeBtn: { padding: 5 },
  changeBtnText: { color: '#aaa', fontSize: 14, fontWeight: 'bold' },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 10,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  addButton: { marginLeft: 10, backgroundColor: '#2f95dc', padding: 12, borderRadius: 8 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: {
    backgroundColor: '#444',
    padding: 15,
    borderRadius: 10,
    minWidth: '30%',
    position: 'relative',
  },
  gridItemPerson: {
    backgroundColor: '#444',
    padding: 10,
    borderRadius: 20,
  },
  gridItemName: { color: '#fff', textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ff4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cartText: { fontSize: 16, color: '#fff' },
  cartActions: { flexDirection: 'row', alignItems: 'center' },
  cartBtn: { backgroundColor: '#ccc', padding: 8, borderRadius: 15 },
  cartQuantity: { marginHorizontal: 15, fontSize: 18, color: '#fff' },
  saveButton: {
    backgroundColor: '#28a745',
    padding: 20,
    alignItems: 'center',
    margin: 15,
    borderRadius: 10,
  },
  saveButtonDisabled: {
    backgroundColor: '#999',
    opacity: 0.6,
  },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  warningBanner: {
    backgroundColor: '#4a2f00',
    padding: 15,
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  warningText: {
    color: '#fff',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  loadBtn: {
    backgroundColor: '#ff9800',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  loadBtnText: {
    color: '#000',
    fontWeight: 'bold',
  },
});
