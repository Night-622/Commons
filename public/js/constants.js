// All tunable numbers live here so balancing never means hunting through logic.

export const WORLD_ID = 'public';
export const PLOT = 24;          // tiles per side of a plot
export const GAP = 2;            // tiles between neighbouring plots on the master map
export const CHUNK = 4;          // land is bought in 4×4 parcels
export const CHUNKS = PLOT / CHUNK;
export const START_CHUNKS = [14, 15, 20, 21];   // the 8×8 around the town hall
export const LAND_PRICE = 150;   // first extra parcel; each one after costs 18% more
export const LAND_STEP = 1.18;
export const MOVE_FEE = 0.25;    // moving a building costs a quarter of its price

export const TICK_MS = 2500;     // 1 tick = 1 in-game hour, so 1 in-game day = 60 real seconds
export const HOURS_PER_DAY = 24;
export const MAX_OFFLINE_DAYS = 3;
export const SAVE_EVERY_MS = 12000;   // others see your city update this often (and straight after you build)

export const START_MONEY = 3000;
export const REBUILD_MONEY = 1500;
export const GRACE_DAYS = 3;
export const VOLUNTEER_RATE = 0.25;
export const RUBBLE_CLEAR_COST = 25;
export const COLLAPSE_UNPAID_DAYS = 10;
export const TAP_SHARE = 0.05;
export const TAP_CAP = 0.25;
export const ROAD_CAP = 45;
export const HALL_CAP = 120;

// Two days are a year of life, so a child grows up in about 36 real minutes.
export const YEAR_DAYS = 2;
export const ADULT = 18;
export const RETIRE = 65;
export const WAGE = [3, 5, 8];   // daily tax by the education a job needs
export const EDU = ['No schooling', 'Primary', 'High school', 'Degree'];

export const TRADE_PER_LINK = 30;
export const LINK_MOOD = 0.03;
export const MAX_LINKS = 4;
export const HISTORY_DAYS = 30;
export const LOG_SIZE = 60;
export const EVENT_CHANCE = 0.25;
export const TUTORIAL_REWARD = 300;
export const MOVE_KEEP = 0.5;

export const T = {
  EMPTY: 0, ROAD: 1, HOUSE: 2, WORK: 3, SHOP: 4, SCHOOL: 5, PARK: 6, HALL: 7, RUBBLE: 8,
  PATH: 9, APARTMENT: 10, VILLA: 11, CAFE: 12, FACTORY: 13, DAYCARE: 14, HIGH: 15, UNI: 16, TUTOR: 17, LIBRARY: 18,
  CLINIC: 19, HOSPITAL: 20, POLICE: 21, FIRE: 22, COURT: 23, CEMETERY: 24, PLAYGROUND: 25, SPORTS: 26, GYM: 27,
  DOJO: 28, POOL: 29, CINEMA: 30, YARD: 31, RAIL: 32, STATION: 33, STOP: 34, DEPOT: 35, XING: 36, LIGHTS: 37, ROUNDABOUT: 38, POWER: 39, WATER: 40, DRAIN: 41,
};

export const CATS = [
  ['homes', 'Homes'], ['work', 'Work and shops'], ['learn', 'Education'], ['care', 'Health and safety'], ['fun', 'Leisure and sport'], ['transport', 'Transport'], ['utility', 'Utilities'],
];

// Every building has a job. jobs: [title, education needed, count]. col: which colour slot it uses.
// school: stage + seats. care: clinic | hospital + patients a day. visits: people a day for leisure.
export const B = {
  [T.ROAD]: { key: 'road', name: 'Road', cost: 10, work: 1, upkeep: 0.3, blurb: 'Cars, bikes and walkers. Jams above 45 car trips a day.' },
  [T.PATH]: { key: 'path', name: 'Footpath', cost: 5, work: 1, upkeep: 0.1, blurb: 'Walkers and bikes only. Takes cars off the road.' },
  [T.XING]: { key: 'crossing', name: 'Level crossing', cost: 30, work: 2, upkeep: 0.5, blurb: 'Where a road and a railway meet. Cars wait while trains pass.' },
  [T.LIGHTS]: { key: 'lights', name: 'Traffic lights', cost: 80, work: 4, upkeep: 1, blurb: 'Put on a junction. Carries 50% more traffic than an uncontrolled junction.' },
  [T.ROUNDABOUT]: { key: 'roundabout', name: 'Roundabout', cost: 150, work: 8, upkeep: 1.5, blurb: 'Put on a junction. Keeps traffic flowing: 80% more than an uncontrolled junction.' },
  [T.POWER]: { key: 'power', name: 'Power station', cat: 'utility', col: 'work', cost: 700, work: 70, upkeep: 12, jobs: [['Engineer', 2, 3]], supply: 12, pollution: 2, blurb: 'Powers every building within 12 tiles. Once the town has 25 people, unpowered buildings work at 60%.' },
  [T.WATER]: { key: 'water', name: 'Water tower', cat: 'utility', col: 'work', cost: 350, work: 36, upkeep: 5, jobs: [['Technician', 1, 1]], supply: 10, blurb: 'Clean water for every building within 10 tiles. Without it, illness spreads faster.' },
  [T.DRAIN]: { key: 'drain', name: 'Storm drains', cat: 'utility', col: 'work', cost: 260, work: 24, upkeep: 3, supply: 8, blurb: 'Protects everything within 8 tiles from floods after heavy rain.' },
  [T.RAIL]: { key: 'rail', name: 'Railway', cost: 25, work: 2, upkeep: 0.5, blurb: 'Track for trains. Join stations together, or run it to your plot edge to reach a neighbour.' },

  [T.STOP]: { key: 'stop', name: 'Bus stop', cat: 'transport', col: 'hall', cost: 60, work: 6, upkeep: 1, catchment: 4, needs: T.DEPOT, blurb: 'People within 4 tiles ride the bus instead of driving. Needs a bus depot.' },
  [T.DEPOT]: { key: 'depot', name: 'Bus depot', cat: 'transport', col: 'hall', cost: 420, work: 44, upkeep: 7, jobs: [['Bus driver', 1, 4]], blurb: 'Each driver runs one bus between your stops. Every bus holds 40 riders a day.' },
  [T.STATION]: { key: 'station', name: 'Train station', cat: 'transport', col: 'hall', cost: 600, work: 60, upkeep: 8, jobs: [['Station staff', 1, 3]], catchment: 5, minPop: 20, blurb: 'People within 5 tiles take the train on long trips. Put it next to a railway.' },

  [T.HOUSE]: { key: 'house', name: 'House', cat: 'homes', col: 'house', cost: 120, work: 16, upkeep: 2, homes: 6, blurb: 'Homes for 6 people.' },
  [T.APARTMENT]: { key: 'apartment', name: 'Apartments', cat: 'homes', col: 'house', cost: 420, work: 50, upkeep: 6, homes: 24, minPop: 30, homeMood: -0.03, blurb: 'Homes for 24. A little cramped.' },
  [T.VILLA]: { key: 'villa', name: 'Villa', cat: 'homes', col: 'house', cost: 380, work: 36, upkeep: 5, homes: 4, homeMood: 0.08, blurb: 'Homes for 4 with a garden. Residents are happier.' },

  [T.WORK]: { key: 'work', name: 'Office', cat: 'work', col: 'work', cost: 220, work: 30, upkeep: 4, jobs: [['Clerk', 1, 8], ['Manager', 3, 2]], blurb: 'Office jobs for people with schooling.' },
  [T.SHOP]: { key: 'shop', name: 'Grocer', cat: 'work', col: 'shop', cost: 160, work: 20, upkeep: 3, jobs: [['Shop assistant', 0, 3]], serves: 30, blurb: 'Food for 30 people. Every household needs one nearby.' },
  [T.CAFE]: { key: 'cafe', name: 'Café', cat: 'work', col: 'shop', cost: 180, work: 20, upkeep: 3, jobs: [['Barista', 0, 3]], visits: { n: 20, who: 'all' }, blurb: 'Jobs, plus somewhere to go in the evening.' },
  [T.FACTORY]: { key: 'factory', name: 'Factory', cat: 'work', col: 'work', cost: 300, work: 40, upkeep: 5, jobs: [['Factory hand', 0, 14], ['Engineer', 3, 1]], pollution: 3, injury: 0.004, blurb: 'Lots of jobs for anyone. Noisy: homes within 3 tiles are less happy.' },
  [T.YARD]: { key: 'yard', name: "Builder's yard", cat: 'work', col: 'work', cost: 260, work: 30, upkeep: 4, jobs: [['Builder', 0, 6]], blurb: 'Hires 6 builders, so construction goes faster.' },

  [T.DAYCARE]: { key: 'daycare', name: 'Daycare', cat: 'learn', col: 'school', cost: 200, work: 24, upkeep: 4, jobs: [['Carer', 2, 2]], school: { stage: 'daycare', seats: 10 }, blurb: 'Minds 10 children under 5 so both parents can work.' },
  [T.SCHOOL]: { key: 'school', name: 'Primary school', cat: 'learn', col: 'school', cost: 320, work: 40, upkeep: 6, jobs: [['Teacher', 3, 2]], school: { stage: 'primary', seats: 20 }, blurb: '20 seats for children aged 5 to 11.' },
  [T.HIGH]: { key: 'high', name: 'High school', cat: 'learn', col: 'school', cost: 480, work: 60, upkeep: 8, jobs: [['Teacher', 3, 3]], school: { stage: 'high', seats: 24 }, minPop: 25, blurb: '24 seats for teenagers. Graduates can get skilled jobs.' },
  [T.UNI]: { key: 'uni', name: 'University', cat: 'learn', col: 'school', cost: 900, work: 110, upkeep: 14, jobs: [['Lecturer', 3, 4]], school: { stage: 'uni', seats: 20 }, minPop: 60, needs: T.HIGH, blurb: 'Turns high school graduates into doctors, teachers and managers.' },
  [T.TUTOR]: { key: 'tutor', name: 'Tutoring centre', cat: 'learn', col: 'school', cost: 220, work: 24, upkeep: 3, jobs: [['Tutor', 3, 2]], school: { stage: 'tutor', seats: 16 }, blurb: 'After-school help for 16 students. They learn 50% faster.' },
  [T.LIBRARY]: { key: 'library', name: 'Library', cat: 'learn', col: 'school', cost: 260, work: 30, upkeep: 3, jobs: [['Librarian', 2, 2]], visits: { n: 25, who: 'all', study: 0.2 }, blurb: 'A quiet evening out. Students who visit learn a little faster.' },

  [T.CLINIC]: { key: 'clinic', name: 'Clinic', cat: 'care', col: 'hall', cost: 300, work: 36, upkeep: 6, jobs: [['Nurse', 2, 2], ['Doctor', 3, 1]], care: { kind: 'clinic', n: 6 }, blurb: 'Treats 6 sick people a day before illness gets serious.' },
  [T.HOSPITAL]: { key: 'hospital', name: 'Hospital', cat: 'care', col: 'hall', cost: 900, work: 100, upkeep: 16, jobs: [['Nurse', 2, 5], ['Doctor', 3, 3]], care: { kind: 'hospital', n: 12 }, minPop: 40, blurb: 'Treats serious illness and injuries. Births are safer.' },
  [T.POLICE]: { key: 'police', name: 'Police station', cat: 'care', col: 'hall', cost: 380, work: 40, upkeep: 7, jobs: [['Officer', 2, 4]], radius: 8, blurb: 'Cuts crime for homes within 8 tiles and catches offenders.' },
  [T.FIRE]: { key: 'fire', name: 'Fire station', cat: 'care', col: 'hall', cost: 360, work: 40, upkeep: 6, jobs: [['Firefighter', 2, 4]], radius: 8, blurb: 'Fires within 8 tiles do far less damage.' },
  [T.COURT]: { key: 'court', name: 'Courthouse', cat: 'care', col: 'hall', cost: 520, work: 60, upkeep: 8, jobs: [['Clerk', 2, 2], ['Judge', 3, 1]], cases: 3, needs: T.POLICE, blurb: 'Hears 3 cases a day. Without one, cases pile up and people feel unsafe.' },
  [T.CEMETERY]: { key: 'cemetery', name: 'Cemetery', cat: 'care', col: 'park', cost: 150, work: 12, upkeep: 1, jobs: [['Groundskeeper', 0, 1]], graves: 40, blurb: 'A resting place for 40. Families grieve longer without one.' },

  [T.PARK]: { key: 'park', name: 'Park', cat: 'fun', col: 'park', cost: 80, work: 6, upkeep: 1, visits: { n: 30, who: 'all' }, blurb: 'Homes within 3 tiles are happier. Somewhere to go for anyone.' },
  [T.PLAYGROUND]: { key: 'playground', name: 'Playground', cat: 'fun', col: 'park', cost: 90, work: 8, upkeep: 1, visits: { n: 20, who: 'kids' }, blurb: 'Fun for 20 children a day.' },
  [T.SPORTS]: { key: 'sports', name: 'Sports field', cat: 'fun', col: 'park', cost: 260, work: 24, upkeep: 3, jobs: [['Coach', 1, 1]], visits: { n: 30, who: 'active', health: 2, injury: 0.004 }, blurb: 'Team sport for 30 a day. Healthier people, the odd injury.' },
  [T.GYM]: { key: 'gym', name: 'Gym', cat: 'fun', col: 'park', cost: 240, work: 26, upkeep: 3, jobs: [['Trainer', 2, 2]], visits: { n: 20, who: 'adults', health: 2, injury: 0.002 }, blurb: 'Keeps 20 adults a day fit.' },
  [T.DOJO]: { key: 'dojo', name: 'Martial arts dojo', cat: 'fun', col: 'park', cost: 220, work: 24, upkeep: 3, jobs: [['Sensei', 2, 1]], visits: { n: 16, who: 'active', health: 2, injury: 0.003, discipline: true }, blurb: 'Fitness and discipline for 16 a day. Members rarely get into trouble.' },
  [T.POOL]: { key: 'pool', name: 'Swimming pool', cat: 'fun', col: 'park', cost: 340, work: 36, upkeep: 5, jobs: [['Lifeguard', 2, 2]], visits: { n: 24, who: 'all', health: 3 }, blurb: 'The healthiest outing in town, for 24 a day.' },
  [T.CINEMA]: { key: 'cinema', name: 'Cinema', cat: 'fun', col: 'shop', cost: 380, work: 40, upkeep: 5, jobs: [['Usher', 0, 3]], visits: { n: 40, who: 'all' }, minPop: 30, blurb: 'A big night out for 40 people a day.' },

  [T.HALL]: { key: 'hall', name: 'Town hall', col: 'hall', cost: 0, work: 0, upkeep: 0, homes: 6, jobs: [['Builder', 0, 3], ['Clerk', 2, 2]], serves: 10 },
  [T.RUBBLE]: { key: 'rubble', name: 'Rubble', cost: 0, work: 0, upkeep: 0 },
};

export const BRUSHES = [T.ROAD, T.PATH, T.RAIL, T.LIGHTS, T.ROUNDABOUT];
export const UTILITY_POP = 25;   // below this, a town gets by without power and water
export const BUS_SEATS = 40;          // riders a bus carries in a day
export const COMMUTE_JOBS = { rail: 10, bus: 5 };   // out-of-town jobs each link to a neighbour opens up
export const BUILDINGS = Object.keys(B).map(Number).filter((t) => B[t].cat);
export const UPGRADABLE = BUILDINGS.filter((t) => ![T.CEMETERY, T.PARK, T.PLAYGROUND, T.STOP].includes(t));
export const MAX_LEVEL = 3;
export const LEVEL = { capacity: [0, 1, 1.75, 2.5], upkeep: [0, 1, 1.6, 2.2], cost: [0, 0, 1, 1.6] };
export const isHome = (t) => !!B[t]?.homes;
export const walkable = (t) => t === T.ROAD || t === T.PATH || t === T.HALL || t === T.XING || t === T.LIGHTS || t === T.ROUNDABOUT;
export const isRoad = (t) => t === T.ROAD || t === T.XING || t === T.LIGHTS || t === T.ROUNDABOUT;
export const isRail = (t) => t === T.RAIL || t === T.XING;

export const GOALS = [
  { id: 'roads10', text: 'Lay 10 road tiles', reward: 100 },
  { id: 'houses3', text: 'Build 3 homes', reward: 150 },
  { id: 'work1', text: 'Open an office or factory', reward: 150 },
  { id: 'shop1', text: 'Open a grocer', reward: 150 },
  { id: 'school1', text: 'Open a primary school', reward: 250 },
  { id: 'pop25', text: 'Reach 25 people', reward: 250 },
  { id: 'clinic1', text: 'Open a clinic', reward: 250 },
  { id: 'land1', text: 'Buy a parcel of land', reward: 150 },
  { id: 'baby1', text: 'Welcome a baby', reward: 200 },
  { id: 'upgrade1', text: 'Upgrade a building', reward: 300 },
  { id: 'fun3', text: 'Open 3 leisure places', reward: 300 },
  { id: 'police1', text: 'Open a police station', reward: 300 },
  { id: 'transit1', text: 'Get people riding a bus or train', reward: 400 },
  { id: 'happy75', text: 'Keep 30+ people at 75% mood', reward: 400 },
  { id: 'grad1', text: 'See a university graduate', reward: 500 },
  { id: 'days10', text: 'Keep your city running 10 days', reward: 500 },
  { id: 'pop100', text: 'Reach 100 people', reward: 800 },
  { id: 'days30', text: 'Keep your city running 30 days', reward: 1500 },
];

// Policies the mayor can set. Tax raises income but lowers mood; funding scales every service.
export const POLICY = { tax: [0.8, 1.3], funding: [0.7, 1.2] };
export const WANT_REWARD = 120;
export const GOODS_PER_FACTORY = 20;   // goods a staffed factory makes a day
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const SEASON_DAYS = 10;         // world days per season

// Decisions the council puts to the mayor now and then. Each choice: [label, effect text].
export const DECISIONS = [
  { id: 'festival', title: 'A summer festival?', text: 'Residents want a street festival in the square.', a: ['Fund it ($300)', 'Everyone’s mood lifts'], b: ['Not this year', 'A little disappointment'] },
  { id: 'taxcut', title: 'Petition to cut taxes', text: 'Hundreds signed a petition asking for lower taxes.', a: ['Cut tax by 10%', 'Happier people, less income'], b: ['Keep taxes', 'Some grumbling'] },
  { id: 'company', title: 'A company wants to invest', text: 'A firm offers $500 for permission to expand. Locals worry about noise.', a: ['Take the money', '$500, slightly less happy'], b: ['Say no', 'Nothing changes'] },
  { id: 'strike', title: 'Workers threaten to strike', text: 'Unions want a one-off bonus for the city’s workers.', a: ['Pay the bonus ($250)', 'Work carries on'], b: ['Refuse', 'Income drops for 2 days'] },
  { id: 'books', title: 'A gift of books', text: 'A retired teacher offers her library to the town if the council pays to move it.', a: ['Accept ($120)', 'Children learn faster for 5 days'], b: ['Decline', 'Nothing changes'] },
  { id: 'clinic', title: 'Free health checks', text: 'Visiting doctors offer free check-ups if the council hosts them.', a: ['Host them ($150)', 'Sick residents recover'], b: ['Decline', 'Nothing changes'] },
];
export const ELECTION_EVERY = 20;   // days between elections

// Zones, SimCity-style: paint them and private developers build when there's demand. Zoned buildings cost you no upkeep.
export const ZONES = { 1: { key: 'homes', name: 'Homes zone', col: 'rgba(63,167,103,0.30)' }, 2: { key: 'shops', name: 'Shops zone', col: 'rgba(59,125,221,0.28)' }, 3: { key: 'industry', name: 'Industry zone', col: 'rgba(240,150,58,0.30)' } };
export const ZONE_COST = 2;   // per tile painted
