import { and, eq, inArray, sql } from 'drizzle-orm';
import * as crypto from 'expo-crypto';
import { db } from './index';
import { items, orderItems, orders, persons, transactions } from './schema';

export const generateId = () => crypto.randomUUID();

export const api = {
  addPerson: async (name: string) => {
    const trimmed = name.trim();
    const existing = await db.select().from(persons).where(sql`lower(name) = lower(${trimmed})`);
    if (existing.length > 0) return existing;
    return db.insert(persons).values({ id: generateId(), name: trimmed }).returning();
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
  
  createOrder: async (personId: string, targetDate: string, orderLines: { itemId: string, quantity: number, unitPrice: number | null }[]) => {
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

    await db.insert(orders).values({ id: orderId, personId, targetDate, isPaid: false });
    
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
      });
    }
  },

  updateOrder: async (orderId: string, personId: string, newOrderLines: { itemId: string, quantity: number, unitPrice: number | null }[]) => {
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
    
    // Set order to unpaid just in case it was paid
    await db.update(orders).set({ isPaid: false }).where(eq(orders.id, orderId));
  },

  markItemPaid: async (itemId: string, personId: string, cost: number) => {
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
      });
    }
  },

  markItemUnpaid: async (itemId: string, personId: string, cost: number) => {
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
      });
    }
  },

  markAllPaid: async (orderId: string, personId: string) => {
    const itemsToPay = await db.select().from(orderItems).where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.isPaid, false))
    );
    
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
        });
      }
    }
  },

  markOrderPaid: async (orderId: string, personId: string) => {
    // Alias for markAllPaid for backward compatibility
    return api.markAllPaid(orderId, personId);
  },

  markOrderUnpaid: async (orderId: string, personId: string) => {
    const itemsInOrder = await db.select().from(orderItems).where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.isPaid, true))
    );
    
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
        });
      }
    }
  },

  changeBalance: async (personId: string, amount: number) => {
    // Positive amount increases credit, negative decreases credit
    await db.update(persons)
      .set({ balance: sql`${persons.balance} + ${amount}` })
      .where(eq(persons.id, personId));
      
    await db.insert(transactions).values({
      id: generateId(),
      personId,
      amount,
      date: new Date().toISOString(),
      type: 'ManualAdjustment',
    });
  },

  settleBalance: async (personId: string, amount: number) => {
    // Alias for changeBalance
    return api.changeBalance(personId, amount);
  },
  
  updateItem: async (id: string, updates: Partial<{ name: string; defaultPrice: number | null; source: string | null; timing: 'Fresh' | 'Anytime' }>) => {
    let finalSource = updates.source?.trim() || null;
    if (finalSource) {
      const existingSources = await db.select().from(items).where(sql`lower(source) = lower(${finalSource})`);
      if (existingSources.length > 0 && existingSources[0].source) {
        finalSource = existingSources[0].source;
      }
    }
    const finalUpdates = { ...updates, source: finalSource };
    if (updates.name) finalUpdates.name = updates.name.trim();

    await db.update(items).set(finalUpdates).where(eq(items.id, id));
  }
};
