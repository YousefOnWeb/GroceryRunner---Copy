import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import CreateItemModal from '@/components/CreateItemModal';
import DropdownSelect from '@/components/DropdownSelect';
import PersonModal from '@/components/PersonModal';
import { Text, View } from '@/components/Themed';
import { db } from '@/db';
import { api } from '@/db/api';
import { items, orderItems, orders, personAliases, persons } from '@/db/schema';
import { extractDateValue, formatDateLabel, getDefaultDate, getLocalDateString } from '@/utils/dates';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSettings } from '@/utils/settings';
import SmartTextInput from '@/components/SmartTextInput';
import { COMMON_GROCERY_CORPUS, COMMON_NAMES_CORPUS } from '@/utils/textMatching';

export default function AddOrderScreen() {
  const { data: people } = useLiveQuery(db.select().from(persons));
  const { data: allAliases } = useLiveQuery(db.select().from(personAliases));
  const { data: catalog } = useLiveQuery(db.select().from(items));
  const { data: allOrders } = useLiveQuery(db.select().from(orders));
  const { data: allOrderItems } = useLiveQuery(db.select().from(orderItems));
  const { settings } = useSettings();

  const [targetDate, setTargetDate] = useState(getDefaultDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [cart, setCart] = useState<{ item: any; quantity: number }[]>([]);
  
  // Item search state
  const [searchQuery, setSearchQuery] = useState('');
  const [itemModalVisible, setItemModalVisible] = useState(false);

  // Person search state
  const [personSearchQuery, setPersonSearchQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Delivery place
  const [deliveryPlace, setDeliveryPlace] = useState('');

  // Create person modal
  const [personModalVisible, setPersonModalVisible] = useState(false);

  const [editModeOrderId, setEditModeOrderId] = useState<string | null>(null);

  const targetDateDb = getLocalDateString(targetDate);
  const existingOrder = useMemo(() => {
    if (!allOrders || !selectedPersonId) return null;
    return allOrders.find(o => o.personId === selectedPersonId && o.targetDate === targetDateDb);
  }, [allOrders, selectedPersonId, targetDateDb]);

  const personCorpus = useMemo(() => {
    const dbNames = people?.map(p => p.name) || [];
    const dbAliases = allAliases?.map(a => a.alias) || [];
    return [...new Set([...dbNames, ...dbAliases, ...COMMON_NAMES_CORPUS])];
  }, [people, allAliases]);

  const itemCorpus = useMemo(() => {
    const dbItems = catalog?.map(i => i.name) || [];
    return [...new Set([...dbItems, ...COMMON_GROCERY_CORPUS])];
  }, [catalog]);

  const loadExistingOrder = () => {
    if (!existingOrder || !allOrderItems || !catalog) return;
    const itemsForOrder = allOrderItems.filter(oi => oi.orderId === existingOrder.id);
    const newCart = itemsForOrder.map(oi => {
      const itemDef = catalog.find(c => c.id === oi.itemId);
      return { item: itemDef, quantity: oi.quantity };
    }).filter(c => c.item);
    
    setCart(newCart);
    setEditModeOrderId(existingOrder.id);
    // Load existing delivery place
    if (existingOrder.deliveryPlace) {
      setDeliveryPlace(existingOrder.deliveryPlace);
    }
  };

  /** When a person is selected, auto-fill delivery place from their typical place */
  const handleSelectPerson = (personId: string) => {
    setSelectedPersonId(personId);
    const person = people?.find(p => p.id === personId);
    if (person?.typicalPlace) {
      setDeliveryPlace(person.typicalPlace);
    } else {
      setDeliveryPlace('');
    }
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
        await api.updateOrder(editModeOrderId, selectedPersonId, orderLines, deliveryPlace || null);
        Alert.alert('Success', 'Order updated successfully (Note: all items have been reset to Unpaid)');
      } else {
        await api.createOrder(selectedPersonId, targetDateDb, orderLines, deliveryPlace || null);
        Alert.alert('Success', 'Order saved successfully');
      }
      
      setCart([]);
      setSelectedPersonId(null);
      setPersonSearchQuery('');
      setEditModeOrderId(null);
      setDeliveryPlace('');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save order');
    }
  };

  const handleCreateItemSubmit = async (name: string, defaultPrice: number | null, source: string | null, timing: 'Fresh' | 'Anytime', isCorrection: boolean) => {
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

  const handleCreatePersonDone = (newPersonId?: string) => {
    setPersonModalVisible(false);
    if (newPersonId) {
      handleSelectPerson(newPersonId);
      setPersonSearchQuery('');
    }
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setTargetDate(selectedDate);
      setEditModeOrderId(null);
    }
  };

  const filteredCatalog = catalog?.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];
  const exactItemMatch = filteredCatalog.find(i => i.name.toLowerCase() === searchQuery.toLowerCase().trim());

  // Person search: match by primary name OR alias
  const filteredPeople = useMemo(() => {
    if (!people || !personSearchQuery.trim()) return people || [];
    const q = personSearchQuery.toLowerCase().trim();

    // Get person IDs that match by alias
    const aliasMatchedIds = new Set(
      allAliases
        ?.filter(a => a.alias.toLowerCase().includes(q))
        .map(a => a.personId) || []
    );

    return people.filter(p =>
      p.name.toLowerCase().includes(q) || aliasMatchedIds.has(p.id)
    );
  }, [people, allAliases, personSearchQuery]);

  const exactPersonMatch = useMemo(() => {
    const q = personSearchQuery.toLowerCase().trim();
    if (!q) return undefined;
    // Exact match by primary name
    const byName = people?.find(p => p.name.toLowerCase() === q);
    if (byName) return byName;
    // Exact match by alias → resolve to primary person
    const aliasMatch = allAliases?.find(a => a.alias.toLowerCase() === q);
    if (aliasMatch) return people?.find(p => p.id === aliasMatch.personId);
    return undefined;
  }, [people, allAliases, personSearchQuery]);

  // Get alias that matched for display hint
  const getMatchingAlias = (personId: string): string | null => {
    if (!personSearchQuery.trim()) return null;
    const q = personSearchQuery.toLowerCase().trim();
    const person = people?.find(p => p.id === personId);
    // Only show alias hint if the name itself doesn't match
    if (person && person.name.toLowerCase().includes(q)) return null;
    const match = allAliases?.find(a => a.personId === personId && a.alias.toLowerCase().includes(q));
    return match?.alias || null;
  };

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
        
        {/* 1. Who is this for? */}
        <View style={[styles.section, settings.compactMode && styles.sectionCompact, { zIndex: 20 }]}>
          <Text style={[styles.sectionTitle, settings.compactMode && styles.textSmall]}>1. Who is this for?</Text>
          
          {selectedPersonId ? (
            <View style={[styles.selectedRow, settings.compactMode && styles.paddingSmall]}>
              <Text style={[styles.selectedText, settings.compactMode && styles.textSmall]}>
                {people?.find(p => p.id === selectedPersonId)?.name}
              </Text>
              <TouchableOpacity onPress={() => { setSelectedPersonId(null); setEditModeOrderId(null); setCart([]); setDeliveryPlace(''); }} style={[styles.changeBtn, settings.compactMode && styles.paddingSmall]}>
                <Text style={[styles.changeBtnText, settings.compactMode && styles.textExtraSmall]}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.searchRow, settings.compactMode && styles.searchRowCompact]}>
                <SmartTextInput
                  style={[styles.input, settings.compactMode && styles.inputCompact, { flex: 1, marginBottom: 0 }]}
                  value={personSearchQuery}
                  onChangeText={setPersonSearchQuery}
                  placeholder="Search person or nickname..."
                  placeholderTextColor="#888"
                  corpus={personCorpus}
                  compactMode={settings.compactMode}
                />
                {personSearchQuery.trim().length > 0 && !exactPersonMatch && (
                  <TouchableOpacity style={[styles.addButton, settings.compactMode && styles.addButtonCompact]} onPress={() => setPersonModalVisible(true)}>
                    <Text style={[styles.addButtonText, settings.compactMode && styles.textExtraSmall]}>Create "{personSearchQuery.trim()}"</Text>
                  </TouchableOpacity>
                )}
              </View>

              {filteredPeople.length > 0 && (
                <View style={[styles.grid, settings.compactMode && styles.gridCompact]}>
                  {filteredPeople.slice(0, 8).map((p) => {
                    const matchedAlias = getMatchingAlias(p.id);
                    return (
                      <TouchableOpacity key={p.id} style={[styles.gridItemPerson, settings.compactMode && styles.gridItemPersonCompact]} onPress={() => handleSelectPerson(p.id)}>
                        <Text style={[styles.gridItemName, settings.compactMode && styles.textExtraSmall]}>{p.name}</Text>
                        {matchedAlias && (
                          <Text style={styles.gridItemAlias}>({matchedAlias})</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* 2. When? */}
        <View style={[styles.section, settings.compactMode && styles.sectionCompact, { zIndex: 10 }]}>
          <Text style={[styles.sectionTitle, settings.compactMode && styles.textSmall]}>2. When?</Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.dateDisplay, settings.compactMode && styles.dateDisplayCompact]}>
            <Text style={[styles.dateDisplayText, settings.compactMode && styles.textSmall]}>{formatDateLabel(targetDate)}</Text>
            <FontAwesome name="calendar" size={settings.compactMode ? 14 : 16} color="#2f95dc" />
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={targetDate}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        )}

        {/* 2.5 Delivery Place */}
        {selectedPersonId && (
          <View style={[styles.section, settings.compactMode && styles.sectionCompact]}>
            <Text style={[styles.sectionTitle, settings.compactMode && styles.textSmall]}>📍 Deliver to</Text>
            <TextInput
              style={[styles.input, settings.compactMode && styles.inputCompact]}
              value={deliveryPlace}
              onChangeText={setDeliveryPlace}
              placeholder="e.g. Building A, Floor 3"
              placeholderTextColor="#888"
            />
          </View>
        )}

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
        <View style={[styles.section, settings.compactMode && styles.sectionCompact]}>
          <Text style={[styles.sectionTitle, settings.compactMode && styles.textSmall]}>
            3. What do they want? {editModeOrderId && <Text style={{color: '#ff9800'}}>(Editing)</Text>}
          </Text>
          <View style={[styles.searchRow, settings.compactMode && styles.searchRowCompact]}>
            <SmartTextInput
              style={[styles.input, settings.compactMode && styles.inputCompact, { flex: 1, marginBottom: 0 }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search or add item..."
              placeholderTextColor="#888"
              corpus={itemCorpus}
              compactMode={settings.compactMode}
            />
            {searchQuery.trim().length > 0 && !exactItemMatch && (
              <TouchableOpacity style={[styles.addButton, settings.compactMode && styles.addButtonCompact]} onPress={() => setItemModalVisible(true)}>
                <Text style={[styles.addButtonText, settings.compactMode && styles.textExtraSmall]}>Create "{searchQuery.trim()}"</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.grid, settings.compactMode && styles.gridCompact]}>
            {filteredCatalog.slice(0, 12).map((item) => {
              const inCart = cart.find((c) => c.item.id === item.id);
              return (
                <TouchableOpacity key={item.id} style={[styles.gridItem, settings.compactMode && styles.gridItemCompact]} onPress={() => addToCart(item)}>
                  <Text style={[styles.gridItemName, settings.compactMode && styles.textSmall]}>{item.name}</Text>
                  {inCart && (
                    <View style={[styles.badge, settings.compactMode && styles.badgeCompact]}>
                      <Text style={[styles.badgeText, settings.compactMode && styles.textExtraSmall]}>{inCart.quantity}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Cart Review */}
        {cart.length > 0 && (
          <View style={[styles.section, settings.compactMode && styles.sectionCompact]}>
            <Text style={[styles.sectionTitle, settings.compactMode && styles.textSmall]}>Cart Review</Text>
            {cart.map((c) => {
              return (
                <View key={c.item.id} style={[styles.cartRow, settings.compactMode && styles.cartRowCompact]}>
                  <Text style={[styles.cartText, settings.compactMode && styles.textSmall]}>{c.item.name}</Text>
                  <View style={styles.cartActions}>
                    <TouchableOpacity onPress={() => removeFromCart(c.item.id)} style={[styles.cartBtn, settings.compactMode && styles.paddingSmall]}>
                      <FontAwesome name="minus" size={settings.compactMode ? 12 : 16} color="#000" />
                    </TouchableOpacity>
                    <Text style={[styles.cartQuantity, settings.compactMode && styles.textSmall]}>{c.quantity}</Text>
                    <TouchableOpacity onPress={() => addToCart(c.item)} style={[styles.cartBtn, settings.compactMode && styles.paddingSmall]}>
                      <FontAwesome name="plus" size={settings.compactMode ? 12 : 16} color="#000" />
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
          settings.compactMode && styles.saveButtonCompact,
          existingOrder && editModeOrderId !== existingOrder.id && styles.saveButtonDisabled
        ]} 
        onPress={handleSaveOrder}
        disabled={!!(existingOrder && editModeOrderId !== existingOrder.id)}>
        <Text style={[styles.saveButtonText, settings.compactMode && styles.textSmall]}>{editModeOrderId ? 'Save Edited Order' : 'Save Order'}</Text>
      </TouchableOpacity>

      <CreateItemModal
        visible={itemModalVisible}
        initialName={searchQuery}
        onCancel={() => setItemModalVisible(false)}
        onSubmit={handleCreateItemSubmit}
      />

      <PersonModal
        visible={personModalVisible}
        mode="create"
        initialName={personSearchQuery}
        onCancel={() => setPersonModalVisible(false)}
        onDone={handleCreatePersonDone}
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
    alignItems: 'center',
  },
  gridItemName: { color: '#fff', textAlign: 'center' },
  gridItemAlias: { color: '#8bb8e8', textAlign: 'center', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
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
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 10,
  },
  dateDisplayText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  
  // Compact Modifiers
  sectionCompact: { padding: 10 },
  inputCompact: { padding: 8, fontSize: 14, marginBottom: 5 },
  searchRowCompact: { marginBottom: 5 },
  addButtonCompact: { padding: 8 },
  gridCompact: { gap: 6 },
  gridItemCompact: { padding: 10 },
  gridItemPersonCompact: { padding: 6 },
  badgeCompact: { width: 18, height: 18, top: -4, right: -4 },
  dateDisplayCompact: { paddingVertical: 4, paddingHorizontal: 8 },
  cartRowCompact: { marginBottom: 6 },
  saveButtonCompact: { padding: 12, margin: 8 },
  textSmall: { fontSize: 14 },
  textExtraSmall: { fontSize: 11 },
  paddingSmall: { padding: 2 },
});
