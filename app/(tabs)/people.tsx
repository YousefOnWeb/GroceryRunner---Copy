import PersonModal from '@/components/PersonModal';
import UnknownPriceModal from '@/components/UnknownPriceModal';
import CreditLogModal from '@/components/CreditLogModal';
import { Text, View } from '@/components/Themed';
import { db } from '@/db';
import { api } from '@/db/api';
import { orderItems, orders, personAliases, persons, transactions } from '@/db/schema';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { and, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '@/utils/settings';

interface EditState {
  personId: string;
  name: string;
  typicalPlace: string | null;
  aliases: string[];
  balance: number;
}

export default function PeopleScreen() {
  const { data: peopleList } = useLiveQuery(db.select().from(persons));
  const { data: allAliases } = useLiveQuery(db.select().from(personAliases));
  const { settings } = useSettings();

  // Create person modal
  const [createModalVisible, setCreateModalVisible] = useState(false);

  // Edit person modal
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Unknown price notes modal
  const [unknownPricePerson, setUnknownPricePerson] = useState<{ id: string; name: string } | null>(null);

  // Credit log modal
  const [logPerson, setLogPerson] = useState<{ id: string; name: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  const filteredPeople = useMemo(() => {
    if (!peopleList) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return peopleList;

    return peopleList.filter(p => {
      const aliases = allAliases?.filter(a => a.personId === p.id).map(a => a.alias) || [];
      const searchString = [
        p.name,
        p.typicalPlace,
        ...aliases
      ].join(' ').toLowerCase();
      return searchString.includes(q);
    });
  }, [peopleList, allAliases, searchQuery]);

  const { data: unpaidUnknownPriceItems } = useLiveQuery(
    db.select({ personId: orders.personId })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orderItems.isPaid, false),
        sql`${orderItems.unitPrice} IS NULL`
      ))
  );

  const peopleWithUnknownPrices = useMemo(() => {
    return new Set(unpaidUnknownPriceItems?.map(i => i.personId) || []);
  }, [unpaidUnknownPriceItems]);

  const handleEditPress = (person: typeof peopleList extends (infer T)[] | undefined ? T : never) => {
    if (!person) return;
    const aliases = allAliases?.filter(a => a.personId === person.id).map(a => a.alias) || [];
    setEditState({
      personId: person.id,
      name: person.name,
      typicalPlace: person.typicalPlace,
      aliases,
      balance: person.balance,
    });
    setEditModalVisible(true);
  };

  const getBalanceLabel = (balance: number, hasUnknownPrices: boolean) => {
    if (balance < 0) {
      return `Your money with them: $${Math.abs(balance).toFixed(2)}`;
    } else if (balance > 0) {
      return `Their money with you: $${balance.toFixed(2)}`;
    } else {
      return hasUnknownPrices ? 'Awaiting Prices' : 'Settled';
    }
  };

  const getBalanceColor = (balance: number, hasUnknownPrices: boolean) => {
    if (balance < 0) return '#ff4444';
    if (balance > 0) return '#00C851';
    return hasUnknownPrices ? '#ff9800' : '#aaa';
  };

  const getAliasesForPerson = (personId: string) => {
    return allAliases?.filter(a => a.personId === personId).map(a => a.alias) || [];
  };

  const handleCopyPeople = async () => {
    if (!peopleList) return;

    const allTx = await db.select().from(transactions).orderBy(sql`${transactions.date} DESC`);

    let text = `👥 PEOPLE & BALANCES SUMMARY\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    peopleList.forEach(p => {
      const hasUnknownPrices = peopleWithUnknownPrices.has(p.id);
      let statusIcon = '✅';
      let balText = '';

      if (p.balance < 0) {
        statusIcon = '❌';
        balText = `You are owed: $${Math.abs(p.balance).toFixed(2)}`;
      } else if (p.balance > 0) {
        statusIcon = '✅'; // They have credit with you
        balText = `They have credit: $${p.balance.toFixed(2)}`;
      } else {
        if (hasUnknownPrices) {
          statusIcon = '❌';
          balText = `Awaiting Prices (TBD)`;
        } else {
          statusIcon = '✅';
          balText = `Settled`;
        }
      }

      text += `${statusIcon} ${p.name}\n`;
      text += `   ${balText}\n`;
      if (p.typicalPlace) text += `   📍 ${p.typicalPlace}\n`;
      
      // Include Logs
      const personTx = allTx.filter(tx => tx.personId === p.id);
      if (personTx.length > 0) {
        text += `   📜 Recent Logs:\n`;
        personTx.slice(0, 5).forEach(tx => {
          const d = new Date(tx.date);
          const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const day = weekdays[d.getDay()];
          const dateStr = `${day}, ${d.toLocaleDateString()}`;
          const amountStr = tx.amount >= 0 ? `+$${tx.amount.toFixed(2)}` : `-$${Math.abs(tx.amount).toFixed(2)}`;
          text += `     • ${dateStr}: ${amountStr} (${tx.note || tx.type})\n`;
        });
        if (personTx.length > 5) {
          text += `     ... and ${personTx.length - 5} more transactions\n`;
        }
      }

      text += `\n`;
    });

    await Clipboard.setStringAsync(text);
    Alert.alert('Copied!', 'Balance summary copied to clipboard.');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView contentContainerStyle={[styles.content, settings.compactMode && styles.contentCompact]}>
        <View style={[styles.headerRow, settings.compactMode && styles.headerRowCompact]}>
          <Text style={[styles.title, settings.compactMode && styles.titleCompact]}>Balances</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleCopyPeople} style={[styles.copyBtn, settings.compactMode && styles.paddingSmall]}>
              <FontAwesome name="copy" size={settings.compactMode ? 16 : 20} color="#2f95dc" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addBtn, settings.compactMode && styles.addBtnCompact]} onPress={() => setCreateModalVisible(true)}>
              <FontAwesome name="plus" size={settings.compactMode ? 12 : 16} color="#fff" />
              <Text style={[styles.addBtnText, settings.compactMode && styles.textExtraSmall]}>Add Person</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, settings.compactMode && styles.searchInputCompact]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name, place or alias..."
            placeholderTextColor="#888"
          />
        </View>

        {filteredPeople.map((person) => {
          const aliases = getAliasesForPerson(person.id);
          return (
            <View key={person.id} style={[styles.card, settings.compactMode && styles.cardCompact]}>
              <View style={styles.info}>
                <View style={[styles.nameRow, settings.compactMode && styles.nameRowCompact]}>
                  <Text style={[styles.name, settings.compactMode && styles.nameCompact]}>{person.name}</Text>
                  <View style={styles.personActions}>
                    <TouchableOpacity onPress={() => setLogPerson({ id: person.id, name: person.name })} style={[styles.iconBtn, settings.compactMode && styles.paddingSmall]}>
                      <FontAwesome name="history" size={settings.compactMode ? 14 : 18} color="#2f95dc" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleEditPress(person)} style={[styles.iconBtn, settings.compactMode && styles.paddingSmall]}>
                      <FontAwesome name="pencil" size={settings.compactMode ? 14 : 18} color="#2f95dc" />
                    </TouchableOpacity>
                  </View>
                </View>
                {person.typicalPlace ? (
                  <Text style={[styles.place, settings.compactMode && styles.textExtraSmall]}>📍 {person.typicalPlace}</Text>
                ) : null}
                {aliases.length > 0 ? (
                  <Text style={[styles.aliases, settings.compactMode && styles.textExtraSmall]}>
                    aka: {aliases.join(', ')}
                  </Text>
                ) : null}
                <View style={[styles.balanceRow, settings.compactMode && styles.balanceRowCompact]}>
                  <Text style={[styles.balance, settings.compactMode && styles.textSmall, { color: getBalanceColor(person.balance, peopleWithUnknownPrices.has(person.id)) }]}>
                    {getBalanceLabel(person.balance, peopleWithUnknownPrices.has(person.id))}
                  </Text>
                  {peopleWithUnknownPrices.has(person.id) && (
                    <TouchableOpacity
                      onPress={() => setUnknownPricePerson({ id: person.id, name: person.name })}
                      style={[styles.notesBtn, settings.compactMode && styles.paddingSmall]}>
                      <FontAwesome name="exclamation-circle" size={settings.compactMode ? 14 : 18} color="#ff9800" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {peopleList?.length === 0 && (
          <Text style={styles.emptyText}>No people added yet. Tap "Add Person" or add them when creating an order.</Text>
        )}

        {searchQuery.trim() !== '' && filteredPeople.length === 0 && (
          <View style={styles.noResultsContainer}>
            <FontAwesome name="search" size={48} color="#444" style={{ marginBottom: 10 }} />
            <Text style={styles.noResultsText}>No one found matching "{searchQuery}"</Text>
          </View>
        )}
      </ScrollView>

      {/* Create Person Modal */}
      <PersonModal
        visible={createModalVisible}
        mode="create"
        onCancel={() => setCreateModalVisible(false)}
        onDone={() => setCreateModalVisible(false)}
      />

      {/* Edit Person Modal */}
      {editState && (
        <PersonModal
          visible={editModalVisible}
          mode="edit"
          personId={editState.personId}
          initialName={editState.name}
          initialPlace={editState.typicalPlace}
          initialAliases={editState.aliases}
          initialBalance={editState.balance}
          onCancel={() => { setEditModalVisible(false); setEditState(null); }}
          onDone={() => { setEditModalVisible(false); setEditState(null); }}
        />
      )}
      {/* Unknown Price Notes Modal */}
      {unknownPricePerson && (
        <UnknownPriceModal
          visible={!!unknownPricePerson}
          personId={unknownPricePerson.id}
          personName={unknownPricePerson.name}
          onClose={() => setUnknownPricePerson(null)}
        />
      )}
      
      {/* Credit Log Modal */}
      {logPerson && (
        <CreditLogModal
          visible={!!logPerson}
          personId={logPerson.id}
          personName={logPerson.name}
          onClose={() => setLogPerson(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 15 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  copyBtn: { padding: 5 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2f95dc',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  card: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  info: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  personActions: { flexDirection: 'row', gap: 12 },
  iconBtn: {
    padding: 6,
  },
  place: {
    fontSize: 13,
    color: '#8bb8e8',
    marginBottom: 3,
  },
  aliases: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 3,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  balance: { fontSize: 14, fontWeight: '600' },
  notesBtn: {
    padding: 4,
  },
  emptyText: { color: '#888', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  
  // Compact Modifiers
  contentCompact: { padding: 8 },
  headerRowCompact: { marginBottom: 12 },
  titleCompact: { fontSize: 20 },
  addBtnCompact: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  cardCompact: { padding: 10, marginBottom: 8 },
  nameRowCompact: { marginBottom: 2 },
  nameCompact: { fontSize: 16 },
  balanceRowCompact: { marginTop: 0 },
  textSmall: { fontSize: 13 },
  textExtraSmall: { fontSize: 11 },
  paddingSmall: { padding: 2 },
  noResultsContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#444',
    borderStyle: 'dashed',
  },
  noResultsText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  searchContainer: {
    marginBottom: 15,
  },
  searchInput: {
    backgroundColor: '#333',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
    width: '100%',
  },
  searchInputCompact: {
    paddingVertical: 6,
    fontSize: 14,
  },
});
