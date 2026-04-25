import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Text } from './Themed';
import { api } from '@/db/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSettings } from '@/utils/settings';

interface CreditLogModalProps {
  visible: boolean;
  personId: string;
  personName: string;
  onClose: () => void;
}

export default function CreditLogModal({ visible, personId, personName, onClose }: CreditLogModalProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { settings } = useSettings();

  useEffect(() => {
    if (visible && personId) {
      loadLogs();
    }
  }, [visible, personId]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getTransactionsForPerson(personId);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (isoString: string) => {
    const d = new Date(isoString);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = weekdays[d.getDay()];
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day}, ${date} ${time}`;
  };

  const getAmountColor = (amount: number) => {
    return amount >= 0 ? '#00C851' : '#ff4444';
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.dialog, settings.compactMode && styles.dialogCompact]}>
          <View style={styles.header}>
            <Text style={[styles.title, settings.compactMode && styles.titleCompact]}>Credit Log: {personName}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <FontAwesome name="times" size={20} color="#888" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#2f95dc" style={{ margin: 20 }} />
          ) : (
            <ScrollView style={styles.logList} contentContainerStyle={styles.logListContent}>
              {logs.map((log) => (
                <View key={log.id} style={[styles.logItem, settings.compactMode && styles.logItemCompact]}>
                  <View style={styles.logTop}>
                    <Text style={[styles.logDate, settings.compactMode && styles.textExtraSmall]}>
                      {formatDateTime(log.date)}
                    </Text>
                    <Text style={[styles.logAmount, { color: getAmountColor(log.amount) }, settings.compactMode && styles.textSmall]}>
                      {log.amount >= 0 ? '+' : ''}{log.amount.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={[styles.logNote, settings.compactMode && styles.textSmall]}>{log.note || log.type}</Text>
                </View>
              ))}
              {logs.length === 0 && (
                <Text style={styles.emptyText}>No transaction history found.</Text>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: '#222',
    width: '100%',
    maxHeight: '80%',
    borderRadius: 12,
    padding: 20,
    elevation: 10,
  },
  dialogCompact: { padding: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  titleCompact: { fontSize: 16 },
  closeBtn: { padding: 5 },
  logList: { flexGrow: 0 },
  logListContent: { paddingBottom: 10 },
  logItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingVertical: 12,
  },
  logItemCompact: { paddingVertical: 8 },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logDate: { color: '#888', fontSize: 12 },
  logAmount: { fontWeight: 'bold', fontSize: 16 },
  logNote: { color: '#eee', fontSize: 14 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  textSmall: { fontSize: 13 },
  textExtraSmall: { fontSize: 11 },
});
