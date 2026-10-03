/** Offline keyword categoriser. Order of appearance in the text wins (so "Didi to the hotel" is Transport). */
const KEYWORDS: [string, string[]][] = [
  ['Transport', ['didi', 'taxi', 'uber', 'grab', 'cab', 'metro', 'subway', 'train', 'rail', 'bus', 'ferry', 'petrol', 'fuel', 'parking', 'toll', 'transfer', 'tram', 'high-speed', 'mtr', 'opal', 'transport', 'bolt', 'lyft', 'car hire', 'rental car']],
  ['Food', ['dinner', 'lunch', 'breakfast', 'brunch', 'restaurant', 'cafe', 'café', 'coffee', 'food', 'snack', 'snacks', 'meal', 'bakery', 'tea', 'bar', 'beer', 'drinks', 'kfc', 'mcdonald', "mcdonald's", 'starbucks', 'luckin', 'hotpot', 'dumpling', 'dumplings', 'noodles', 'pizza', 'burger', 'ice cream', 'supermarket', 'grocery', 'groceries', '7-eleven', 'familymart', 'meituan', 'eleme']],
  ['Accommodation', ['hotel', 'hostel', 'airbnb', 'agoda', 'booking.com', 'motel', 'resort', 'inn', 'accommodation', 'marriott', 'hilton', 'hyatt', 'ibis', 'novotel', 'holiday inn', 'atour']],
  ['Flights', ['flight', 'flights', 'airline', 'airlines', 'airways', 'qantas', 'jetstar', 'virgin', 'air china', 'china eastern', 'china southern', 'cathay', 'emirates', 'singapore air', 'baggage']],
  ['Activities', ['ticket', 'tickets', 'tour', 'museum', 'park', 'zoo', 'aquarium', 'entry', 'admission', 'disney', 'disneyland', 'show', 'cruise', 'temple', 'palace', 'great wall', 'cable car', 'theme park', 'klook', 'activity']],
  ['Kids', ['toy', 'toys', 'kids', 'children', 'child', 'lego', 'nappies', 'diapers', 'playground']],
  ['Shopping', ['shopping', 'shop', 'store', 'mall', 'market', 'souvenir', 'souvenirs', 'pokemon', 'pokémon', 'clothes', 'gift', 'gifts', 'uniqlo', 'taobao', 'pharmacy']]
];

export function keywordCategory(text: string): string | undefined {
  const t = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}.'\- ]+/gu, ' ') + ' ';
  let best: { idx: number; cat: string } | undefined;
  for (const [cat, words] of KEYWORDS) {
    for (const w of words) {
      const idx = t.indexOf(' ' + w + ' ') >= 0 ? t.indexOf(' ' + w + ' ') : t.indexOf(' ' + w);
      if (idx >= 0 && (!best || idx < best.idx)) best = { idx, cat };
    }
  }
  return best?.cat;
}

export const merchantKey = (merchant: string) =>
  merchant.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
