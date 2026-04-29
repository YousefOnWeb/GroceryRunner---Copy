import React, { useState, useEffect } from 'react';
import { StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, View } from './Themed';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface EditStringEntityModalProps {
  visible: boolean;
  entityType: 'Place' | 'Source';
  initialName: string;
  initialAliases: string[];
  onClose: () => void;
  onSubmit: (oldName: string, newName: string, aliases: string[]) => Promise<void>;
}

export default function EditStringEntityModal({ visible, entityType, initialName, initialAliases, onClose, onSubmit }: EditStringEntityModalProps) {
  const [name, setName] = useState(initialName);
  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const [newAlias, setNewAlias] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setAliases([...initialAliases]);
      setNewAlias('');
      setIsSubmitting(false);
    }
  }, [visible, initialName, initialAliases]);

  const addAlias = () => {
    const trimmed = newAlias.trim();
    if (!trimmed) return;
    if (aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())) return;
    if (trimmed.toLowerCase() === name.toLowerCase()) return;
    setAliases(prev => [...prev, trimmed]);
    setNewAlias('');
  };

  const removeAlias = (index: number) => {
    setAliases(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert(`${entityType} name is required.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(initialName, trimmedName, aliases);
      onClose();
    } catch (e) {
      console.error(e);
      alert(`Failed to update ${entityType}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView 
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit {entityType}</Text>
            <TouchableOpacity onPress={onClose} disabled={isSubmitting}>
              <FontAwesome name="times" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{entityType} Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={`e.g. ${entityType === 'Place' ? 'Home' : 'Supermarket'}`}
              placeholderTextColor="#666"
              autoFocus
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Aliases / Nicknames</Text>
            <Text style={styles.hint}>Help recognition when typing different names.</Text>
            
            <View style={styles.aliasList}>
              {aliases.map((alias, idx) => (
                <View key={idx} style={styles.aliasRow}>
                  <Text style={styles.aliasText}>{alias}</Text>
                  <TouchableOpacity onPress={() => removeAlias(idx)} style={styles.removeAliasBtn}>
                    <FontAwesome name="times-circle" size={18} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.addAliasRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newAlias}
                onChangeText={setNewAlias}
                placeholder="Add a nickname..."
                placeholderTextColor="#666"
                onSubmitEditing={addAlias}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addAliasBtn, !newAlias.trim() && { opacity: 0.4 }]}
                onPress={addAlias}
                disabled={!newAlias.trim()}>
                <FontAwesome name="plus" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit} disabled={isSubmitting}>
              <Text style={styles.saveText}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    color: '#ccc',
    marginBottom: 5,
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  aliasList: {
    marginBottom: 5,
  },
  aliasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 5,
  },
  aliasText: {
    color: '#fff',
    fontSize: 15,
  },
  removeAliasBtn: {
    padding: 4,
  },
  addAliasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  addAliasBtn: {
    backgroundColor: '#2f95dc',
    padding: 12,
    borderRadius: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 15,
    marginTop: 10,
  },
  cancelBtn: {
    padding: 12,
  },
  cancelText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveBtn: {
    backgroundColor: '#2f95dc',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
