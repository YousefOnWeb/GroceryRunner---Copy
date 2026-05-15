import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DropdownSelect from '@/components/DropdownSelect';
import UnknownPriceModal from '@/components/UnknownPriceModal';
import CreditLogModal from '@/components/CreditLogModal';
import { Text, View } from '@/components/Themed';
import PromptModal from '@/components/PromptModal';
import { db } from '@/db';
import { api } from '@/db/api';
import { items, orderItems, orders, persons } from '@/db/schema';
import { extractDateValue, formatDateLabel, generateDateOptions, getDefaultDate, getLocalDateString } from '@/utils/dates';
import { useSettings } from '@/utils/settings';
import { useTranslation } from '@/utils/i18n';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View as RNView, KeyboardAvoidingView, AppState, Keyboard, I18nManager } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';

export default function TheRunScreen() {
  const [targetDate, setTargetDate] = useState(getDefaultDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [paidItems, setPaidItems] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Unknown price notes modal
  const [unknownPricePerson, setUnknownPricePerson] = useState<{ id: string; name: string } | null>(null);

  // Credit log modal
  const [logPerson, setLogPerson] = useState<{ id: string; name: string } | null>(null);

  // Collapsible states
  const [collapsedSources, setCollapsedSources] = useState<Record<string, boolean>>({});
  const [collapsedLocations, setCollapsedLocations] = useState<Record<string, boolean>>({});

  // Multi-select mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [showMoveDatePicker, setShowMoveDatePicker] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [payAmountOrder, setPayAmountOrder] = useState<{ id: string; personId: string; total: number; personName: string } | null>(null);

  const { settings } = useSettings();
  const { t, isRTL } = useTranslation();
  const router = useRouter();

  const dateOptions = useMemo(() => generateDateOptions(t, t('modals.daysShort')), [t]);

  // Force re-render when screen is focused to refresh "Today" labels
  useFocusEffect(
    React.useCallback(() => {
      setRefreshKey(prev => prev + 1);
    }, [])
  );

  // Refresh when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        setRefreshKey(prev => prev + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  const { data: allOrders } = useLiveQuery(db.select().from(orders));
  const { data: allOrderItems } = useLiveQuery(db.select().from(orderItems));
  const { data: catalog } = useLiveQuery(db.select().from(items));
  const { data: people } = useLiveQuery(db.select().from(persons));

  const { aggregatedItems, peopleOrders, listTotal } = useMemo(() => {
    const agg: Record<string, { item: any; totalQuantity: number; totalCost: number }> = {};
    const pOrders: Record<string, { person: any; order: any; items: any[]; totalCost: number; unpaidCost: number; hasUnpaidItems: boolean; hasUnknownPriceItems: boolean; deliveryPlace: string | null }> = {};

    if (!allOrders || !allOrderItems || !catalog || !people) {
      return { aggregatedItems: {}, peopleOrders: [], listTotal: 0 };
    }

    const targetDateDb = getLocalDateString(targetDate);
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

    type AggItem = typeof agg[string];
    let groupedList: Record<string, Record<string, AggItem[]>>;

    function sortSources(srcs: string[]) {
      return srcs.sort((a, b) => {
        const idxA = settings.sourceOrder.indexOf(a);
        const idxB = settings.sourceOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      });
    }

    if (settings.groupByFreshness) {
      const rawGrouped: Record<string, Record<string, AggItem[]>> = {};
      Object.values(agg).forEach(curr => {
        const timing = curr.item.timing || 'Anytime';
        const source = curr.item.source || 'Unknown';
        if (!rawGrouped[timing]) rawGrouped[timing] = {};
        if (!rawGrouped[timing][source]) rawGrouped[timing][source] = [];
        rawGrouped[timing][source].push(curr);
      });

      const sortedGrouped: Record<string, Record<string, AggItem[]>> = {};
      ['Fresh', 'Anytime'].forEach(timing => {
        if (rawGrouped[timing]) {
          sortedGrouped[timing] = {};
          const sources = sortSources(Object.keys(rawGrouped[timing]));
          sources.forEach(src => {
            sortedGrouped[timing][src] = rawGrouped[timing][src];
          });
        }
      });
      groupedList = sortedGrouped;
    } else {
      const rawBySource = Object.values(agg).reduce((acc, curr) => {
        const source = curr.item.source || 'Unknown';
        if (!acc[source]) acc[source] = [];
        acc[source].push(curr);
        return acc;
      }, {} as Record<string, AggItem[]>);

      const sortedBySource: Record<string, AggItem[]> = {};
      const sources = sortSources(Object.keys(rawBySource));
      sources.forEach(src => {
        sortedBySource[src] = rawBySource[src];
      });
      groupedList = { _all: sortedBySource };
    }

    const groupedDeliveries: Record<string, typeof pOrders[string][]> = {};
    Object.values(pOrders).forEach((po) => {
      const loc = po.deliveryPlace || 'No Location';
      if (!groupedDeliveries[loc]) groupedDeliveries[loc] = [];
      groupedDeliveries[loc].push(po);
    });

    const sortedLocations = Object.keys(groupedDeliveries).sort((a, b) => {
      const idxA = settings.locationOrder.indexOf(a);
      const idxB = settings.locationOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const listTotal = Object.values(agg).reduce((sum, item) => sum + item.totalCost, 0);

    return {
      aggregatedItems: groupedList,
      peopleOrders: sortedLocations.map(loc => ({
        location: loc,
        orders: groupedDeliveries[loc] || []
      })),
      listTotal,
    };
  }, [allOrders, allOrderItems, catalog, people, targetDate, settings.groupByFreshness, settings.locationOrder, settings.sourceOrder, targetDate, refreshKey]);

  const toggleCheck = (itemId: string) => {
    setCheckedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };


  const handleMarkAllPaid = async (orderId: string, personId: string) => {
    try {
      await api.markOrderPaid(orderId, personId);
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('run.failedMarkPaid'));
    }
  };

  const handleMarkAllUnpaid = async (orderId: string, personId: string) => {
    try {
      await api.markOrderUnpaid(orderId, personId);
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('run.failedMarkUnpaid'));
    }
  };

  const handleCustomPayment = async (value: string, markAllPast: boolean = false) => {
    if (!payAmountOrder) return;
    const paidAmount = parseFloat(value);
    if (isNaN(paidAmount)) {
      Alert.alert(t('common.error'), t('common.invalidAmount'));
      return;
    }

    const { id: orderId, personId, total: orderTotal } = payAmountOrder;
    setPayAmountOrder(null);

    try {
      if (markAllPast) {
        await api.markAllOrdersPaidSilently(personId);
      } else {
        await api.markOrderPaid(orderId, personId);
      }
      
      const diff = markAllPast ? paidAmount : paidAmount - orderTotal;
      if (Math.abs(diff) > 0.001 || (markAllPast && paidAmount !== 0)) {
        const dateStr = getLocalDateString(targetDate);
        await api.changeBalance(personId, markAllPast ? paidAmount : diff, t('run.paymentAdjustment', { date: dateStr }));
      }
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('run.failedMarkPaid'));
    }
  };

  const handleCopyRun = async () => {
    let text = `🛒 RUN SUMMARY: ${formatDateLabel(targetDate, t, t('modals.daysShort'))}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `🛍️ SHOPPING LIST\n`;
    Object.entries(aggregatedItems).forEach(([timingKey, sources]) => {
      if (settings.groupByFreshness && timingKey !== '_all') {
        text += `\n[ ${timingKey.toUpperCase()} ]\n`;
      }
      Object.entries(sources).forEach(([source, itemsList]) => {
        text += `\n📍 ${source}:\n`;
        itemsList.forEach(ag => {
          text += `  - ${ag.totalQuantity}x ${ag.item.name}`;
          if (ag.totalCost > 0) text += ` ($${ag.totalCost.toFixed(2)})`;
          else text += ` (Price TBD)`;
          text += `\n`;
        });
      });
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `🚚 DELIVERIES & PAYMENTS\n`;
    peopleOrders.forEach(group => {
      text += `\n📍 ${group.location}\n`;
      group.orders.forEach(po => {
        text += `  👤 ${po.person.name}:\n`;
        po.items.forEach(i => {
          const cost = i.unitPrice !== null ? `$${(i.unitPrice * i.quantity).toFixed(2)}` : 'TBD';
          text += `    • ${i.quantity}x ${i.itemDef?.name} - ${cost} ${i.isPaid ? '✅' : '❌'}\n`;
        });
        text += `    Total: $${po.totalCost.toFixed(2)}${po.hasUnknownPriceItems ? ' + TBD' : ''}\n`;
        
        let balText = '';
        if (po.person.balance < 0) balText = `You are owed: $${Math.abs(po.person.balance).toFixed(2)}`;
        else if (po.person.balance > 0) balText = `You owe them: $${po.person.balance.toFixed(2)}`;
        else balText = po.hasUnknownPriceItems ? 'Awaiting Prices' : 'Settled';
        
        text += `    Balance: ${balText}\n`;
      });
    });

    await Clipboard.setStringAsync(text);
    Alert.alert(t('run.copiedTitle'), t('run.copiedMsg'));
  };

  const handleDeleteOrder = (orderId: string, personName: string, isPaid: boolean) => {
    if (isPaid) {
      Alert.alert(
        t('run.deleteOrderTitle'),
        t('run.deletePaidOrderConfirm', { name: personName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('run.deleteOrderCashReturned'),
            style: 'destructive',
            onPress: async () => {
              try {
                await api.deleteOrder(orderId, true); // true = revertCash
              } catch (e) {
                console.error(e);
                Alert.alert(t('common.error'), t('run.failedDelete'));
              }
            },
          },
          {
            text: t('run.deleteOrderKeepCredit'),
            onPress: async () => {
              try {
                await api.deleteOrder(orderId, false); // false = keep credit
              } catch (e) {
                console.error(e);
                Alert.alert(t('common.error'), t('run.failedDelete'));
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        t('run.deleteOrderTitle'),
        t('run.deleteOrderConfirm', { name: personName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              try {
                await api.deleteOrder(orderId);
              } catch (e) {
                console.error(e);
                Alert.alert(t('common.error'), t('run.failedDelete'));
              }
            },
          },
        ]
      );
    }
  };
  
  const handleEditOrder = (order: any, person: any) => {
    router.push({
      pathname: '/add-order',
      params: { 
        personId: person.id, 
        date: order.targetDate,
        edit: Date.now().toString()
      }
    });
  };

  const getSourceTotal = (itemsList: { totalCost: number }[]) => {
    return itemsList.reduce((sum, ag) => sum + ag.totalCost, 0);
  };

  const toggleSourceCollapse = (sourceKey: string) => {
    setCollapsedSources(prev => ({ ...prev, [sourceKey]: !prev[sourceKey] }));
  };

  const toggleLocationCollapse = (locKey: string) => {
    setCollapsedLocations(prev => ({ ...prev, [locKey]: !prev[locKey] }));
  };

  const toggleOrderSelection = (orderId: string) => {
    const next = new Set(selectedOrders);
    if (next.has(orderId)) {
      next.delete(orderId);
      if (next.size === 0) setSelectionMode(false);
    } else {
      next.add(orderId);
    }
    setSelectedOrders(next);
  };

  const handleDeleteSelected = () => {
    Alert.alert(
      t('run.deleteSelectedTitle'),
      t('run.deleteSelectedBody', { count: selectedOrders.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              for (const orderId of Array.from(selectedOrders)) {
                await api.deleteOrder(orderId);
              }
              setSelectionMode(false);
              setSelectedOrders(new Set());
            } catch (e) {
              console.error(e);
              Alert.alert(t('common.error'), t('run.failedDelete'));
            }
          },
        },
      ]
    );
  };

  const handleMoveSelected = async (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowMoveDatePicker(false);
    if (selectedDate && event.type === 'set') {
      try {
        const newDateStr = getLocalDateString(selectedDate);
        await api.moveOrdersToDate(Array.from(selectedOrders), newDateStr);
        setSelectionMode(false);
        setSelectedOrders(new Set());
        Alert.alert(t('common.success'), t('run.movedOrders', { count: selectedOrders.size, date: formatDateLabel(selectedDate, t, t('modals.daysShort')) }));
      } catch (e) {
        console.error(e);
        Alert.alert(t('common.error'), t('run.failedMove'));
      }
    }
  };

  const handlePrevDay = () => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - 1);
    setTargetDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() + 1);
    setTargetDate(d);
  };

  const hasItems = Object.keys(aggregatedItems).length > 0 &&
    Object.values(aggregatedItems).some(sources => Object.keys(sources).length > 0);

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setTargetDate(selectedDate);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.header, settings.compactMode && styles.headerCompact, { zIndex: 10 }]}>
        {!selectionMode ? (
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, settings.compactMode && styles.textSmall]}>{t('run.runLabel')}</Text>
            <View style={styles.dateNavRow}>
              <TouchableOpacity onPress={handlePrevDay} style={[styles.navBtn, settings.compactMode && styles.paddingSmall]}>
                <FontAwesome name={I18nManager.isRTL ? "chevron-right" : "chevron-left"} size={settings.compactMode ? 14 : 16} color="#888" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.dateDisplay, settings.compactMode && styles.dateDisplayCompact]}>
                <Text style={[styles.dateDisplayText, settings.compactMode && styles.textSmall]}>{formatDateLabel(targetDate, t, t('modals.daysShort'))}</Text>
                <FontAwesome name="calendar" size={settings.compactMode ? 14 : 16} color="#2f95dc" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNextDay} style={[styles.navBtn, settings.compactMode && styles.paddingSmall]}>
                <FontAwesome name={I18nManager.isRTL ? "chevron-left" : "chevron-right"} size={settings.compactMode ? 14 : 16} color="#888" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedOrders(new Set()); }} style={[styles.copyBtn, settings.compactMode && styles.paddingSmall]}>
              <FontAwesome name="times" size={settings.compactMode ? 18 : 20} color="#888" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, settings.compactMode && styles.textSmall]}>{selectedOrders.size} {t('run.selected')}</Text>
            <TouchableOpacity onPress={() => setShowMoveDatePicker(true)} style={[styles.copyBtn, { marginStart: 10 }, settings.compactMode && styles.paddingSmall]}>
              <FontAwesome name="calendar" size={settings.compactMode ? 18 : 20} color="#2f95dc" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteSelected} style={[styles.copyBtn, settings.compactMode && styles.paddingSmall]}>
              <FontAwesome name="trash" size={settings.compactMode ? 18 : 20} color="#ff4444" />
            </TouchableOpacity>
          </View>
        )}
        {!selectionMode && (
          <TouchableOpacity onPress={handleCopyRun} style={[styles.copyBtn, settings.compactMode && styles.paddingSmall]}>
            <FontAwesome name="copy" size={settings.compactMode ? 18 : 20} color="#2f95dc" />
          </TouchableOpacity>
        )}
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={targetDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {showMoveDatePicker && (
        <DateTimePicker
          value={targetDate}
          mode="date"
          display="default"
          onChange={handleMoveSelected}
        />
      )}

      <ScrollView 
        style={[styles.content, settings.compactMode && styles.contentCompact]}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {isSearching && (
          <TouchableOpacity 
            style={[styles.exitSearchBtn, settings.compactMode && styles.exitSearchBtnCompact]} 
            onPress={() => { 
              setIsSearching(false); 
              setSearchQuery(''); 
              Keyboard.dismiss();
            }}
          >
            <FontAwesome name={I18nManager.isRTL ? "chevron-right" : "chevron-left"} size={settings.compactMode ? 12 : 14} color="#2f95dc" />
            <Text style={[styles.exitSearchText, settings.compactMode && styles.textSmall]}>{t('run.exitSearch')}</Text>
          </TouchableOpacity>
        )}

        {!isSearching && (
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, settings.compactMode && styles.sectionTitleCompact]}>{t('run.shoppingList')}</Text>
            {listTotal > 0 && (
              <Text style={[styles.sectionTotal, settings.compactMode && styles.textSmall]}>{t('run.total')} ${listTotal.toFixed(2)}</Text>
            )}
          </View>
        )}

        {!isSearching && Object.entries(aggregatedItems).map(([timingKey, sources]) => (
          <View key={timingKey} style={styles.timingGroup}>
            {settings.groupByFreshness && timingKey !== '_all' && (
              <Text style={[styles.timingTitle, settings.compactMode && styles.timingTitleCompact]}>{timingKey}</Text>
            )}
            {Object.entries(sources).map(([source, itemsList]) => {
              const sourceTotal = getSourceTotal(itemsList);
              const sourceKey = `${timingKey}-${source}`;
              const isCollapsed = collapsedSources[sourceKey];
              
              return (
                <View key={source} style={[styles.sourceGroup, settings.compactMode && styles.sourceGroupCompact]}>
                  <TouchableOpacity 
                    style={[styles.sourceHeader, settings.compactMode && styles.sourceHeaderCompact]} 
                    onPress={() => toggleSourceCollapse(sourceKey)}
                    activeOpacity={0.7}>
                    <View style={[styles.sourceTitleRow, { flex: 1 }]}>
                      <FontAwesome 
                        name={isCollapsed ? 'caret-right' : 'caret-down'} 
                        size={settings.compactMode ? 14 : 16} 
                        color="#888" 
                        style={{ width: 15 }} 
                      />
                      <Text 
                        numberOfLines={1} 
                        ellipsizeMode="tail" 
                        style={[styles.sourceTitle, settings.compactMode && styles.textSmall, { flex: 1 }]}>
                        📍 {source}
                      </Text>
                    </View>
                    <Text style={[styles.sourceCost, settings.compactMode && styles.textSmall]}>${sourceTotal.toFixed(2)}</Text>
                  </TouchableOpacity>
                  
                  {!isCollapsed && itemsList.map((ag) => (
                    <TouchableOpacity
                      key={ag.item.id}
                      style={[styles.itemRow, settings.compactMode && styles.itemRowCompact]}
                      onPress={() => toggleCheck(ag.item.id)}>
                      <FontAwesome
                        name={checkedItems[ag.item.id] ? 'check-square-o' : 'square-o'}
                        size={settings.compactMode ? 20 : 24}
                        color={checkedItems[ag.item.id] ? '#28a745' : '#ccc'}
                      />
                      <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', gap: 8, overflow: 'hidden' }}>
                        <View style={[styles.quantityBadge, settings.compactMode && styles.quantityBadgeCompact, checkedItems[ag.item.id] && styles.quantityBadgeCrossed]}>
                          <Text style={[styles.quantityText, settings.compactMode && styles.quantityTextCompact, checkedItems[ag.item.id] && styles.quantityTextCrossed]}>
                            {ag.totalQuantity}x
                          </Text>
                        </View>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[
                            styles.itemText,
                            settings.compactMode && styles.itemTextCompact,
                            checkedItems[ag.item.id] && styles.itemTextCrossed,
                            { flexShrink: 1, marginStart: 0 }
                          ]}>
                          {isRTL ? '\u200F' : ''}{ag.item.name}
                        </Text>
                      </View>
                      {ag.totalCost > 0 && (
                        <Text style={[
                          styles.itemPrice,
                          settings.compactMode && styles.textSmall,
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

        {!isSearching && <View style={styles.separator} />}

        <View style={[styles.deliveriesHeader, settings.compactMode && styles.deliveriesHeaderCompact]}>
          <Text style={[styles.sectionTitle, settings.compactMode && styles.sectionTitleCompact]}>{t('run.deliveries')}</Text>
          <TextInput
            style={[styles.searchInput, settings.compactMode && styles.searchInputCompact]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearching(true)}
            onBlur={() => { if (!searchQuery) setIsSearching(false); }}
            placeholder={t('run.searchPerson')}
            placeholderTextColor="#888"
          />
        </View>

        {peopleOrders.map((group) => {
          const q = searchQuery.toLowerCase().trim();
          const filteredOrders = !q ? group.orders : group.orders.filter(po => {
            const itemNames = po.items.map(i => i.itemDef?.name || '').join(' ');
            const searchString = [
              po.person.name,
              po.deliveryPlace,
              itemNames,
              po.totalCost.toFixed(2)
            ].join(' ').toLowerCase();
            return searchString.includes(q);
          });

          if (filteredOrders.length === 0) return null;

          const isCollapsed = collapsedLocations[group.location];
          return (
            <View key={group.location} style={[styles.locationGroup, settings.compactMode && styles.locationGroupCompact]}>
              <TouchableOpacity 
                style={[styles.locationHeaderRow, settings.compactMode && styles.locationHeaderRowCompact]} 
                onPress={() => toggleLocationCollapse(group.location)}
                activeOpacity={0.7}>
                <FontAwesome 
                  name={isCollapsed ? 'caret-right' : 'caret-down'} 
                  size={settings.compactMode ? 16 : 20} 
                  color="#8bb8e8" 
                  style={{ width: 20 }} 
                />
                <Text 
                  numberOfLines={1} 
                  ellipsizeMode="tail" 
                  style={[styles.deliveryLocationTitle, settings.compactMode && styles.deliveryLocationTitleCompact, { flex: 1 }]}>
                  📍 {group.location}
                </Text>
              </TouchableOpacity>

              {!isCollapsed && filteredOrders.map((po) => (
                <View key={po.person.id} style={[styles.personCard, settings.compactMode && styles.personCardCompact, selectionMode && selectedOrders.has(po.order.id) && { borderColor: '#2f95dc', borderWidth: 1 }]}>
                  <TouchableOpacity 
                    activeOpacity={0.8}
                    onLongPress={() => {
                      if (!selectionMode) {
                        setSelectionMode(true);
                        setSelectedOrders(new Set([po.order.id]));
                      }
                    }}
                    onPress={() => {
                      if (selectionMode) {
                        toggleOrderSelection(po.order.id);
                      }
                    }}
                    style={[styles.personHeader, settings.compactMode && styles.personHeaderCompact, selectionMode && selectedOrders.has(po.order.id) && { backgroundColor: 'rgba(47, 149, 220, 0.15)' }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      {selectionMode && (
                        <FontAwesome 
                          name={selectedOrders.has(po.order.id) ? 'check-square-o' : 'square-o'} 
                          size={settings.compactMode ? 20 : 24} 
                          color={selectedOrders.has(po.order.id) ? '#2f95dc' : '#888'} 
                          style={{ marginEnd: 10 }} 
                        />
                      )}
                      <View style={{ flex: 1, alignItems: 'flex-start', overflow: 'hidden', paddingEnd: 8 }}>
                        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.personName, settings.compactMode && styles.personNameCompact, { textAlign: I18nManager.isRTL ? 'right' : 'left' }]}>{po.person.name}</Text>
                        {po.deliveryPlace ? (
                          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.deliveryPlace, settings.compactMode && styles.textExtraSmall, { textAlign: I18nManager.isRTL ? 'right' : 'left' }]}>📍 {po.deliveryPlace}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.costInfo}>
                      <View style={styles.orderActions}>
                        {!selectionMode && (
                          <View style={{ flexDirection: 'row', gap: 15 }}>
                            <TouchableOpacity onPress={() => handleEditOrder(po.order, po.person)} style={styles.editOrderBtn}>
                              <FontAwesome name="edit" size={settings.compactMode ? 14 : 16} color="#2f95dc" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteOrder(po.order.id, po.person.name, po.order.isPaid)} style={styles.deleteOrderBtn}>
                              <FontAwesome name="trash" size={settings.compactMode ? 14 : 16} color="#ff4444" />
                            </TouchableOpacity>
                          </View>
                        )}
                        <Text style={[styles.personTotal, settings.compactMode && styles.personTotalCompact]}>
                          ${po.totalCost.toFixed(2)}{po.hasUnknownPriceItems ? ` + ${t('common.priceTBD')}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.statusContainer, settings.compactMode && { height: 16 }]}>
                        <Text style={[styles.statusText, po.unpaidCost > 0 ? styles.statusUnpaid : styles.statusPaid, settings.compactMode && styles.textExtraSmall]}>
                          {po.hasUnknownPriceItems ? t('run.statusAwaitingPrices') : po.unpaidCost > 0 ? t('run.statusUnpaid') : t('run.statusPaid')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.personItems}>
                    {po.items.map((i) => {
                      const itemCost = (i.unitPrice ?? 0) * i.quantity;
                      return (
                        <View key={i.id} style={[styles.itemRow2, settings.compactMode && styles.itemRow2Compact]}>
                          {/* Individual item checkbox removed as requested */}
                          <View style={[styles.itemInfo, { alignItems: 'center', flexDirection: 'row', gap: 8, flexShrink: 1, overflow: 'hidden' }]}>
                            <View style={[styles.quantityBadge, settings.compactMode && styles.quantityBadgeCompact, i.isPaid && styles.quantityBadgeCrossed]}>
                              <Text style={[styles.quantityText, settings.compactMode && styles.quantityTextCompact, i.isPaid && styles.quantityTextCrossed]}>
                                {i.quantity}x
                              </Text>
                            </View>
                            <Text 
                              numberOfLines={1} 
                              ellipsizeMode="tail"
                              style={[styles.personItemText, settings.compactMode && styles.textExtraSmall, i.isPaid && styles.personItemPaid, { flexShrink: 1 }]}>
                              {isRTL ? '\u200F' : ''}{i.itemDef?.name}
                            </Text>
                            <View style={{ flex: 1 }} />
                            <View style={[styles.priceBadge, i.isPaid && styles.quantityBadgeCrossed]}>
                              <Text style={[styles.priceText, settings.compactMode && styles.textExtraSmall, i.isPaid && styles.personItemPaid]}>
                                {i.unitPrice === null ? t('common.priceTBD') : `$${itemCost.toFixed(2)}`}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <View style={[styles.personFooter, settings.compactMode && styles.personFooterCompact]}>
                    <View>
                      <View style={styles.balanceHeaderRow}>
                        <Text style={[styles.balanceLabel, settings.compactMode && styles.textExtraSmall, po.person.balance < 0 ? styles.debtLabel : po.person.balance > 0 ? styles.creditLabel : po.hasUnknownPriceItems ? styles.pendingLabel : styles.settledLabel]}>
                          {po.person.balance < 0
                            ? t('run.debtLabel')
                            : po.person.balance > 0
                            ? t('run.creditLabel')
                            : po.hasUnknownPriceItems
                            ? t('run.pendingLabel')
                            : t('run.settledLabel')}
                        </Text>
                        {po.hasUnknownPriceItems && (
                          <TouchableOpacity
                            onPress={() => setUnknownPricePerson({ id: po.person.id, name: po.person.name })}
                            style={[styles.notesBtn, settings.compactMode && styles.paddingSmall]}>
                            <FontAwesome name="exclamation-circle" size={settings.compactMode ? 14 : 18} color="#ff9800" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.balanceValueRow}>
                        <Text style={[po.person.balance < 0 ? styles.debt : po.person.balance > 0 ? styles.credit : po.hasUnknownPriceItems ? styles.pending : styles.settled, settings.compactMode && styles.personTotalCompact]}>
                          ${Math.abs(po.person.balance).toFixed(2)}
                        </Text>
                        <TouchableOpacity 
                          onPress={() => setLogPerson({ id: po.person.id, name: po.person.name })}
                          style={[styles.historyBtn, settings.compactMode && styles.paddingSmall]}
                        >
                          <FontAwesome name="history" size={settings.compactMode ? 14 : 16} color="#2f95dc" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.buttonGroup}>
                      {po.hasUnpaidItems ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.payAmountBtn, settings.compactMode && styles.compactBtn]}
                            onPress={() => setPayAmountOrder({ id: po.order.id, personId: po.person.id, total: po.totalCost, personName: po.person.name })}>
                            <FontAwesome name="money" size={settings.compactMode ? 14 : 16} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.markAllPaidBtn, settings.compactMode && styles.compactBtn]}
                            onPress={() => handleMarkAllPaid(po.order.id, po.person.id)}>
                            <Text style={[styles.markAllPaidText, settings.compactMode && styles.textExtraSmall]}>{t('run.markPaid')}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.markAllUnpaidBtn, settings.compactMode && styles.compactBtn]}
                          onPress={() => handleMarkAllUnpaid(po.order.id, po.person.id)}>
                          <Text style={[styles.markAllUnpaidText, settings.compactMode && styles.textExtraSmall]}>{t('run.revertLastPayment')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        {peopleOrders.length === 0 && !isSearching && (
          <Text style={[styles.emptyText, settings.compactMode && styles.textSmall, { textAlign: 'center', marginTop: 20 }]}>
            {t('run.noDeliveries')}
          </Text>
        )}

        {(() => {
          const q = searchQuery.toLowerCase().trim();
          if (!q) return null;
          const totalFound = peopleOrders.reduce((sum, g) => {
            return sum + g.orders.filter(po => {
              const itemNames = po.items.map(i => i.itemDef?.name || '').join(' ');
              const searchString = [po.person.name, po.deliveryPlace, itemNames, po.totalCost.toFixed(2)].join(' ').toLowerCase();
              return searchString.includes(q);
            }).length;
          }, 0);

          if (totalFound === 0) {
            return (
              <View style={styles.noResultsContainer}>
                <FontAwesome name="search" size={48} color="#444" style={{ marginBottom: 10 }} />
                <Text style={styles.noResultsText}>{t('run.noOrdersFound', { query: searchQuery })}</Text>
              </View>
            );
          }
          return null;
        })()}
      </ScrollView>

      {unknownPricePerson && (
        <UnknownPriceModal
          visible={!!unknownPricePerson}
          personId={unknownPricePerson.id}
          personName={unknownPricePerson.name}
          onClose={() => setUnknownPricePerson(null)}
        />
      )}

      {logPerson && (
        <CreditLogModal
          visible={!!logPerson}
          personId={logPerson.id}
          personName={logPerson.name}
          onClose={() => setLogPerson(null)}
        />
      )}

      {payAmountOrder && (
        <PromptModal
          visible={!!payAmountOrder}
          title={t('run.payAmountTitle')}
          message={t('run.payAmountMsg', { total: payAmountOrder.total.toFixed(2), name: payAmountOrder.personName })}
          defaultValue={payAmountOrder.total.toFixed(2)}
          keyboardType="numeric"
          showToggle={true}
          toggleLabel={t('run.markAllPastAsPaid')}
          onCancel={() => setPayAmountOrder(null)}
          onSubmit={handleCustomPayment}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#222',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 10,
    flex: 1,
  },
  dateDisplayText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  headerTitle: { fontSize: 16, color: '#fff' },
  copyBtn: { padding: 10, marginStart: 5 },
  dateNavRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  navBtn: { padding: 8 },
  content: { padding: 15 },
  deliveriesHeader: {
    marginBottom: 15,
  },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTotal: { fontSize: 18, fontWeight: 'bold', color: '#ffeb3b' },
  searchInput: {
    backgroundColor: '#333',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
    width: '100%',
  },
  locationGroup: { marginBottom: 25 },
  locationHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginStart: 5 },
  deliveryLocationTitle: { fontSize: 18, fontWeight: 'bold', color: '#8bb8e8', marginStart: 5 },
  timingGroup: { marginBottom: 15 },
  timingTitle: { fontSize: 18, fontWeight: 'bold', color: '#2f95dc', marginBottom: 5 },
  sourceGroup: { marginStart: 10, marginBottom: 12 },
  sourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    marginVertical: 15,
  },
  exitSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 15,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  exitSearchBtnCompact: {
    padding: 8,
  },
  exitSearchText: {
    color: '#2f95dc',
    fontWeight: 'bold',
  },
  sourceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sourceTitle: { fontSize: 16, color: '#aaa' },
  sourceCost: { fontSize: 16, fontWeight: 'bold', color: '#ffeb3b' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginStart: 10 },
  itemText: { fontSize: 18, color: '#fff', marginStart: 10 },
  itemPrice: { fontSize: 14, color: '#aaa', marginStart: 8 },
  itemTextCrossed: { textDecorationLine: 'line-through', color: '#666' },
  quantityBadge: { backgroundColor: '#333', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  quantityText: { color: '#ccc', fontWeight: 'bold', fontSize: 14 },
  quantityBadgeCompact: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  quantityTextCompact: { fontSize: 12 },
  quantityBadgeCrossed: { backgroundColor: '#222' },
  quantityTextCrossed: { color: '#666', textDecorationLine: 'line-through' },
  priceBadge: { backgroundColor: '#2a2a2a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  priceText: { color: '#aaa', fontSize: 12 },
  emptyText: { color: '#888', fontStyle: 'italic', marginBottom: 20 },
  separator: { height: 1, backgroundColor: '#444', marginVertical: 20 },
  personCard: { backgroundColor: '#222', padding: 15, borderRadius: 10, marginBottom: 15 },
  personHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  personName: { fontSize: 18, fontWeight: 'bold', color: '#fff', textAlign: I18nManager.isRTL ? 'right' : 'left' },
  personTotal: { fontSize: 18, fontWeight: 'bold', color: '#ffeb3b', textAlign: I18nManager.isRTL ? 'left' : 'right' },
  deliveryPlace: { fontSize: 12, color: '#8bb8e8', marginTop: 2, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  costInfo: { alignItems: 'flex-end', flex: 1 },
  orderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editOrderBtn: { padding: 4 },
  deleteOrderBtn: { padding: 4 },
  statusContainer: { height: 20, justifyContent: 'center' },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  statusUnpaid: { color: '#ff9800' },
  statusPaid: { color: '#28a745' },
  personItems: { marginBottom: 10 },
  itemRow2: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemToggle: { padding: 8 },
  itemInfo: { flex: 1 },
  personItemText: { color: '#ccc', fontSize: 14, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  personItemPaid: { textDecorationLine: 'line-through', color: '#666' },
  personFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#555', paddingTop: 10 },
  balanceHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  balanceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyBtn: { padding: 4 },
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
  buttonGroup: { alignItems: 'flex-end', flex: 1 },
  markAllPaidBtn: { backgroundColor: '#28a745', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5 },
  markAllPaidText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  payAmountBtn: {
    backgroundColor: '#ff9800',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markAllUnpaidBtn: { backgroundColor: '#444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5 },
  markAllUnpaidText: { color: '#ccc', fontWeight: 'bold', fontSize: 13 },
  
  // Compact Modifiers
  headerCompact: { padding: 8 },
  dateDisplayCompact: { paddingVertical: 4, paddingHorizontal: 8 },
  contentCompact: { padding: 8 },
  sectionTitleCompact: { fontSize: 18, marginBottom: 5 },
  timingTitleCompact: { fontSize: 15, marginBottom: 3 },
  sourceGroupCompact: { marginBottom: 8, marginStart: 5 },
  sourceHeaderCompact: { paddingVertical: 2 },
  itemRowCompact: { marginBottom: 4 },
  itemTextCompact: { fontSize: 15 },
  deliveriesHeaderCompact: { marginBottom: 8 },
  searchInputCompact: { paddingVertical: 6, fontSize: 14 },
  locationGroupCompact: { marginBottom: 15 },
  locationHeaderRowCompact: { marginBottom: 6 },
  deliveryLocationTitleCompact: { fontSize: 16 },
  personCardCompact: { padding: 10, marginBottom: 10 },
  personHeaderCompact: { marginBottom: 5 },
  personNameCompact: { fontSize: 15 },
  personTotalCompact: { fontSize: 15 },
  itemRow2Compact: { marginBottom: 2 },
  personFooterCompact: { paddingTop: 6 },
  compactBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  textSmall: { fontSize: 13 },
  textExtraSmall: { fontSize: 11 },
  paddingSmall: { padding: 4 },
  noResultsContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  noResultsText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
});
