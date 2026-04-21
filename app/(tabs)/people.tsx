import PersonModal from '@/components/PersonModal';
import UnknownPriceModal from '@/components/UnknownPriceModal';
import { Text, View } from '@/components/Themed';
import { db } from '@/db';
import { api } from '@/db/api';
import { orderItems, orders, personAliases, persons } from '@/db/schema';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { and, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

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

  // Create person modal
  const [createModalVisible, setCreateModalVisible] = useState(false);

  // Edit person modal
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Unknown price notes modal
  const [unknownPricePerson, setUnknownPricePerson] = useState<{ id: string; name: string } | null>(null);

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

  const getBalanceLabel = (balance: number) => {
    if (balance < 0) {
      return `Your money with them: $${Math.abs(balance).toFixed(2)}`;
    } else if (balance > 0) {
      return `Their money with you: $${balance.toFixed(2)}`;
    } else {
      return 'Settled';
    }
  };

  const getBalanceColor = (balance: number) => {
    if (balance < 0) return '#ff4444';
    if (balance > 0) return '#00C851';
    return '#aaa';
  };

  const getAliasesForPerson = (personId: string) => {
    return allAliases?.filter(a => a.personId === personId).map(a => a.alias) || [];
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Colleagues & Balances</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModalVisible(true)}>
            <FontAwesome name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add Person</Text>
          </TouchableOpacity>
        </View>

        {peopleList?.map((person) => {
          const aliases = getAliasesForPerson(person.id);
          return (
            <View key={person.id} style={styles.card}>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{person.name}</Text>
                  <TouchableOpacity onPress={() => handleEditPress(person)} style={styles.editBtn}>
                    <FontAwesome name="pencil" size={18} color="#2f95dc" />
                  </TouchableOpacity>
                </View>
                {person.typicalPlace ? (
                  <Text style={styles.place}>📍 {person.typicalPlace}</Text>
                ) : null}
                {aliases.length > 0 ? (
                  <Text style={styles.aliases}>
                    aka: {aliases.join(', ')}
                  </Text>
                ) : null}
                <View style={styles.balanceRow}>
                  <Text style={[styles.balance, { color: getBalanceColor(person.balance) }]}>
                    {getBalanceLabel(person.balance)}
                  </Text>
                  {peopleWithUnknownPrices.has(person.id) && (
                    <TouchableOpacity
                      onPress={() => setUnknownPricePerson({ id: person.id, name: person.name })}
                      style={styles.notesBtn}>
                      <FontAwesome name="sticky-note-o" size={16} color="#ff9800" />
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
    </View>
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
  editBtn: {
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
});
