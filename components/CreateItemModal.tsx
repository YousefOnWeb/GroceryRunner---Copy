import { Text } from '@/components/Themed';
import { api } from '@/db/api';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import DropdownSelect from './DropdownSelect';

interface CreateItemModalProps {
  visible: boolean;
  title?: string;
  submitLabel?: string;
  initialName?: string;
  initialPrice?: number | null;
  initialSource?: string | null;
  initialTiming?: 'Fresh' | 'Anytime';
  onCancel: () => void;
  onSubmit: (name: string, defaultPrice: number | null, source: string | null, timing: 'Fresh' | 'Anytime') => void;
}

export default function CreateItemModal({
  visible,
  title = 'Create New Item',
  submitLabel = 'Create Item',
  initialName = '',
  initialPrice = null,
  initialSource = '',
  initialTiming = 'Fresh',
  onCancel,
  onSubmit,
}: CreateItemModalProps) {
  const [name, setName] = useState(initialName);
  const [priceStr, setPriceStr] = useState(initialPrice ? String(initialPrice) : '');
  const [source, setSource] = useState(initialSource || '');
  const [sourceSearch, setSourceSearch] = useState('');
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);
  const [distinctSources, setDistinctSources] = useState<string[]>([]);
  const [timing, setTiming] = useState<'Fresh' | 'Anytime'>(initialTiming);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setPriceStr(initialPrice ? String(initialPrice) : '');
      setSource(initialSource || '');
      setSourceSearch('');
      setShowSourceSuggestions(false);
      loadDistinctSources();
      setTiming(initialTiming);
    }
  }, [visible, initialName, initialPrice, initialSource, initialTiming]);

  const loadDistinctSources = async () => {
    try {
      const sources = await api.getDistinctSources();
      setDistinctSources(sources);
    } catch (error) {
      console.error('Error loading sources:', error);
    }
  };

  const filteredSources = sourceSearch.trim()
    ? distinctSources.filter(s => s.toLowerCase().includes(sourceSearch.toLowerCase()))
    : [];

  const handleSourceSelect = (selected: string) => {
    setSource(selected);
    setSourceSearch('');
    setShowSourceSuggestions(false);
  };

  const handleSubmit = () => {
    const price = parseFloat(priceStr);
    const finalSource = (sourceSearch.trim() || source.trim()) || null;
    onSubmit(
      name,
      isNaN(price) ? null : price,
      finalSource,
      timing
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <ScrollView style={styles.dialog} contentContainerStyle={styles.dialogContent}>
          <Text style={styles.title}>{title}</Text>
          
          <Text style={styles.label}>Item Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Milk"
            placeholderTextColor="#888"
          />

          <Text style={styles.label}>Default Price (Optional)</Text>
          <TextInput
            style={styles.input}
            value={priceStr}
            onChangeText={setPriceStr}
            placeholder="e.g. 2.99"
            placeholderTextColor="#888"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Source (Optional)</Text>
          <TextInput
            style={styles.input}
            value={sourceSearch || source}
            onChangeText={(text) => {
              setSourceSearch(text);
              setShowSourceSuggestions(text.length > 0);
            }}
            onFocus={() => sourceSearch.length > 0 && setShowSourceSuggestions(true)}
            placeholder="e.g. Walmart, Local Market"
            placeholderTextColor="#888"
          />
          
          {showSourceSuggestions && filteredSources.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {filteredSources.map((suggestion, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.suggestionItem}
                  onPress={() => handleSourceSelect(suggestion)}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>Timing</Text>
          <View style={styles.dropdownContainer}>
            <DropdownSelect
              value={timing}
              options={['Fresh', 'Anytime']}
              onSelect={(val) => setTiming(val as 'Fresh' | 'Anytime')}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, !name.trim() && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={!name.trim()}>
              <Text style={styles.submitBtnText}>{submitLabel}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: '#222',
    width: '100%',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    maxHeight: '90%',
  },
  dialogContent: {
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  suggestionsContainer: {
    backgroundColor: '#333',
    borderRadius: 6,
    marginTop: 5,
    maxHeight: 150,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  suggestionText: {
    color: '#2f95dc',
    fontSize: 14,
  },
  dropdownContainer: {
    marginBottom: 10,
    zIndex: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
