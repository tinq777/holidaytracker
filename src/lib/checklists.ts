import { db, uid } from './db';
import type { ChecklistItem } from './types';

export const DEFAULT_PACKING: Record<string, string[]> = {
  Documents: ['Passport', 'Travel insurance', 'Boarding passes', 'Hotel bookings', 'Copies of important documents'],
  Electronics: ['Phone', 'Chargers', 'Power bank', 'Travel adapter', 'Headphones'],
  Clothing: ['Shirts', 'Pants', 'Underwear', 'Socks', 'Shoes', 'Jacket'],
  Toiletries: ['Toothbrush', 'Toothpaste', 'Deodorant', 'Medication', 'Sunscreen'],
  Kids: ['Kids clothes', 'Shoes', 'Entertainment', 'Headphones', 'Snacks', 'Favourite toy', 'Travel documents']
};
export const DEFAULT_PRETRIP: Record<string, string[]> = {
  'Before leaving': ['Check passports', 'Check visas', 'Travel insurance', 'Check flight times', 'Check hotel bookings', 'Download offline maps', 'Download airline apps', 'Check roaming/eSIM', 'Check credit cards', 'Notify bank if required', 'Get local currency if required', 'Check weather', 'Arrange airport transport']
};

export function itemsFrom(holidayId: string, list: ChecklistItem['list'], groups: { group: string; text: string }[]): ChecklistItem[] {
  return groups.map((g, i) => ({ id: uid(), holidayId, list, group: g.group, text: g.text, done: false, order: i }));
}
export const flatten = (r: Record<string, string[]>) => Object.entries(r).flatMap(([group, items]) => items.map(text => ({ group, text })));

/** Your own standing lists. Edited from the Checklist tab even with no holidays; every new holiday starts as a copy. */
export const DEFAULT_LIST_ID = 'default';

export async function ensureDefaultLists() {
  await db.transaction('rw', db.checklist, async () => {
    for (const [list, src] of [['packing', DEFAULT_PACKING], ['pretrip', DEFAULT_PRETRIP]] as const) {
      const n = await db.checklist.where('[holidayId+list]').equals([DEFAULT_LIST_ID, list]).count();
      if (!n) await db.checklist.bulkAdd(itemsFrom(DEFAULT_LIST_ID, list, flatten(src)));
    }
  });
}

export async function seedChecklists(holidayId: string, withKids: boolean) {
  await ensureDefaultLists();
  const from = async (list: ChecklistItem['list']) => (await db.checklist.where('[holidayId+list]').equals([DEFAULT_LIST_ID, list]).sortBy('order')).map(i => ({ group: i.group, text: i.text }));
  const packing = (await from('packing')).filter(i => withKids || i.group !== 'Kids');
  await db.checklist.bulkAdd([...itemsFrom(holidayId, 'packing', packing), ...itemsFrom(holidayId, 'pretrip', await from('pretrip'))]);
}

export async function replaceList(holidayId: string, list: ChecklistItem['list'], items: { group: string; text: string }[]) {
  await db.transaction('rw', db.checklist, async () => {
    await db.checklist.where('[holidayId+list]').equals([holidayId, list]).delete();
    await db.checklist.bulkAdd(itemsFrom(holidayId, list, items));
  });
}
