import PromptModal from '@/components/PromptModal';
import { Text, View } from '@/components/Themed';
import { db } from '@/db';
import { api } from '@/db/api';
import { persons } from '@/db/schema';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import React, { useState } from 'react';
import { Alert, Modal, View as RNView, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface AdjustmentState {
  personId: string;
  personName: string;
  type: 'increase' | 'decrease' | null;
}

export default function PeopleScreen() {
  const { data: peopleList } = useLiveQuery(db.select().from(persons));
  const [promptVisible, setPromptVisible] = useState(false);
  const [adjustmentState, setAdjustmentState] = useState<AdjustmentState>({
    personId: '',
    personName: '',
    type: null,
  });
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  const handleChangePress = (personId: string, personName: string) => {
    setAdjustmentState({ personId, personName, type: null });
    setTypeModalVisible(true);
  };

  const handleTypeSelect = (type: 'increase' | 'decrease') => {
    setAdjustmentState((prev) => ({ ...prev, type }));
    setTypeModalVisible(false);
    setPromptVisible(true);
  };

  const handleAdjustmentSubmit = async (amountStr: string) => {
    if (!adjustmentState.personId || !adjustmentState.type) return;
    setPromptVisible(false);

    const amount = parseFloat(amountStr || '0');
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Invalid amount');
      return;
    }

    const finalAmount = adjustmentState.type === 'increase' ? amount : -amount;
    await api.changeBalance(adjustmentState.personId, finalAmount);
    Alert.alert('Success', 'Balance updated!');
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Colleagues & Balances</Text>
        
        {peopleList?.map((person) => (
          <View key={person.id} style={styles.card}>
            <View style={styles.info}>
              <Text style={styles.name}>{person.name}</Text>
              <Text style={[styles.balance, { color: getBalanceColor(person.balance) }]}>
                {getBalanceLabel(person.balance)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => handleChangePress(person.id, person.name)}>
              <Text style={styles.btnText}>Change Manually</Text>
            </TouchableOpacity>
          </View>
        ))}

        {peopleList?.length === 0 && (
          <Text style={styles.emptyText}>No people added yet. Add them when creating an order.</Text>
        )}
      </ScrollView>

      <Modal visible={typeModalVisible} transparent animationType="fade">
        <RNView style={styles.overlay}>
          <View style={styles.typeDialog}>
            <Text style={styles.typeTitle}>What do you want to do?</Text>
            <TouchableOpacity
              style={styles.typeOption}
              onPress={() => handleTypeSelect('increase')}>
              <Text style={styles.typeOptionText}>Increase their credit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeOption, styles.typeOptionDanger]}
              onPress={() => handleTypeSelect('decrease')}>
              <Text style={styles.typeOptionText}>Decrease their credit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.typeCancel}
              onPress={() => setTypeModalVisible(false)}>
              <Text style={styles.typeCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </RNView>
      </Modal>

      {adjustmentState.type && (
        <PromptModal
          visible={promptVisible}
          title="Adjust Balance"
          message={`Person: ${adjustmentState.personName}\nAction: ${
            adjustmentState.type === 'increase' ? 'Increase' : 'Decrease'
          } their credit\n\nEnter amount:`}
          placeholder="e.g. 50"
          keyboardType="numeric"
          onCancel={() => setPromptVisible(false)}
          onSubmit={handleAdjustmentSubmit}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 15 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#fff' },
  card: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  info: { flex: 1 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  balance: { fontSize: 14, fontWeight: '600' },
  btn: { backgroundColor: '#2f95dc', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  emptyText: { color: '#888', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  typeDialog: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  typeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  typeOption: {
    backgroundColor: '#2f95dc',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  typeOptionDanger: {
    backgroundColor: '#d9534f',
  },
  typeOptionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  typeCancel: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  typeCancelText: {
    color: '#aaa',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
