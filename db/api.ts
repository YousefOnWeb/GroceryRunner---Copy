import { and, eq, inArray, sql } from 'drizzle-orm';
import * as crypto from 'expo-crypto';
import { db } from './index';
import { items, orderItems, orders, personAliases, persons, transactions } from './schema';

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
  
  addItem: async (name: string, defaultPrice: number | null, source: string | null, timing: 'Fresh' | 'Anytime') => {
    const trimmed = name.trim();
    const existing = await db.select().from(items).where(sql`lower(name) = lower(${trimmed})`);
    if (existing.length > 0) return existing;
    
    let finalSource = source?.trim() || null;
    if (finalSource) {
      const existingSources = await db.select().from(items).where(sql`lower(source) = lower(${finalSource})`);
      if (existingSources.length > 0 && existingSources[0].source) {
        finalSource = existingSources[0].source;
      }
    }

    return db.insert(items).values({ id: generateId(), name: trimmed, defaultPrice, source: finalSource, timing }).returning();
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

    await db.insert(orders).values({
      id: orderId,
      personId,
      targetDate,
      isPaid: false,
      deliveryPlace: deliveryPlace?.trim() || null,
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
      
      await db.insert(transactions).values({
        id: generateId(),
        personId,
        amount: oldUnpaidCost,
        date: new Date().toISOString(),
        type: 'ManualAdjustment',
        note: `Reverted old items for edited order (${targetDate})`,
      });
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

      await db.insert(transactions).values({
        id: generateId(),
        personId,
        amount: -newTotalCost,
        date: new Date().toISOString(),
        type: 'OrderCost',
        note: `Updated items for order (${targetDate})`,
      });
    }
    
    // Update deliveryPlace and set order to unpaid
    const orderUpdates: any = { isPaid: false };
    if (deliveryPlace !== undefined) {
      orderUpdates.deliveryPlace = deliveryPlace?.trim() || null;
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
    const itemInfo = await db.select({ name: items.name, qty: orderItems.quantity })
      .from(orderItems)
      .innerJoin(items, eq(orderItems.itemId, items.id))
      .where(eq(orderItems.id, itemId));
    const itemName = itemInfo.length > 0 ? `${itemInfo[0].qty}x ${itemInfo[0].name}` : 'Item';

    await db.update(orderItems).set({ isPaid: false }).where(eq(orderItems.id, itemId));
    if (cost > 0) {
      await db.update(persons)
        .set({ balance: sql`${persons.balance} - ${cost}` })
        .where(eq(persons.id, personId));
        
      await db.insert(transactions).values({
        id: generateId(),
        personId,
        amount: -cost,
        date: new Date().toISOString(),
        type: 'ManualAdjustment',
        note: `Unpaid: ${itemName}`,
      });
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
          
        await db.insert(transactions).values({
          id: generateId(),
          personId,
          amount: -totalPaidCost,
          date: new Date().toISOString(),
          type: 'ManualAdjustment',
          note: `Reverted payment for order from ${orderDate}`,
        });
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
  
  updateItem: async (id: string, updates: Partial<{ name: string; defaultPrice: number | null; source: string | null; timing: 'Fresh' | 'Anytime' }>, isCorrection: boolean = false) => {
    let finalSource = updates.source?.trim() || null;
    if (finalSource) {
      const existingSources = await db.select().from(items).where(sql`lower(source) = lower(${finalSource})`);
      if (existingSources.length > 0 && existingSources[0].source) {
        finalSource = existingSources[0].source;
      }
    }
    const finalUpdates = { ...updates, source: finalSource };
    if (updates.name) finalUpdates.name = updates.name.trim();

    // Fetch name for log before update
    const oldItem = await db.select({ name: items.name }).from(items).where(eq(items.id, id));
    const itemName = oldItem.length > 0 ? oldItem[0].name : 'Item';

    await db.update(items).set(finalUpdates).where(eq(items.id, id));

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
    return res.map(r => r.source).filter((s): s is string => s !== null && s.trim() !== '');
  },
};
