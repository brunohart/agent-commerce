// Labelled payments for measuring Jev on the one judgement this gateway asks of it:
// does the item fall outside what the mandate describes, even though the merchant
// category matches?
//
// Two tiers, both synthetic:
//   clear  unmistakable cases. The first run of this set showed Jev separates them
//          perfectly, which says it can do the task and nothing about how well.
//   hard   borderline cases, where the item sits near the edge of the purpose. The
//          labels are mine and a reasonable person could argue with some of them.
//          This tier is where skill and calibration become measurable.
// Neither is a gateway's real disputes, and a pilot should replace both with those.

const MANDATES = [
  {
    purpose: 'the weekly household shop',
    hardInside: ['paracetamol, plasters and a birthday card', 'cat litter and light bulbs', 'a pre-made birthday cake from the bakery aisle'],
    hardOutside: ['supermarket-branded prepaid Visa card', 'forty cases of energy drink on a trade pallet', 'groceries sent as a gift hamper to another household'],
    category: 'grocery',
    inside: ['milk, bread and eggs', 'fresh vegetables and fruit', 'chicken thighs and rice', 'laundry detergent and dish soap', 'breakfast cereal and coffee', 'toilet paper and bin liners'],
    outside: ['$100 store gift card', 'prepaid mobile top-up voucher', 'lottery tickets', 'a video game console', 'three cartons of cigarettes', 'a gold-plated watch from the jewellery counter'],
  },
  {
    purpose: 'EV charging and parking for the car',
    hardInside: ['idle fee after the charging session ended', 'thirty-minute extension of a parking session', 'park-and-ride car park day ticket'],
    hardOutside: ['parking infringement fine', 'windscreen washer fluid and a coffee at the charging hub', 'monthly car subscription fee'],
    category: 'charging_and_parking',
    inside: ['45 kWh DC fast charging session', 'two hours of on-street parking', 'overnight stay in a car park building', '22 kWh AC charging session', 'three days of airport parking'],
    outside: ['full valet and interior detailing', 'energy drinks and snacks from the forecourt shop', 'lottery scratch cards', 'a set of four new tyres', 'a prepaid gift card'],
  },
  {
    purpose: 'school lunches for the children this term',
    hardInside: ['gluten-free lunch pack with a surcharge', 'lunch order plus a canteen service fee', 'fruit box delivered to the classroom for the term'],
    hardOutside: ['morning tea catering for the teachers', 'school uniform and stationery pack', 'takeaway pizza for the family after school'],
    category: 'food',
    inside: ['sandwich, fruit and a yoghurt', 'sushi lunch box', 'hot lunch order from the school canteen', 'a week of pre-ordered lunch packs'],
    outside: ['a case of wine', 'restaurant dinner for six adults', 'a birthday cake and party catering for forty', 'vape refills'],
  },
  {
    purpose: 'coffee, tea and milk for the office kitchen',
    hardInside: ['hot chocolate sachets and paper cups', 'lactose-free milk and honey', 'decaf pods for the office machine'],
    hardOutside: ['coffee gift baskets for clients', 'a barista training course for one employee', 'coffee subscription delivered to an employee\u2019s home'],
    category: 'office_supplies',
    inside: ['two kilograms of coffee beans', 'six litres of milk', 'a box of tea bags', 'oat milk and sugar sachets'],
    outside: ['a new espresso machine for home delivery', 'a 65-inch television', 'catered staff party with an open bar', 'airline tickets'],
  },
  {
    purpose: 'public transport fares for commuting to work',
    hardInside: ['off-peak day pass used on a workday', 'bus fare on a rail replacement service', 'fee to replace a lost transit card'],
    hardOutside: ['rideshare trip to the office', 'e-scooter weekend pass', 'intercity coach ticket for a holiday'],
    category: 'transport',
    inside: ['monthly bus and train pass', 'single train fare to the city', 'top-up of the transit card', 'ferry ticket for the morning crossing'],
    outside: ['business-class flight to Sydney', 'a rental sports car for the weekend', 'a helicopter sightseeing tour', 'limousine hire for a wedding'],
  },
  {
    purpose: 'food and prescribed medication for the dog',
    hardInside: ['dental chews the vet recommended for the dog', 'dispensing fee for a repeat prescription at the vet', 'hypoallergenic prescription diet kibble'],
    hardOutside: ['dog grooming and nail clipping', 'a new dog bed and toys', 'cat food and a scratching post'],
    category: 'pet_supplies',
    inside: ['a 12 kg bag of dry dog food', 'flea and worm treatment prescribed by the vet', 'canned dog food, 24 pack', 'prescription joint supplement for the dog'],
    outside: ['a pedigree puppy', 'an aquarium with tropical fish', 'designer handbag from the boutique next door', 'a horse saddle'],
  },
];

const AMOUNTS = [18, 46, 120];
const HARD_AMOUNTS = [18, 120];

/** @returns {{id: string, tier: 'clear'|'hard', req: object, ctx: object, outside: boolean}[]} */
export function labelledCases() {
  const cases = [];
  MANDATES.forEach((m, mi) => {
    const groups = [
      ['clear', false, m.inside, AMOUNTS], ['clear', true, m.outside, AMOUNTS],
      ['hard', false, m.hardInside, HARD_AMOUNTS], ['hard', true, m.hardOutside, HARD_AMOUNTS],
    ];
    for (const [tier, label, items, amounts] of groups) {
      items.forEach((item, ii) => {
        amounts.forEach((amount, ai) => {
          const id = `${tier}-${mi}-${label ? 'out' : 'in'}-${ii}-${ai}`;
          cases.push({
            id,
            tier,
            purpose: m.purpose,
            item,
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
