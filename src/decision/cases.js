// Labelled payments for measuring Jev on the one judgement this gateway asks of it:
// does the item fall outside what the mandate describes, even though the merchant
// category matches?
//
// These are synthetic and deliberately clear-cut. They measure whether Jev can do
// the task at all and how its probabilities behave; they are not a gateway's real
// disputes, and a pilot should replace them with those.

const MANDATES = [
  {
    purpose: 'the weekly household shop',
    category: 'grocery',
    inside: ['milk, bread and eggs', 'fresh vegetables and fruit', 'chicken thighs and rice', 'laundry detergent and dish soap', 'breakfast cereal and coffee', 'toilet paper and bin liners'],
    outside: ['$100 store gift card', 'prepaid mobile top-up voucher', 'lottery tickets', 'a video game console', 'three cartons of cigarettes', 'a gold-plated watch from the jewellery counter'],
  },
  {
    purpose: 'EV charging and parking for the car',
    category: 'charging_and_parking',
    inside: ['45 kWh DC fast charging session', 'two hours of on-street parking', 'overnight stay in a car park building', '22 kWh AC charging session', 'three days of airport parking'],
    outside: ['full valet and interior detailing', 'energy drinks and snacks from the forecourt shop', 'lottery scratch cards', 'a set of four new tyres', 'a prepaid gift card'],
  },
  {
    purpose: 'school lunches for the children this term',
    category: 'food',
    inside: ['sandwich, fruit and a yoghurt', 'sushi lunch box', 'hot lunch order from the school canteen', 'a week of pre-ordered lunch packs'],
    outside: ['a case of wine', 'restaurant dinner for six adults', 'a birthday cake and party catering for forty', 'vape refills'],
  },
  {
    purpose: 'coffee, tea and milk for the office kitchen',
    category: 'office_supplies',
    inside: ['two kilograms of coffee beans', 'six litres of milk', 'a box of tea bags', 'oat milk and sugar sachets'],
    outside: ['a new espresso machine for home delivery', 'a 65-inch television', 'catered staff party with an open bar', 'airline tickets'],
  },
  {
    purpose: 'public transport fares for commuting to work',
    category: 'transport',
    inside: ['monthly bus and train pass', 'single train fare to the city', 'top-up of the transit card', 'ferry ticket for the morning crossing'],
    outside: ['business-class flight to Sydney', 'a rental sports car for the weekend', 'a helicopter sightseeing tour', 'limousine hire for a wedding'],
  },
  {
    purpose: 'food and prescribed medication for the dog',
    category: 'pet_supplies',
    inside: ['a 12 kg bag of dry dog food', 'flea and worm treatment prescribed by the vet', 'canned dog food, 24 pack', 'prescription joint supplement for the dog'],
    outside: ['a pedigree puppy', 'an aquarium with tropical fish', 'designer handbag from the boutique next door', 'a horse saddle'],
  },
];

const AMOUNTS = [18, 46, 120];

/** @returns {{id: string, req: object, ctx: object, outside: boolean}[]} */
export function labelledCases() {
  const cases = [];
  MANDATES.forEach((m, mi) => {
    for (const [label, items] of [[false, m.inside], [true, m.outside]]) {
      items.forEach((item, ii) => {
        AMOUNTS.forEach((amount, ai) => {
          const id = `case-${mi}-${label ? 'out' : 'in'}-${ii}-${ai}`;
          cases.push({
            id,
            outside: label,
            req: {
              intentId: id, isAgent: true, amount, category: m.category, itemDescription: item,
              mandate: { purpose: m.purpose, maxPerTxn: 500, maxTotal: 2000 },
            },
            ctx: { attested: true, mandateVerified: true, spent: 0, unattended: m.category === 'charging_and_parking' },
          });
        });
      });
    }
  });
  return cases;
}
