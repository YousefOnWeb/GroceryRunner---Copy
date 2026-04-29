import { and, eq, inArray, like, sql } from 'drizzle-orm';
import * as crypto from 'expo-crypto';
import { db } from './index';
import { items, orderItems, orders, personAliases, persons, transactions, itemAliases, placeAliases, sourceAliases } from './schema';

export const generateId = () => crypto.randomUUID();

export const api = {
  addPerson: async (name: string, typicalPlace?: string | null, aliases?: string[]) => {
    const trimmed = name.trim();
    // Check if this name matches an existing person or alias
    const existingByName = await db.select().from(persons).where(sql`lower(name) = lower(${trimmed})`);
    if (existingByName.length > 0) return existingByName;

    const existingByAlias = await db.select({ personId: personAliases.personId })
      .from(personAliases)
      .where(sql`lower(alias) = lower(${trimmed})`);
    if (existingByAlias.length > 0) {
      // The name the user typed is actually an alias — return the real person
      return db.select().from(persons).where(eq(persons.id, existingByAlias[0].personId));
    }

    const personId = generateId();
    const result = await db.insert(persons).values({
      id: personId,
      name: trimmed,
      typicalPlace: typicalPlace?.trim() || null,
    }).returning();

    // Insert aliases if provided
    if (aliases && aliases.length > 0) {
      const aliasValues = aliases
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => ({ id: generateId(), personId, alias: a }));
      if (aliasValues.length > 0) {
        await db.insert(personAliases).values(aliasValues);
      }
    }

    return result;
  },

  updatePerson: async (personId: string, updates: {
    name?: string;
    typicalPlace?: string | null;
    aliases?: string[];
  }) => {
    const setValues: any = {};
    if (updates.name !== undefined) setValues.name = updates.name.trim();
    if (updates.typicalPlace !== undefined) setValues.typicalPlace = updates.typicalPlace?.trim() || null;

    if (Object.keys(setValues).length > 0) {
      await db.update(persons).set(setValues).where(eq(persons.id, personId));
    }

    // Replace aliases if provided
    if (updates.aliases !== undefined) {
      await db.delete(personAliases).where(eq(personAliases.personId, personId));
      const aliasValues = updates.aliases
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => ({ id: generateId(), personId, alias: a }));
      if (aliasValues.length > 0) {
        await db.insert(personAliases).values(aliasValues);
      }
    }
  },

  getPersonAliases: async (personId: string): Promise<string[]> => {
    const rows = await db.select({ alias: personAliases.alias })
      .from(personAliases)
      .where(eq(personAliases.personId, personId));
    return rows.map(r => r.alias);
  },

  getItemAliases: async (itemId: string): Promise<string[]> => {
    const rows = await db.select({ alias: itemAliases.alias }).from(itemAliases).where(eq(itemAliases.itemId, itemId));
    return rows.map(r => r.alias);
  },

  getPlaceAliases: async (placeName: string): Promise<string[]> => {
    const rows = await db.select({ alias: placeAliases.alias }).from(placeAliases).where(eq(placeAliases.placeName, placeName));
    return rows.map(r => r.alias);
  },

  getSourceAliases: async (sourceName: string): Promise<string[]> => {
    const rows = await db.select({ alias: sourceAliases.alias }).from(sourceAliases).where(eq(sourceAliases.sourceName, sourceName));
    return rows.map(r => r.alias);
  },

  /** Search persons by name or alias. Returns matched persons (deduplicated). */
  searchPersons: async (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Search by name
    const byName = await db.select().from(persons)
      .where(sql`lower(name) LIKE ${'%' + q + '%'}`);

    // Search by alias
    const byAlias = await db.select({ personId: personAliases.personId })
      .from(personAliases)
      .where(sql`lower(alias) LIKE ${'%' + q + '%'}`);

    const aliasPersonIds = byAlias.map(r => r.personId);
    const matchedByNameIds = new Set(byName.map(p => p.id));

    // Fetch persons matched by alias that aren't already in byName results
    const extraIds = aliasPersonIds.filter(id => !matchedByNameIds.has(id));
    let extraPersons: typeof byName = [];
    if (extraIds.length > 0) {
      extraPersons = await db.select().from(persons).where(inArray(persons.id, extraIds));
    }

    return [...byName, ...extraPersons];
  },

  /** Resolve a typed name: check persons.name first, then aliases. Returns the person or null. */
  resolvePersonByNameOrAlias: async (input: string) => {
    const trimmed = input.trim();
    const byName = await db.select().from(persons).where(sql`lower(name) = lower(${trimmed})`);
    if (byName.length > 0) return byName[0];

    const byAlias = await db.select({ personId: personAliases.personId })
      .from(personAliases)
      .where(sql`lower(alias) = lower(${trimmed})`);
    if (byAlias.length > 0) {
      const person = await db.select().from(persons).where(eq(persons.id, byAlias[0].personId));
      return person.length > 0 ? person[0] : null;
    }

    return null;
  },

  resolvePlaceByNameOrAlias: async (input: string) => {
    if (!input) return null;
    const trimmed = input.trim();
    const byAlias = await db.select({ placeName: placeAliases.placeName })
      .from(placeAliases)
      .where(sql`lower(alias) = lower(${trimmed})`);
    if (byAlias.length > 0) return byAlias[0].placeName;
    return trimmed;
  },

  resolveSourceByNameOrAlias: async (input: string) => {
    if (!input) return null;
    const trimmed = input.trim();
    const byAlias = await db.select({ sourceName: sourceAliases.sourceName })
      .from(sourceAliases)
      .where(sql`lower(alias) = lower(${trimmed})`);
    if (byAlias.length > 0) return byAlias[0].sourceName;
    return trimmed;
  },
  
  addItem: async (name: string, defaultPrice: number | null, source: string | null, timing: 'Fresh' | 'Anytime', aliases?: string[]) => {
    const trimmed = name.trim();
    const existing = await db.select().from(items).where(sql`lower(name) = lower(${trimmed})`);
    if (existing.length > 0) return existing;
    
    let finalSource = source ? await api.resolveSourceByNameOrAlias(source) : null;

    const result = await db.insert(items).values({ id: generateId(), name: trimmed, defaultPrice, source: finalSource, timing }).returning();
    
    if (aliases && aliases.length > 0) {
      const aliasValues = aliases
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => ({ id: generateId(), itemId: result[0].id, alias: a }));
      if (aliasValues.length > 0) {
        await db.insert(itemAliases).values(aliasValues);
      }
    }
    
    return result;
  },
  
  createOrder: async (personId: string, targetDate: string, orderLines: { itemId: string, quantity: number, unitPrice: number | null }[], deliveryPlace?: string | null) => {
    const orderId = generateId();
    let totalCost = 0;
    
    const linesToInsert = orderLines.map(line => {
      const cost = line.quantity * (line.unitPrice || 0);
      totalCost += cost;
      return {
        id: generateId(),
        orderId,
        itemId: line.itemId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        isPaid: false,
      };
    });

    let finalPlace = deliveryPlace ? await api.resolvePlaceByNameOrAlias(deliveryPlace) : null;

    await db.insert(orders).values({
      id: orderId,
      personId,
      targetDate,
      isPaid: false,
      deliveryPlace: finalPlace,
    });
    
    if (linesToInsert.length > 0) {
      await db.insert(orderItems).values(linesToInsert);
    }

    if (totalCost > 0) {
      await db.update(persons)
        .set({ balance: sql`${persons.balance} - ${totalCost}` })
        .where(eq(persons.id, personId));

      await db.insert(transactions).values({
        id: generateId(),
        personId,
        amount: -totalCost,
        date: new Date().toISOString(),
        type: 'OrderCost',
        note: `Order for ${targetDate}`,
      });
    }
  },

  updateOrder: async (orderId: string, personId: string, newOrderLines: { itemId: string, quantity: number, unitPrice: number | null }[], deliveryPlace?: string | null) => {
    // Fetch targetDate for note
    const orderInfo = await db.select({ date: orders.targetDate }).from(orders).where(eq(orders.id, orderId));
    const targetDate = orderInfo.length > 0 ? orderInfo[0].date : '';

    // 1. Fetch old unpaid items to revert their debt
    const oldItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let oldUnpaidCost = 0;
    oldItems.forEach(oi => {
      if (!oi.isPaid) {
        oldUnpaidCost += (oi.quantity * (oi.unitPrice || 0));
      }
    });

    // Revert old unpaid debt (increase balance)
    if (oldUnpaidCost > 0) {
      await db.update(persons)
        .set({ balance: sql`${persons.balance} + ${oldUnpaidCost}` })
        .where(eq(persons.id, personId));
    }

    // 2. Delete old items
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));

    // 3. Insert new items (all unpaid) and calculate new cost
    let newTotalCost = 0;
    const linesToInsert = newOrderLines.map(line => {
      const cost = line.quantity * (line.unitPrice || 0);
      newTotalCost += cost;
      return {
        id: generateId(),
        orderId,
        itemId: line.itemId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        isPaid: false,
      };
    });

    if (linesToInsert.length > 0) {
      await db.insert(orderItems).values(linesToInsert);
    }

    // Apply new debt (decrease balance)
    if (newTotalCost > 0) {
      await db.update(persons)
        .set({ balance: sql`${persons.balance} - ${newTotalCost}` })
        .where(eq(persons.id, personId));
    }

    // Replace old order logs with a single clean one
    await db.delete(transactions).where(and(
      eq(transactions.personId, personId),
      eq(transactions.type, 'OrderCost'),
      like(transactions.note, `%${targetDate}%`)
    ));

    if (newTotalCost > 0) {
      await db.insert(transactions).values({
        id: generateId(),
        personId,
        amount: -newTotalCost,
        date: new Date().toISOString(),
        type: 'OrderCost',
        note: `Order for ${targetDate}`,
      });
    }
    
    // Update deliveryPlace and set order to unpaid
    const orderUpdates: any = { isPaid: false };
    if (deliveryPlace !== undefined) {
      orderUpdates.deliveryPlace = deliveryPlace ? await api.resolvePlaceByNameOrAlias(deliveryPlace) : null;
    }
    await db.update(orders).set(orderUpdates).where(eq(orders.id, orderId));
  },

  markItemPaid: async (itemId: string, personId: string, cost: number) => {
    // Fetch item name for note
    const itemInfo = await db.select({ name: items.name, qty: orderItems.quantity })
      .from(orderItems)
      .innerJoin(items, eq(orderItems.itemId, items.id))
      .where(eq(orderItems.id, itemId));
    const itemName = itemInfo.length > 0 ? `${itemInfo[0].qty}x ${itemInfo[0].name}` : 'Item';

    await db.update(orderItems).set({ isPaid: true }).where(eq(orderItems.id, itemId));
    if (cost > 0) {
      await db.update(persons)
        .set({ balance: sql`${persons.balance} + ${cost}` })
        .where(eq(persons.id, personId));
        
      await db.insert(transactions).values({
        id: generateId(),
        personId,
        amount: cost,
        date: new Date().toISOString(),
        type: 'PaymentReceived',
        note: `Paid: ${itemName}`,
      });
    }
  },

  markItemUnpaid: async (itemId: string, personId: string, cost: number) => {
    // 1. Fetch item name to match the note
    const itemInfo = await db.select({ name: items.name, qty: orderItems.quantity })
      .from(orderItems)
      .innerJoin(items, eq(orderItems.itemId, items.id))
      .where(eq(orderItems.id, itemId));
    const itemName = itemInfo.length > 0 ? `${itemInfo[0].qty}x ${itemInfo[0].name}` : 'Item';
    const targetNote = `Paid: ${itemName}`;

    // 2. Revert the balance (decrease it back)
    await db.update(orderItems).set({ isPaid: false }).where(eq(orderItems.id, itemId));
    if (cost > 0) {
      await db.update(persons)
        .set({ balance: sql`${persons.balance} - ${cost}` })
        .where(eq(persons.id, personId));
        
      // 3. Find and delete the most recent "Paid" transaction for this item
      const recentTx = await db.select({ id: transactions.id })
        .from(transactions)
        .where(and(
          eq(transactions.personId, personId),
          eq(transactions.type, 'PaymentReceived'),
          eq(transactions.note, targetNote)
        ))
        .orderBy(sql`${transactions.date} DESC`)
        .limit(1);

      if (recentTx.length > 0) {
        await db.delete(transactions).where(eq(transactions.id, recentTx[0].id));
      }
    }
  },

  markAllPaid: async (orderId: string, personId: string) => {
    const itemsToPay = await db.select().from(orderItems).where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.isPaid, false))
    );
    
    const orderInfo = await db.select({ date: orders.targetDate }).from(orders).where(eq(orders.id, orderId));
    const orderDate = orderInfo.length > 0 ? orderInfo[0].date : '';

    let totalUnpaidCost = 0;
    const idsToUpdate: string[] = [];
    
    itemsToPay.forEach(oi => {
      totalUnpaidCost += (oi.quantity * (oi.unitPrice || 0));
      idsToUpdate.push(oi.id);
    });

    if (idsToUpdate.length > 0) {
      await db.update(orderItems).set({ isPaid: true }).where(inArray(orderItems.id, idsToUpdate));
      await db.update(orders).set({ isPaid: true }).where(eq(orders.id, orderId));

      if (totalUnpaidCost > 0) {
        await db.update(persons)
          .set({ balance: sql`${persons.balance} + ${totalUnpaidCost}` })
          .where(eq(persons.id, personId));
          
        await db.insert(transactions).values({
          id: generateId(),
          personId,
          amount: totalUnpaidCost,
          date: new Date().toISOString(),
          type: 'PaymentReceived',
          note: `Settled entire order from ${orderDate}`,
        });
      }
    }
  },

  markOrderPaid: async (orderId: string, personId: string) => {
    return api.markAllPaid(orderId, personId);
  },

  markOrderUnpaid: async (orderId: string, personId: string) => {
    const itemsInOrder = await db.select().from(orderItems).where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.isPaid, true))
    );
    
    const orderInfo = await db.select({ date: orders.targetDate }).from(orders).where(eq(orders.id, orderId));
    const orderDate = orderInfo.length > 0 ? orderInfo[0].date : '';
    const targetNote = `Settled entire order from ${orderDate}`;

    let totalPaidCost = 0;
    const idsToUpdate: string[] = [];
    
    itemsInOrder.forEach(oi => {
      totalPaidCost += (oi.quantity * (oi.unitPrice || 0));
      idsToUpdate.push(oi.id);
    });

    if (idsToUpdate.length > 0) {
      await db.update(orderItems).set({ isPaid: false }).where(inArray(orderItems.id, idsToUpdate));
      await db.update(orders).set({ isPaid: false }).where(eq(orders.id, orderId));

      if (totalPaidCost > 0) {
        await db.update(persons)
          .set({ balance: sql`${persons.balance} - ${totalPaidCost}` })
          .where(eq(persons.id, personId));
          
        // Find and delete the most recent "Settled" transaction for this order
        const recentTx = await db.select({ id: transactions.id })
          .from(transactions)
          .where(and(
            eq(transactions.personId, personId),
            eq(transactions.type, 'PaymentReceived'),
            eq(transactions.note, targetNote)
          ))
          .orderBy(sql`${transactions.date} DESC`)
          .limit(1);

        if (recentTx.length > 0) {
          await db.delete(transactions).where(eq(transactions.id, recentTx[0].id));
        }
      }
    }
  },

  changeBalance: async (personId: string, amount: number, note: string) => {
    await db.update(persons)
      .set({ balance: sql`${persons.balance} + ${amount}` })
      .where(eq(persons.id, personId));
      
    await db.insert(transactions).values({
      id: generateId(),
      personId,
      amount,
      date: new Date().toISOString(),
      type: 'ManualAdjustment',
      note: note.trim(),
    });
  },

  settleBalance: async (personId: string, amount: number, note: string) => {
    return api.changeBalance(personId, amount, note);
  },
  
  updateItem: async (id: string, updates: Partial<{ name: string; defaultPrice: number | null; source: string | null; timing: 'Fresh' | 'Anytime', aliases: string[] }>, isCorrection: boolean = false) => {
    let finalSource = updates.source !== undefined ? (updates.source ? await api.resolveSourceByNameOrAlias(updates.source) : null) : undefined;
    
    const { aliases, ...itemUpdates } = updates;
    const finalUpdates: any = { ...itemUpdates };
    
    if (finalSource !== undefined) finalUpdates.source = finalSource;
    if (updates.name) finalUpdates.name = updates.name.trim();

    // Fetch name for log before update
    const oldItem = await db.select({ name: items.name }).from(items).where(eq(items.id, id));
    const itemName = oldItem.length > 0 ? oldItem[0].name : 'Item';

    if (Object.keys(finalUpdates).length > 0) {
      await db.update(items).set(finalUpdates).where(eq(items.id, id));
    }

    if (aliases !== undefined) {
      await db.delete(itemAliases).where(eq(itemAliases.itemId, id));
      const aliasValues = aliases
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => ({ id: generateId(), itemId: id, alias: a }));
      if (aliasValues.length > 0) {
        await db.insert(itemAliases).values(aliasValues);
      }
    }

    if (updates.defaultPrice !== undefined) {
      const newPrice = updates.defaultPrice;
      
      if (isCorrection && newPrice !== null) {
        const allInstances = await db.select({
          oiId: orderItems.id,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          personId: orders.personId,
          orderId: orders.id,
          isPaid: orderItems.isPaid,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(eq(orderItems.itemId, id));

        for (const item of allInstances) {
          const oldPrice = item.unitPrice ?? 0;
          const diff = (newPrice - oldPrice) * item.quantity;

          if (diff !== 0) {
            await db.update(orderItems)
              .set({ unitPrice: newPrice })
              .where(eq(orderItems.id, item.oiId));

            await db.update(persons)
              .set({ balance: sql`${persons.balance} - ${diff}` })
              .where(eq(persons.id, item.personId));

            await db.insert(transactions).values({
              id: generateId(),
              personId: item.personId,
              amount: -diff,
              date: new Date().toISOString(),
              type: 'ManualAdjustment',
              note: `Price correction for ${itemName}: $${oldPrice} -> $${newPrice}`,
            });
          }
        }
      } else if (newPrice !== null) {
        const pendingItems = await db.select({
          oiId: orderItems.id,
          quantity: orderItems.quantity,
          personId: orders.personId,
          orderId: orders.id,
          isPaid: orderItems.isPaid,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orderItems.itemId, id),
          sql`${orderItems.unitPrice} IS NULL`
        ));

        for (const item of pendingItems) {
          const addedDebt = item.quantity * newPrice;
          
          await db.update(orderItems)
            .set({ unitPrice: newPrice })
            .where(eq(orderItems.id, item.oiId));

          if (!item.isPaid) {
            await db.update(persons)
              .set({ balance: sql`${persons.balance} - ${addedDebt}` })
              .where(eq(persons.id, item.personId));

            await db.insert(transactions).values({
              id: generateId(),
              personId: item.personId,
              amount: -addedDebt,
              date: new Date().toISOString(),
              type: 'OrderCost',
              note: `Price finalized for ${itemName}`,
            });
          }
        }
      }
    }
  },

  getTransactionsForPerson: async (personId: string) => {
    return db.select().from(transactions).where(eq(transactions.personId, personId)).orderBy(sql`${transactions.date} DESC`);
  },

  getUnpaidUnknownPriceItems: async (personId: string) => {
    const rows = await db.select({
      itemName: items.name,
      quantity: orderItems.quantity,
      orderDate: orders.targetDate,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(items, eq(orderItems.itemId, items.id))
    .where(and(
      eq(orders.personId, personId),
      eq(orderItems.isPaid, false),
      sql`${orderItems.unitPrice} IS NULL`
    ));
    return rows;
  },

  getDistinctSources: async () => {
    const res = await db.selectDistinct({ source: items.source }).from(items);
    const aliasRes = await db.selectDistinct({ alias: sourceAliases.alias }).from(sourceAliases);
    
    const all = new Set([
      ...res.map(r => r.source).filter((s): s is string => s !== null && s.trim() !== ''),
      ...aliasRes.map(r => r.alias).filter((s): s is string => s !== null && s.trim() !== '')
    ]);
    return Array.from(all);
  },

  getDistinctPlaces: async (): Promise<string[]> => {
    const personPlaces = await db
      .selectDistinct({ place: persons.typicalPlace })
      .from(persons)
      .where(sql`${persons.typicalPlace} IS NOT NULL AND ${persons.typicalPlace} != ''`);
    
    const orderPlaces = await db
      .selectDistinct({ place: orders.deliveryPlace })
      .from(orders)
      .where(sql`${orders.deliveryPlace} IS NOT NULL AND ${orders.deliveryPlace} != ''`);

    const aliasPlaces = await db
      .selectDistinct({ alias: placeAliases.alias })
      .from(placeAliases);

    const all = new Set([
      ...personPlaces.map(r => r.place).filter((s): s is string => s !== null),
      ...orderPlaces.map(r => r.place).filter((s): s is string => s !== null),
      ...aliasPlaces.map(r => r.alias).filter((s): s is string => s !== null),
    ]);
    
    return Array.from(all);
  },

  deletePerson: async (id: string) => {
    await db.delete(transactions).where(eq(transactions.personId, id));
    const personOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.personId, id));
    for (const order of personOrders) {
      await api.deleteOrder(order.id);
    }
    await db.delete(persons).where(eq(persons.id, id));
  },

  deleteItem: async (id: string) => {
    await db.delete(itemAliases).where(eq(itemAliases.itemId, id));
    await db.delete(items).where(eq(items.id, id));
  },

  updatePlace: async (oldName: string, newName: string, aliases?: string[]) => {
    await db.update(persons).set({ typicalPlace: newName }).where(eq(persons.typicalPlace, oldName));
    await db.update(orders).set({ deliveryPlace: newName }).where(eq(orders.deliveryPlace, oldName));
    await db.update(placeAliases).set({ placeName: newName }).where(eq(placeAliases.placeName, oldName));

    if (aliases !== undefined) {
      await db.delete(placeAliases).where(eq(placeAliases.placeName, newName));
      const aliasValues = aliases
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => ({ id: generateId(), placeName: newName, alias: a }));
      if (aliasValues.length > 0) {
        await db.insert(placeAliases).values(aliasValues);
      }
    }
  },

  updateSource: async (oldName: string, newName: string, aliases?: string[]) => {
    await db.update(items).set({ source: newName }).where(eq(items.source, oldName));
    await db.update(sourceAliases).set({ sourceName: newName }).where(eq(sourceAliases.sourceName, oldName));

    if (aliases !== undefined) {
      await db.delete(sourceAliases).where(eq(sourceAliases.sourceName, newName));
      const aliasValues = aliases
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => ({ id: generateId(), sourceName: newName, alias: a }));
      if (aliasValues.length > 0) {
        await db.insert(sourceAliases).values(aliasValues);
      }
    }
  },

  deletePlace: async (name: string) => {
    await db.update(persons).set({ typicalPlace: null }).where(eq(persons.typicalPlace, name));
    await db.update(orders).set({ deliveryPlace: null }).where(eq(orders.deliveryPlace, name));
    await db.delete(placeAliases).where(eq(placeAliases.placeName, name));
  },

  deleteSource: async (name: string) => {
    await db.update(items).set({ source: null }).where(eq(items.source, name));
    await db.delete(sourceAliases).where(eq(sourceAliases.sourceName, name));
  },

  deleteOrder: async (orderId: string) => {
    // 1. Get order info to know personId and targetDate
    const orderInfo = await db.select().from(orders).where(eq(orders.id, orderId));
    if (orderInfo.length === 0) return;
    const { personId, targetDate } = orderInfo[0];

    // 2. Get unpaid items to revert debt
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let unpaidCost = 0;
    items.forEach(oi => {
      if (!oi.isPaid) {
        unpaidCost += (oi.quantity * (oi.unitPrice || 0));
      }
    });

    // 3. Revert balance (increase back what was charged)
    if (unpaidCost > 0) {
      await db.update(persons)
        .set({ balance: sql`${persons.balance} + ${unpaidCost}` })
        .where(eq(persons.id, personId));
    }

    // 4. Delete related OrderCost transactions
    await db.delete(transactions).where(and(
      eq(transactions.personId, personId),
      eq(transactions.type, 'OrderCost'),
      like(transactions.note, `%${targetDate}%`)
    ));

    // 5. Delete order items and the order itself
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  },

  moveOrdersToDate: async (orderIds: string[], newDate: string) => {
    for (const orderId of orderIds) {
      const orderInfo = await db.select().from(orders).where(eq(orders.id, orderId));
      if (orderInfo.length === 0) continue;
      const { personId, targetDate } = orderInfo[0];

      // Update the date in the order record
      await db.update(orders).set({ targetDate: newDate }).where(eq(orders.id, orderId));

      // Find the related transaction(s) and update its note to reflect the new date
      const relatedLogs = await db.select().from(transactions).where(and(
        eq(transactions.personId, personId),
        eq(transactions.type, 'OrderCost'),
        like(transactions.note, `%${targetDate}%`)
      ));

      for (const log of relatedLogs) {
        if (log.note) {
          const newNote = log.note.replace(targetDate, newDate);
          await db.update(transactions).set({ note: newNote }).where(eq(transactions.id, log.id));
        }
      }
    }
  },

  mergePersons: async (primaryId: string, secondaryId: string, keepSecondaryAsAlias: boolean) => {
    await db.update(orders).set({ personId: primaryId }).where(eq(orders.personId, secondaryId));
    await db.update(transactions).set({ personId: primaryId }).where(eq(transactions.personId, secondaryId));
    
    const secondaryPerson = await db.select().from(persons).where(eq(persons.id, secondaryId));
    
    if (secondaryPerson.length > 0) {
      await db.update(persons).set({ balance: sql`${persons.balance} + ${secondaryPerson[0].balance}` }).where(eq(persons.id, primaryId));
      if (keepSecondaryAsAlias) {
        await db.insert(personAliases).values({ id: generateId(), personId: primaryId, alias: secondaryPerson[0].name });
      }
    }

    await db.update(personAliases).set({ personId: primaryId }).where(eq(personAliases.personId, secondaryId));
    await db.delete(persons).where(eq(persons.id, secondaryId));
  },

  mergeItems: async (primaryId: string, secondaryId: string, keepSecondaryAsAlias: boolean) => {
    await db.update(orderItems).set({ itemId: primaryId }).where(eq(orderItems.itemId, secondaryId));

    const secondaryItem = await db.select().from(items).where(eq(items.id, secondaryId));
    if (secondaryItem.length > 0 && keepSecondaryAsAlias) {
      await db.insert(itemAliases).values({ id: generateId(), itemId: primaryId, alias: secondaryItem[0].name });
    }

    await db.update(itemAliases).set({ itemId: primaryId }).where(eq(itemAliases.itemId, secondaryId));
    await db.delete(items).where(eq(items.id, secondaryId));
  },

  mergePlaces: async (primaryName: string, secondaryName: string, keepSecondaryAsAlias: boolean) => {
    await db.update(persons).set({ typicalPlace: primaryName }).where(eq(persons.typicalPlace, secondaryName));
    await db.update(orders).set({ deliveryPlace: primaryName }).where(eq(orders.deliveryPlace, secondaryName));

    if (keepSecondaryAsAlias) {
      await db.insert(placeAliases).values({ id: generateId(), placeName: primaryName, alias: secondaryName });
    }

    await db.update(placeAliases).set({ placeName: primaryName }).where(eq(placeAliases.placeName, secondaryName));
    await db.delete(placeAliases).where(eq(placeAliases.placeName, secondaryName)); // remove any redundant self aliases if exist
  },

  mergeSources: async (primaryName: string, secondaryName: string, keepSecondaryAsAlias: boolean) => {
    await db.update(items).set({ source: primaryName }).where(eq(items.source, secondaryName));

    if (keepSecondaryAsAlias) {
      await db.insert(sourceAliases).values({ id: generateId(), sourceName: primaryName, alias: secondaryName });
    }

    await db.update(sourceAliases).set({ sourceName: primaryName }).where(eq(sourceAliases.sourceName, secondaryName));
    await db.delete(sourceAliases).where(eq(sourceAliases.sourceName, secondaryName));
  },

  seedDummyData: async (options: { peopleCount: number, itemsCount: number, seedOrders: boolean }) => {
    const { peopleCount, itemsCount, seedOrders } = options;

    const realItemNames = [
      'Milk', 'Bread', 'Eggs', 'Tomato', 'Cucumber', 'Apple', 'Banana', 'Chicken', 'Beef', 'Rice', 
      'Pasta', 'Salt', 'Sugar', 'Tea', 'Coffee', 'Water', 'Juice', 'Yogurt', 'Cheese', 'Butter',
      'Flour', 'Oil', 'Onion', 'Garlic', 'Potato', 'Carrot', 'Pepper', 'Lemon', 'Orange', 'Strawberry'
    ];
    const realPeopleNames = [
      'Ahmed', 'Mohamed', 'Sayed', 'Youssef', 'Ibrahim', 'Ali', 'Hassan', 'Hussein', 'Omar', 'Zainab', 
      'Fatima', 'Mariam', 'Aya', 'Nour', 'Sara', 'Mona', 'Layla', 'Hend', 'Amira', 'Khaled'
    ];

    const sources = ['Supermarket', 'Bakery', 'Farm', 'Market', 'Butcher'];
    const timings: ('Fresh' | 'Anytime')[] = ['Fresh', 'Anytime'];

    // 1. Create dummy items
    const dummyItems = [];
    for (let i = 0; i < itemsCount; i++) {
      const name = realItemNames[i % realItemNames.length] + (i >= realItemNames.length ? ` ${Math.floor(i / realItemNames.length)}` : '');
      const hasPrice = Math.random() > 0.2; // 80% have prices
      dummyItems.push({
        id: generateId(),
        name,
        source: sources[Math.floor(Math.random() * sources.length)],
        defaultPrice: hasPrice ? parseFloat((Math.random() * 10 + 1).toFixed(2)) : null,
        timing: timings[Math.floor(Math.random() * timings.length)],
      });
    }
    if (dummyItems.length > 0) {
      await db.insert(items).values(dummyItems);
    }

    // 2. Create dummy people
    const places = ['Rehab', 'Madinaty', 'Tagamoa', 'Shorouk'];
    const dummyPeople = [];
    for (let i = 0; i < peopleCount; i++) {
      const name = realPeopleNames[i % realPeopleNames.length] + (i >= realPeopleNames.length ? ` ${Math.floor(i / realPeopleNames.length)}` : '');
      dummyPeople.push({
        id: generateId(),
        name,
        balance: 0,
        typicalPlace: places[Math.floor(Math.random() * places.length)],
      });
    }
    if (dummyPeople.length > 0) {
      await db.insert(persons).values(dummyPeople);
    }

    // 3. Create dummy orders if requested
    if (seedOrders && dummyPeople.length > 0 && dummyItems.length > 0) {
      const targetDate = new Date().toISOString().split('T')[0];
      for (const person of dummyPeople) {
        const orderId = generateId();
        await db.insert(orders).values({
          id: orderId,
          personId: person.id,
          targetDate,
          isPaid: false,
          deliveryPlace: person.typicalPlace,
        });

        // Add 1-3 random items to the order
        const orderSize = Math.floor(Math.random() * 3) + 1;
        let totalCost = 0;
        for (let i = 0; i < orderSize; i++) {
          const item = dummyItems[Math.floor(Math.random() * dummyItems.length)];
          const quantity = Math.floor(Math.random() * 3) + 1;
          
          // Use item's default price if it has one
          const unitPrice = item.defaultPrice;
          const cost = quantity * (unitPrice || 0);
          totalCost += cost;
          
          await db.insert(orderItems).values({
            id: generateId(),
            orderId,
            itemId: item.id,
            quantity,
            unitPrice,
            isPaid: false,
          });
        }

        // Update person balance and log transaction
        if (totalCost > 0) {
          await db.update(persons)
            .set({ balance: sql`${persons.balance} - ${totalCost}` })
            .where(eq(persons.id, person.id));

          await db.insert(transactions).values({
            id: generateId(),
            personId: person.id,
            amount: -totalCost,
            date: new Date().toISOString(),
            type: 'OrderCost',
            note: `Order for ${targetDate}`,
          });
        }
      }
    }
  },

  wipeAllData: async () => {
    await db.transaction(async (tx) => {
      // Using where(sql`1=1`) to ensure reactive hooks trigger correctly on all platforms
      await tx.delete(transactions).where(sql`1=1`);
      await tx.delete(orderItems).where(sql`1=1`);
      await tx.delete(orders).where(sql`1=1`);
      await tx.delete(personAliases).where(sql`1=1`);
      await tx.delete(persons).where(sql`1=1`);
      await tx.delete(itemAliases).where(sql`1=1`);
      await tx.delete(items).where(sql`1=1`);
      await tx.delete(placeAliases).where(sql`1=1`);
      await tx.delete(sourceAliases).where(sql`1=1`);
    });
  },
};
