// All tunable numbers live here so balancing never means hunting through logic.

// The shared world everyone starts in. 1.8 started every world afresh again for the new ways a city can fall:
// the open world is 's5', and private worlds made before RESET_AT are no longer listed. Earlier worlds are still
// in the database, just not shown.
export const WORLD_ID = 's5';
// Start of today in UTC, not the user's local calendar date (the world clock, day/night and this cutoff all run
// on UTC - a local "tomorrow" can still be UTC "today", so bumping this by a calendar day too early would hide
// worlds made only hours ago). Check the actual UTC date before changing this on a reset.
export const RESET_AT = Date.UTC(2026, 8, 26);
export const CLASSIC_WORLD = 'public';
// A council can own several cities: buy the plot next to one of yours. Priced like land: this many parcels at your
// current land price, times PLOT_BUY_STEP for each city you already have, and never less than PLOT_BUY_MIN.
// Co-mayors: friends who can run one of your cities. One mayor sits at the "desk" (plays) at a time; the others watch.
// The desk frees up when its holder has been idle this long, or their game stops checking in.
export const MAX_CO = 3, DESK_IDLE_MS = 120000, DESK_STALE_MS = 60000, DESK_BEAT_MS = 20000;
export const PLOT_BUY_PARCELS = 4, PLOT_BUY_STEP = 1.6, PLOT_BUY_MIN = 1000, MAX_CITIES = 9;
export const OPEN_WORLDS = { s5: 'The world' };
export const PLOT = 24;          // tiles per side of a plot
export const GAP = 0;            // tiles between neighbouring plots on the master map: none, so the world is one piece
export const CHUNK = 4;          // land is bought in 4×4 parcels
export const CHUNKS = PLOT / CHUNK;
export const START_CHUNKS = [14, 15, 20, 21];   // the 8×8 around the town hall
export const LAND_PRICE = 150;   // first extra parcel; each one after costs 18% more
export const LAND_STEP = 1.18;
export const MOVE_FEE = 0.25;    // moving a building costs a quarter of its price

export const TICK_MS = 75000;    // 1 tick = 1 in-game hour, so 1 in-game day = 30 real minutes
export const HOURS_PER_DAY = 24;
export const DAWN = 6, DUSK = 22;     // 16 hours of daylight and 8 of night: 20 real minutes of day, 10 of night
export const MAX_OFFLINE_DAYS = 48;   // city days simulated while you're away (24 real hours); after that it waits for you
// Builders work this many times faster than one labour unit an hour, and progress in real time between hours,
// so a house still goes up in seconds even though an hour now lasts 75 seconds.
export const BUILD_SPEED = 30;
export const SAVE_EVERY_MS = 12000;   // others see your city update this often (and straight after you build)

export const START_MONEY = 3000;
export const REBUILD_MONEY = 1500;
export const GRACE_DAYS = 3;
export const VOLUNTEER_RATE = 0.25;
export const RUBBLE_CLEAR_COST = 25;
export const COLLAPSE_UNPAID_DAYS = 10;
// More ways a city can fall, all ending the same way as running out of money does: it falls into ruins, and
// anyone (including you) can rebuild on the rubble. Each counts consecutive bad days, and resets the moment
// the problem is fixed, so a single rough day never ends a city outright.
// A young settlement gets a mood/illness penalty for going without utilities or living with traffic (UTILITY_POP),
// but can't yet fall for it - that starts once it's grown into a proper Town (see HALL_LEVELS), the same size the
// "utilities" hall goal already expects a water tower and a power source by.
export const COLLAPSE_POP = 40;
export const COLLAPSE_WATER_DAYS = 3;          // no water at all, once the city is big enough to need it (COLLAPSE_POP)
export const COLLAPSE_TRAFFIC_DAYS = 3;        // this many days of gridlock this bad in a row
export const COLLAPSE_TRAFFIC_COMMUTE = 0.3;   // "gridlock": the average car trip takes over 3x as long as it should
export const COLLAPSE_DEBT = 1000;             // being at least this far overdrawn...
export const COLLAPSE_DEBT_DAYS = 3;           // ...for this many days running
export const TAP_SHARE = 0.05;
export const TAP_CAP = 0.25;
export const ROAD_CAP = 45;
export const HALL_CAP = 120;

// Two days are a year of life, so a child grows up in about 18 real hours.
export const YEAR_DAYS = 2;
export const ADULT = 18;
export const RETIRE = 65;
export const WAGE = [4, 7, 11];   // daily tax by the education a job needs
export const EDU = ['No schooling', 'Primary', 'High school', 'Degree'];
// Staff you bring in from outside for an open job, by the education the job needs.
export const RECRUIT_COST = [150, 250, 400, 650];
export const FIRED_DAYS = 3;          // someone you let go won't be taken back at the same place for this many days
// Adults can learn the long way: evening classes at a library take this many years per level (none -> primary -> high school -> degree).
export const ADULT_STUDY_YEARS = [2, 3, 4];
export const TRAINING_YEARS = 5;      // years of work that count as a level of training, up to high school

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
  SOLAR: 42, WIND: 43, MUSEUM: 44, STADIUM: 45, HOTEL: 46, FARM: 47, HARBOUR: 48, AIRPORT: 49, LANDFILL: 50, RECYCLE: 51, SEWAGE: 52, VET: 53, METRO: 54, MONUMENT: 55,
  ORCHARD: 56, DAIRY: 57, RANCH: 58, MATERIALS: 59, WAREHOUSE: 60,
  QUARRY: 61, POULTRY: 62, STORE: 63, COALMINE: 64,
};

export const CATS = [
  ['homes', 'Homes'], ['work', 'Work and shops'], ['learn', 'Education'], ['care', 'Health and safety'], ['fun', 'Leisure and sport'], ['transport', 'Transport'], ['utility', 'Utilities'],
];

// Every building has a job. jobs: [title, education needed, count]. col: which colour slot it uses.
// school: stage + seats. care: clinic | hospital + patients a day. visits: people a day for leisure.
export const B = {
  [T.ROAD]: { key: 'road', name: 'Road', cost: 10, work: 1, upkeep: 0.2, blurb: 'Cars, bikes and walkers. Jams above 45 car trips a day.' },
  [T.PATH]: { key: 'path', name: 'Footpath', cost: 5, work: 1, upkeep: 0.1, blurb: 'Walkers and bikes only. Takes cars off the road.' },
  [T.XING]: { key: 'crossing', name: 'Level crossing', cost: 30, work: 2, upkeep: 0.5, blurb: 'Where a road and a railway meet. Cars wait while trains pass.' },
  [T.LIGHTS]: { key: 'lights', name: 'Traffic lights', cost: 80, work: 4, upkeep: 1, blurb: 'Put on a junction. Carries 50% more traffic than an uncontrolled junction.' },
  [T.ROUNDABOUT]: { key: 'roundabout', name: 'Roundabout', cost: 150, work: 8, upkeep: 1.5, blurb: 'Put on a junction. Keeps traffic flowing: 80% more than an uncontrolled junction.' },
  [T.POWER]: { key: 'power', makes: { power: 120 }, name: 'Power station', cat: 'utility', col: 'work', cost: 700, work: 70, upkeep: 12, jobs: [['Engineer', 2, 3]], supply: 12, pollution: 2, power: true, fossil: true, smog: 0.12, blurb: 'Powers every building within 12 tiles, but burns fuel: dirty air and noise. Once the town has 25 people, unpowered buildings work at 60%.' },
  [T.SOLAR]: { key: 'solar', makes: { power: 60 }, name: 'Solar farm', cat: 'utility', col: 'work', cost: 560, work: 50, upkeep: 4, jobs: [['Technician', 1, 1]], supply: 9, power: true, blurb: 'Clean power for everything within 9 tiles. No smoke, no noise.' },
  [T.WIND]: { key: 'wind', makes: { power: 60 }, name: 'Wind turbine', cat: 'utility', col: 'work', cost: 480, work: 44, upkeep: 3, jobs: [['Technician', 1, 1]], supply: 11, power: true, pollution: 1, blurb: 'Clean power for everything within 11 tiles. A gentle hum: homes right beside it mind a little.' },
  [T.WATER]: { key: 'water', name: 'Water tower', cat: 'utility', col: 'work', cost: 350, work: 36, upkeep: 5, jobs: [['Technician', 1, 1]], supply: 10, water: true, makes: { water: 80 }, blurb: 'Clean water for every building within 10 tiles. Without it, illness spreads faster.' },
  [T.LANDFILL]: { key: 'landfill', name: 'Landfill', cat: 'utility', col: 'work', cost: 240, work: 24, upkeep: 3, jobs: [['Refuse collector', 0, 2]], waste: 70, pollution: 2, smog: 0.02, blurb: 'Takes the rubbish of 70 people. Smelly: homes nearby are less happy.' },
  [T.RECYCLE]: { key: 'recycle', name: 'Recycling centre', cat: 'utility', col: 'work', cost: 520, work: 50, upkeep: 5, jobs: [['Sorter', 0, 3], ['Manager', 2, 1]], waste: 120, sells: 0.3, blurb: 'Takes the rubbish of 120 people with no smell, and sells what it sorts.' },
  [T.SEWAGE]: { key: 'sewage', name: 'Sewage works', cat: 'utility', col: 'work', cost: 620, work: 60, upkeep: 6, jobs: [['Technician', 1, 2]], sewage: 150, pollution: 1, blurb: 'Treats the sewage of 150 people. Without it, once the town passes 70, illness spreads.' },
  [T.DRAIN]: { key: 'drain', name: 'Storm drains', cat: 'utility', col: 'work', cost: 260, work: 24, upkeep: 3, supply: 8, blurb: 'Protects everything within 8 tiles from floods after heavy rain.' },
  [T.RAIL]: { key: 'rail', name: 'Railway', cost: 25, work: 2, upkeep: 0.5, blurb: 'Track for trains. Join stations together, or run it to your plot edge to reach a neighbour.' },

  [T.STOP]: { key: 'stop', name: 'Bus stop', cat: 'transport', col: 'hall', cost: 60, work: 6, upkeep: 1, catchment: 4, needs: T.DEPOT, blurb: 'People within 4 tiles ride the bus instead of driving. Needs a bus depot.' },
  [T.DEPOT]: { key: 'depot', name: 'Bus depot', cat: 'transport', col: 'hall', cost: 420, work: 44, upkeep: 7, jobs: [['Bus driver', 1, 4]], blurb: 'Each driver runs one bus between your stops. Every bus holds 40 riders a day.' },
  [T.HARBOUR]: { key: 'harbour', name: 'Harbour', cat: 'transport', col: 'hall', cost: 900, work: 90, upkeep: 9, jobs: [['Dock worker', 0, 8], ['Harbourmaster', 2, 1]], draw: 8, minPop: 30, shore: true, blurb: 'Build it on the water’s edge. Cruise visitors come ashore, and it’s the best place to trade with the rest of the world.' },
  [T.AIRPORT]: { key: 'airport', name: 'Airport', cat: 'transport', col: 'hall', cost: 3200, work: 260, upkeep: 30, jobs: [['Pilot', 3, 2], ['Ground crew', 1, 8]], draw: 45, minPop: 150, flat: true, pollution: 3, smog: 0.04, blurb: 'Flights bring crowds of tourists and lift trade. Loud: keep homes away. Needs flat land.' },
  [T.METRO]: { key: 'metro', name: 'Metro station', cat: 'transport', col: 'hall', cost: 1100, work: 110, upkeep: 12, jobs: [['Metro driver', 1, 2], ['Station staff', 0, 2]], catchment: 6, seats: 70, research: 'metro', blurb: 'Underground trains between every staffed metro station: no track to lay, no traffic. People within 6 tiles ride. Needs two stations and the Metro research.' },
  [T.STATION]: { key: 'station', name: 'Train station', cat: 'transport', col: 'hall', cost: 600, work: 60, upkeep: 8, jobs: [['Station staff', 1, 3]], catchment: 5, minPop: 20, blurb: 'People within 5 tiles take the train on long trips. Put it next to a railway.' },

  [T.HOUSE]: { key: 'house', name: 'House', cat: 'homes', col: 'house', cost: 120, work: 16, upkeep: 2, homes: 6, blurb: 'Homes for 6 people.' },
  [T.APARTMENT]: { key: 'apartment', name: 'Apartments', cat: 'homes', col: 'house', cost: 420, work: 50, upkeep: 6, homes: 24, minPop: 30, homeMood: -0.03, blurb: 'Homes for 24. A little cramped.' },
  [T.VILLA]: { key: 'villa', name: 'Villa', cat: 'homes', col: 'house', cost: 380, work: 36, upkeep: 5, homes: 4, homeMood: 0.08, blurb: 'Homes for 4 with a garden. Residents are happier.' },

  [T.WORK]: { key: 'work', name: 'Office', cat: 'work', col: 'work', cost: 220, work: 30, upkeep: 4, jobs: [['Clerk', 1, 8], ['Manager', 3, 2]], blurb: 'Office jobs for people with schooling.' },
  [T.SHOP]: { key: 'shop', name: 'Grocer', cat: 'work', col: 'shop', cost: 160, work: 20, upkeep: 3, jobs: [['Shop assistant', 0, 3]], serves: 30, blurb: 'Food for 30 people. Every household needs one nearby.' },
  [T.CAFE]: { key: 'cafe', name: 'Café', cat: 'work', col: 'shop', cost: 180, work: 20, upkeep: 3, jobs: [['Barista', 0, 3]], visits: { n: 20, who: 'all' }, blurb: 'Jobs, plus somewhere to go in the evening.' },
  [T.FACTORY]: { key: 'factory', name: 'Factory', cat: 'work', col: 'work', cost: 300, work: 40, upkeep: 5, jobs: [['Factory hand', 0, 14], ['Engineer', 3, 1]], pollution: 3, smog: 0.05, injury: 0.004, makesProducts: true, blurb: 'Pick a recipe once you’ve researched it, and it turns raw resources into a product to sell in a Store or trade. Noisy: homes within 3 tiles are less happy.' },
  [T.FARM]: { key: 'farm', name: 'Urban farm', cat: 'work', col: 'park', cost: 200, work: 22, upkeep: 2, jobs: [['Farmhand', 0, 4]], serves: 15, fresh: 0.02, makes: { vegetables: 25 }, blurb: 'Grows fresh vegetables for 15 people and cleans the air a little.' },
  [T.HOTEL]: { key: 'hotel', name: 'Hotel', cat: 'work', col: 'shop', cost: 520, work: 56, upkeep: 6, jobs: [['Receptionist', 1, 3], ['Housekeeper', 0, 3]], rooms: 30, minPop: 40, blurb: 'Rooms for 30 tourists a night. Attractions only bring overnight visitors if they have somewhere to stay.' },
  [T.YARD]: { key: 'yard', name: "Builder's yard", cat: 'work', col: 'work', cost: 260, work: 30, upkeep: 4, jobs: [['Builder', 0, 6]], blurb: 'Hires 6 builders, so construction goes faster.' },

  [T.DAYCARE]: { key: 'daycare', name: 'Daycare', cat: 'learn', col: 'school', cost: 200, work: 24, upkeep: 4, jobs: [['Carer', 2, 2]], school: { stage: 'daycare', seats: 10 }, blurb: 'Minds 10 children under 5 so both parents can work.' },
  [T.SCHOOL]: { key: 'school', name: 'Primary school', cat: 'learn', col: 'school', cost: 320, work: 40, upkeep: 6, jobs: [['Teacher', 3, 2]], school: { stage: 'primary', seats: 20 }, blurb: '20 seats for children aged 5 to 11.' },
  [T.HIGH]: { research: 'highschool', key: 'high', name: 'High school', cat: 'learn', col: 'school', cost: 480, work: 60, upkeep: 8, jobs: [['Teacher', 3, 3]], school: { stage: 'high', seats: 24 }, minPop: 25, blurb: '24 seats for teenagers. Graduates can get skilled jobs.' },
  [T.UNI]: { research: 'university', key: 'uni', name: 'University', cat: 'learn', col: 'school', cost: 900, work: 110, upkeep: 14, jobs: [['Lecturer', 3, 4]], school: { stage: 'uni', seats: 20 }, minPop: 60, needs: T.HIGH, blurb: 'Turns high school graduates into doctors, teachers and managers.' },
  [T.TUTOR]: { key: 'tutor', name: 'Tutoring centre', cat: 'learn', col: 'school', cost: 220, work: 24, upkeep: 3, jobs: [['Tutor', 3, 2]], school: { stage: 'tutor', seats: 16 }, blurb: 'After-school help for 16 students. They learn 50% faster.' },
  [T.LIBRARY]: { key: 'library', name: 'Library', cat: 'learn', col: 'school', cost: 260, work: 30, upkeep: 3, jobs: [['Librarian', 2, 2]], visits: { n: 25, who: 'all', study: 0.2 }, blurb: 'A quiet evening out. Students who visit learn a little faster.' },

  [T.CLINIC]: { key: 'clinic', name: 'Clinic', cat: 'care', col: 'hall', cost: 300, work: 36, upkeep: 6, jobs: [['Nurse', 2, 2], ['Doctor', 3, 1]], care: { kind: 'clinic', n: 6 }, blurb: 'Treats 6 sick people a day before illness gets serious.' },
  [T.HOSPITAL]: { key: 'hospital', name: 'Hospital', cat: 'care', col: 'hall', cost: 900, work: 100, upkeep: 16, jobs: [['Nurse', 2, 5], ['Doctor', 3, 3]], care: { kind: 'hospital', n: 12 }, minPop: 40, blurb: 'Treats serious illness and injuries. Births are safer.' },
  [T.POLICE]: { key: 'police', name: 'Police station', cat: 'care', col: 'hall', cost: 380, work: 40, upkeep: 7, jobs: [['Officer', 2, 4]], radius: 8, blurb: 'Cuts crime for homes within 8 tiles and catches offenders.' },
  [T.FIRE]: { key: 'fire', name: 'Fire station', cat: 'care', col: 'hall', cost: 360, work: 40, upkeep: 6, jobs: [['Firefighter', 2, 4]], radius: 8, blurb: 'Fires within 8 tiles do far less damage.' },
  [T.COURT]: { key: 'court', name: 'Courthouse', cat: 'care', col: 'hall', cost: 520, work: 60, upkeep: 8, jobs: [['Clerk', 2, 2], ['Judge', 3, 1]], cases: 3, needs: T.POLICE, blurb: 'Hears 3 cases a day. Without one, cases pile up and people feel unsafe.' },
  [T.VET]: { key: 'vet', name: 'Vet', cat: 'care', col: 'hall', cost: 220, work: 24, upkeep: 3, jobs: [['Vet', 3, 1], ['Nurse', 1, 1]], radius: 10, blurb: 'Looks after the pets of every home within 10 tiles. Pet owners worry without one.' },
  [T.CEMETERY]: { key: 'cemetery', name: 'Cemetery', cat: 'care', col: 'park', cost: 150, work: 12, upkeep: 1, jobs: [['Groundskeeper', 0, 1]], graves: 40, blurb: 'A resting place for 40. Families grieve longer without one.' },

  [T.PARK]: { key: 'park', name: 'Park', cat: 'fun', col: 'park', cost: 80, work: 6, upkeep: 1, visits: { n: 30, who: 'all' }, blurb: 'Homes within 3 tiles are happier. Somewhere to go for anyone.' },
  [T.PLAYGROUND]: { key: 'playground', name: 'Playground', cat: 'fun', col: 'park', cost: 90, work: 8, upkeep: 1, visits: { n: 20, who: 'kids' }, blurb: 'Fun for 20 children a day.' },
  [T.SPORTS]: { key: 'sports', name: 'Sports field', cat: 'fun', col: 'park', cost: 260, work: 24, upkeep: 3, jobs: [['Coach', 1, 1]], visits: { n: 30, who: 'active', health: 2, injury: 0.004 }, blurb: 'Team sport for 30 a day. Healthier people, the odd injury.' },
  [T.GYM]: { key: 'gym', name: 'Gym', cat: 'fun', col: 'park', cost: 240, work: 26, upkeep: 3, jobs: [['Trainer', 2, 2]], visits: { n: 20, who: 'adults', health: 2, injury: 0.002 }, blurb: 'Keeps 20 adults a day fit.' },
  [T.DOJO]: { key: 'dojo', name: 'Martial arts dojo', cat: 'fun', col: 'park', cost: 220, work: 24, upkeep: 3, jobs: [['Sensei', 2, 1]], visits: { n: 16, who: 'active', health: 2, injury: 0.003, discipline: true }, blurb: 'Fitness and discipline for 16 a day. Members rarely get into trouble.' },
  [T.POOL]: { key: 'pool', name: 'Swimming pool', cat: 'fun', col: 'park', cost: 340, work: 36, upkeep: 5, jobs: [['Lifeguard', 2, 2]], visits: { n: 24, who: 'all', health: 3 }, blurb: 'The healthiest outing in town, for 24 a day.' },
  [T.CINEMA]: { key: 'cinema', name: 'Cinema', cat: 'fun', col: 'shop', cost: 380, work: 40, upkeep: 5, jobs: [['Usher', 0, 3]], visits: { n: 40, who: 'all' }, minPop: 30, blurb: 'A big night out for 40 people a day.' },

  [T.MUSEUM]: { key: 'museum', name: 'Museum', cat: 'fun', col: 'school', cost: 640, work: 70, upkeep: 7, jobs: [['Curator', 3, 1], ['Guide', 2, 2]], visits: { n: 30, who: 'all', study: 0.2 }, draw: 12, minPop: 50, blurb: 'Culture for 30 a day. Draws tourists, and students who visit learn a little faster.' },
  [T.STADIUM]: { key: 'stadium', name: 'Stadium', cat: 'fun', col: 'park', cost: 1400, work: 150, upkeep: 16, jobs: [['Groundskeeper', 0, 4], ['Coach', 2, 2]], visits: { n: 90, who: 'all' }, draw: 30, minPop: 90, blurb: 'Match days for 90 residents and crowds of fans from out of town. Busy roads on game night.' },

  [T.ORCHARD]: { key: 'orchard', name: 'Orchard', cat: 'work', col: 'park', cost: 220, work: 22, upkeep: 2, jobs: [['Fruit picker', 0, 4]], makes: { fruit: 25 }, fresh: 0.02, research: 'orchards', blurb: 'Grows 25 crates of fruit a day. Trees clean the air a little.' },
  [T.DAIRY]: { key: 'dairy', name: 'Dairy farm', cat: 'work', col: 'park', cost: 300, work: 28, upkeep: 3, jobs: [['Dairy hand', 0, 4], ['Vet nurse', 1, 1]], makes: { dairy: 25 }, pollution: 1, research: 'dairy', blurb: 'Milk, cheese and yoghurt for 25 people a day. A little smelly for homes right beside it.' },
  [T.RANCH]: { key: 'ranch', name: 'Ranch', cat: 'work', col: 'park', cost: 340, work: 30, upkeep: 3, jobs: [['Rancher', 0, 5]], makes: { meat: 20 }, pollution: 1, research: 'ranching', blurb: 'Meat for 20 people a day. Needs space; homes right beside it mind the smell.' },
  [T.MATERIALS]: { key: 'sawmill', name: 'Sawmill', cat: 'work', col: 'work', cost: 280, work: 30, upkeep: 4, jobs: [['Sawyer', 0, 6], ['Engineer', 2, 1]], makes: { wood: 32 }, pollution: 2, smog: 0.02, blurb: 'Cuts 32 loads of timber a day. With wood or metal in stock, builders work 50% faster.' },
  [T.QUARRY]: { key: 'quarry', name: 'Quarry', cat: 'work', col: 'work', cost: 320, work: 34, upkeep: 5, jobs: [['Quarry worker', 0, 6], ['Engineer', 2, 1]], makes: { metal: 22, stone: 14 }, pollution: 2, smog: 0.03, blurb: 'Digs 22 loads of ore and metal and 14 of stone a day. With wood or metal in stock, builders work 50% faster.' },
  [T.POULTRY]: { key: 'poultry', name: 'Poultry farm', cat: 'work', col: 'park', cost: 240, work: 22, upkeep: 2, jobs: [['Poultry keeper', 0, 4]], makes: { eggs: 22 }, pollution: 1, research: 'poultry', blurb: 'Eggs for 22 people a day.' },
  [T.COALMINE]: { key: 'coalmine', name: 'Coal mine', cat: 'work', col: 'work', cost: 300, work: 32, upkeep: 5, jobs: [['Miner', 0, 6], ['Engineer', 2, 1]], makes: { coal: 20 }, pollution: 2, smog: 0.03, blurb: 'Digs 20 loads of coal a day, for trade or for turning into bricks once you have the Masonry research.' },
  [T.WAREHOUSE]: { key: 'warehouse', name: 'Storage yard', cat: 'work', col: 'work', cost: 200, work: 20, upkeep: 2, jobs: [['Storekeeper', 0, 2]], store: 600, research: 'logistics', blurb: 'Stores 600 more of every resource and product, to use later or sell.' },
  [T.STORE]: { key: 'store', name: 'Store', cat: 'work', col: 'shop', cost: 260, work: 26, upkeep: 3, jobs: [['Shopkeeper', 0, 3]], sellsProducts: true, research: 'retail', blurb: 'Sells the products your factories make straight to your own residents, at a better price than the Market pays.' },
  [T.MONUMENT]: { key: 'monument', name: 'Monument', cat: 'fun', col: 'hall', cost: 2600, work: 200, upkeep: 6, visits: { n: 40, who: 'all' }, draw: 25, minPop: 80, blurb: 'A grand landmark for 40 visitors a day. Tourists come to see it, and the whole street becomes a sought-after address.' },
  [T.HALL]: { key: 'hall', name: 'Town hall', col: 'hall', cost: 0, work: 0, upkeep: 0, homes: 6, jobs: [['Builder', 0, 3], ['Clerk', 2, 2]], serves: 10 },
  [T.RUBBLE]: { key: 'rubble', name: 'Rubble', cost: 0, work: 0, upkeep: 0 },
};

// Tourism: attractions draw visitors; each night's stay earns the city money. Without hotels only day-trippers come.
export const TOURIST_SPEND = { day: 3, night: 8 };
export const DAYTRIP_SHARE = 0.25;
// Loans. The rating decides how much the bank lends and what it charges each day.
export const LOANS = { A: { max: 6000, rate: 0.004 }, B: { max: 3500, rate: 0.007 }, C: { max: 1500, rate: 0.012 }, D: { max: 0, rate: 0 } };
export const LOAN_DAYS = 40;           // a loan is paid back in equal daily parts over this many days
export const CARBON_TAX = 6;           // per fossil power station or factory, per day
export const CONGESTION_FEE = 0.4;     // per car trip, per day
// Land value and property tax. Value runs 0..1 per tile; tax is dollars per resident per day at full value.
export const PROPERTY_TAX = [0, 0.4, 0.8];   // off | low | high
export const RENT_SQUEEZE = 0.72;            // above this land value, families without schooling feel the rent
export const MILESTONES = [25, 50, 100, 200, 300, 500];
// Town hall levels: how big your city is. The hall upgrades itself once the city has the people, has met the
// objectives and has the resources in store (the upgrade uses them). Each level lets you buy more land (parcels),
// store more of everything, earn more research a day, and grows the hall (more builders and clerks).
export const HALL_LEVELS = [
  { name: 'Settlement', pop: 0, goals: [], res: {}, land: 8, rp: 1, store: 0 },
  { name: 'Village', pop: 15, goals: [['roads', 'Lay 10 road tiles'], ['homes', 'Build 3 homes'], ['work', 'Open an office or a factory'], ['shop', 'Open a grocer']], res: {}, land: 12, rp: 2, store: 100 },
  { name: 'Town', pop: 40, goals: [['school', 'Open a primary school'], ['farm', 'Build an urban farm'], ['harvest', 'Collect a harvest: tap a building with a bubble'], ['utilities', 'Build a water tower and a power source']], res: { wood: 40 }, land: 16, rp: 3, store: 200 },
  { name: 'Large town', pop: 80, goals: [['materials', 'Build a sawmill or a quarry'], ['tech2', 'Research 2 technologies'], ['trade1', 'Make a trade on the Market'], ['clinic', 'Open a clinic']], res: { wood: 80, metal: 40, vegetables: 60 }, land: 22, rp: 4, store: 300 },
  { name: 'City', pop: 150, goals: [['highschool', 'Open a high school'], ['invest', 'Own shares in another city, or list your own'], ['land3', 'Buy 3 parcels of land'], ['happy60', 'Keep mood at 60% or more']], res: { wood: 150, metal: 100, vegetables: 120, fruit: 60 }, land: 28, rp: 6, store: 400 },
  { name: 'Large city', pop: 250, goals: [['uni', 'Open a university'], ['cities2', 'Found a second city'], ['link', 'Link a road or railway with a neighbour (or make 5 trades)'], ['tech6', 'Research 6 technologies']], res: { wood: 260, metal: 190, vegetables: 200, dairy: 100 }, land: 36, rp: 8, store: 600 },
  { name: 'Metropolis', pop: 500, goals: [['monument', 'Build a monument'], ['happy70', 'Keep mood at 70% or more'], ['alliance', 'Be in an alliance']], res: { wood: 500, metal: 400, vegetables: 300, meat: 150 }, land: 36, rp: 12, store: 900 },
];
// Styles: the look of the interface and the city. A new one unlocks as the town hall grows (hall: level index);
// players can switch between any they've unlocked. cols: building colours; map: ground, roads and walls.
export const STYLES = [
  { id: 'frontier', name: 'Frontier', hall: 0, note: 'Parchment, timber and clay roofs: a new settlement.',
    cols: { house: '#c8553d', work: '#8a6a4b', shop: '#d9a441', school: '#6b8f3a', park: '#5e8c3a', hall: '#7a4e2d' },
    map: { bg: '#d9cfa8', bg2: '#cfc39a', top: '#b7cf7c', top2: '#afc873', side: '#9a8558', side2: '#86714a', soil: '#8a6a44', soil2: '#765a3a', wall: '#efdfbd', stone: '#e3d2ac',
      road: '#9a8566', mark: '#efe3c5', pave: '#d9c9a3', glass: '#e7d8a8', water: '#4f9fc7', shore: '#e6d3a1', wildTree: '#4d7f3a', hill: '#a6c26f', hill2: '#9fbb68' } },
  { id: 'township', name: 'Township', hall: 2, note: 'Brick, slate and painted wood: a proper town.',
    cols: { house: '#b5523b', work: '#4f6d8a', shop: '#c9803a', school: '#d6a73e', park: '#4f9a52', hall: '#5a4a8a' },
    map: { wall: '#f4ecdf', stone: '#e6ddcc', road: '#6d6a66', pave: '#d6d0c4' } },
  { id: 'modern', name: 'Modern', hall: 4, note: 'Glass, white walls and clean lines: a city.',
    cols: { house: '#8e8e93', work: '#5e9cd3', shop: '#ff9f0a', school: '#ffd60a', park: '#34c759', hall: '#5856d6' },
    map: { bg: '#e8eef0', bg2: '#dfe6e9', top: '#b8dca4', top2: '#b1d69c', side: '#a4b3ad', side2: '#94a39d', wall: '#ffffff', stone: '#f2f2f4', road: '#6e6e73', mark: '#ffffff', pave: '#e5e5ea', glass: '#c7e3ff', water: '#64b5f6', shore: '#e9e4d8' } },
  { id: 'skyline', name: 'Skyline', hall: 6, dark: true, note: 'Glass towers at dusk: a metropolis.',
    cols: { house: '#636366', work: '#0a84ff', shop: '#ff9f0a', school: '#ffd60a', park: '#30d158', hall: '#bf5af2' },
    map: { bg: '#10151c', bg2: '#0b0f14', road: '#2c2c2e', glass: '#64d2ff', wall: '#d1d1d6', water: '#1f4b6e' } },
];
// What opens each feature: a technology, or a town hall level (index into HALL_LEVELS).
export const FEATURE_NEEDS = { market: { tech: 'trade' }, shares: { tech: 'finance' }, region: { tech: 'diplomacy' }, co: { hall: 3 }, council: { hall: 4 } };
export const QUAKE_CHANCE = 0.006;     // per day
export const TORNADO_CHANCE = 0.012;   // per day in spring and summer storms
// Badges shown on the map and in leaderboards.
export const BADGES = [
  { id: 'green', name: 'Green City', test: (s) => s.pop >= 30 && s.green >= 0.8 && s.air >= 0.8 },
  { id: 'happy', name: 'Happy City', test: (s) => s.pop >= 30 && s.happiness >= 0.75 },
  { id: 'transit', name: 'Transit City', test: (s) => s.pop >= 40 && s.riders >= s.pop * 0.2 },
  { id: 'culture', name: 'Tourist Magnet', test: (s) => s.tourists >= 20 },
  { id: 'big', name: 'Metropolis', test: (s) => s.pop >= 200 },
];
// Weekly world challenges: everyone in a world works toward one goal. n = cities with 10+ people.
// value(plots) sums or averages the public city summaries; mine(summary) says whether your city helped.
export const WEEKLY = [
  { id: 'pop', text: 'Grow the whole world to {goal} residents', goal: (n) => Math.max(150, n * 60), value: (ps) => ps.reduce((a, p) => a + (p.pop || 0), 0), mine: (m) => m.pop >= 20, fmt: (v) => Math.round(v).toLocaleString() },
  { id: 'green', text: 'Average clean power across the world above {goal}', goal: () => 0.7, value: (ps) => ps.length ? ps.reduce((a, p) => a + (p.green ?? 1), 0) / ps.length : 0, mine: (m) => m.pop >= 20 && m.green >= 0.7, pct: true },
  { id: 'happy', text: 'Average mood across the world above {goal}', goal: () => 0.65, value: (ps) => ps.length ? ps.reduce((a, p) => a + (p.happiness || 0), 0) / ps.length : 0, mine: (m) => m.pop >= 20 && m.happiness >= 0.65, pct: true },
  { id: 'tourists', text: 'Welcome {goal} tourists a day across the world', goal: (n) => Math.max(40, n * 15), value: (ps) => ps.reduce((a, p) => a + (p.tourists || 0), 0), mine: (m) => m.tourists >= 5, fmt: (v) => Math.round(v) },
  { id: 'transit', text: 'Get {goal} people riding buses and trains each day', goal: (n) => Math.max(40, n * 12), value: (ps) => ps.reduce((a, p) => a + (p.riders || 0), 0), mine: (m) => m.riders >= 8, fmt: (v) => Math.round(v) },
];
export const WEEKLY_REWARD = 600;
export const GIFT_LIMITS = { send: 1000, receive: 2000 };   // per real day
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮'];
// Terrain: 0 land, 1 hill, 2 water. Bridges cost more; hills cost more to build on but have views.
export const TERRAIN = { bridge: 4, hill: 1.4, maxWater: 0.35, sea: 0.2, river: 0.028, hills: 0.65 };
// Daily challenges: one small goal a day for your own city, picked the same for everyone.
export const DAILY = [
  { id: 'build5', text: 'Start 5 new buildings', n: 5, of: (s, b) => s.counters.built - b.built },
  { id: 'babies', text: 'Welcome 2 babies', n: 2, of: (s, b) => s.counters.births - b.births },
  { id: 'grow', text: 'Gain 8 residents', n: 8, of: (s, b) => s.people.length - b.pop },
  { id: 'mood', text: 'Get mood to 70% or more', n: 1, of: (s) => (s.happiness >= 0.7 ? 1 : 0) },
  { id: 'treat', text: 'Treat 5 patients', n: 5, of: (s, b) => s.counters.treated - b.treated },
  { id: 'land', text: 'Buy a parcel of land', n: 1, of: (s, b) => s.counters.land - b.land },
  { id: 'upgrade', text: 'Upgrade 2 buildings', n: 2, of: (s, b) => s.lv.reduce((a, l) => a + (l > 1 ? l - 1 : 0), 0) - b.levels },
  { id: 'grads', text: 'See a graduation', n: 1, of: (s, b) => s.counters.graduates - b.graduates },
];
export const DAILY_REWARD = 200;
// Mayor level from lifetime play; each level unlocks more town hall flag colours.
export const FLAG_UNLOCKS = [[1, '#ffc933'], [1, '#f0963a'], [1, '#e0588e'], [1, '#8a5bd6'], [1, '#3b7ddd'], [1, '#2f9e5a'], [3, '#e04b3c'], [5, '#12a4a4'], [8, '#1f2a30'], [12, '#ffffff'], [16, '#ff7ad9'], [20, '#c9a227']];
// Residents' traits and pets are worked out from their id, so old saves get them for free.
export const TRAITS = [
  { id: 'none', name: 'Easy-going' },
  { id: 'sporty', name: 'Sporty', note: 'Loves sport and the gym' },
  { id: 'bookish', name: 'Bookish', note: 'Happiest at the library or museum; learns faster' },
  { id: 'owl', name: 'Night owl', note: 'Needs a good night out more than most' },
  { id: 'homebody', name: 'Homebody', note: 'Happy with a quiet night in' },
  { id: 'green', name: 'Nature lover', note: 'Cares a lot about clean air and parks' },
];
export const PET_SHARE = 0.4;              // share of households with a pet
export const PENSION = 1;                  // dollars a day per retiree
export const WASTE_POP = 45, SEWAGE_POP = 70;   // from this many people, rubbish and sewage need handling
// Research: educated residents and libraries earn research points; each project unlocks or improves something.
// The technology tree: each branch unlocks in order (needs). Research points come from graduates, libraries,
// universities and museums.
export const TECH_BRANCHES = [['education', 'Education'], ['commerce', 'Commerce'], ['farming', 'Farming'], ['industry', 'Industry'], ['energy', 'Energy and transport'], ['society', 'Society']];
export const TECH = [
  { id: 'highschool', branch: 'education', name: 'High schools', cost: 10, text: 'Unlocks high schools: teenagers finish school and can go on to work that needs it.' },
  { id: 'university', branch: 'education', name: 'Universities', cost: 30, needs: 'highschool', text: 'Unlocks universities: degrees for doctors, engineers and teachers.' },
  { id: 'trade', branch: 'commerce', name: 'Trade', cost: 10, text: 'Opens the Market: buy and sell resources at the world’s prices, trade with other mayors, lend and borrow.' },
  { id: 'finance', branch: 'commerce', name: 'Finance', cost: 35, needs: 'trade', text: 'Opens city shares: invest in other cities, or list yours to raise money.' },
  { id: 'retail', branch: 'commerce', name: 'Retail', cost: 25, needs: 'trade', text: 'Unlocks Stores: sell your factories’ products straight to your own residents.' },
  { id: 'diplomacy', branch: 'society', name: 'Diplomacy', cost: 15, text: 'Opens the Region: shared projects with other mayors, and alliances.' },
  { id: 'orchards', branch: 'farming', name: 'Orchards', cost: 30, text: 'Unlocks orchards: fruit.' },
  { id: 'dairy', branch: 'farming', name: 'Dairy farming', cost: 50, needs: 'orchards', text: 'Unlocks dairy farms.' },
  { id: 'ranching', branch: 'farming', name: 'Ranching', cost: 70, needs: 'dairy', text: 'Unlocks ranches: meat.' },
  { id: 'poultry', branch: 'farming', name: 'Poultry', cost: 25, text: 'Unlocks poultry farms: eggs.' },
  { id: 'vertical', branch: 'farming', name: 'Vertical farming', cost: 70, needs: 'orchards', text: 'Urban farms feed twice as many people and grow twice as much.' },
  { id: 'logistics', branch: 'industry', name: 'Logistics', cost: 40, text: 'Unlocks warehouses: store more to use later or sell.' },
  { id: 'greenconcrete', branch: 'industry', name: 'Green concrete', cost: 40, needs: 'logistics', text: 'Everything costs 10% less to build.' },
  { id: 'carpentry', branch: 'industry', name: 'Carpentry', cost: 50, needs: 'logistics', text: 'Unlocks Furniture: a factory recipe that turns wood and metal into a product that makes homes comfier.' },
  { id: 'toolmaking', branch: 'industry', name: 'Toolmaking', cost: 65, needs: 'carpentry', text: 'Unlocks Tools: a factory recipe that turns metal and wood into a product that makes builders faster.' },
  { id: 'masonry', branch: 'industry', name: 'Masonry', cost: 60, needs: 'logistics', text: 'Unlocks Bricks: a factory recipe that turns stone and coal into a product that makes building cheaper.' },
  { id: 'bakery', branch: 'farming', name: 'Bakery', cost: 55, needs: 'poultry', text: 'Unlocks Baked goods: a factory recipe that turns vegetables and eggs into a product that feeds people faster and cheaper.' },
  { id: 'smartgrid', branch: 'energy', name: 'Smart grid', cost: 70, text: 'Power and water reach 3 tiles further.' },
  { id: 'trafficai', branch: 'energy', name: 'Smart traffic lights', cost: 80, needs: 'smartgrid', text: 'Roads carry 20% more traffic.' },
  { id: 'metro', branch: 'energy', name: 'Metro', cost: 120, needs: 'trafficai', text: 'Unlocks metro stations: underground trains across your city.' },
  { id: 'fusion', branch: 'energy', name: 'Clean reactors', cost: 200, needs: 'smartgrid', text: 'Fossil power stations stop fouling the air.' },
  { id: 'telemed', branch: 'society', name: 'Telemedicine', cost: 60, text: 'Clinics and hospitals treat 30% more patients.' },
  { id: 'edtech', branch: 'education', name: 'The internet', cost: 60, needs: 'university', text: 'Homes go online: everyone studies 25% faster and research comes 20% quicker.' },
];
// Resources: made each day by buildings (their `makes`), used by people and buildings, kept up to a storage limit.
// Water and power can't be bought or sold: a shortfall just shows up as illness and unhappiness. Everything else
// (wood, metal and the five foods) is bought and sold on the Exchange; what isn't grown here is imported at
// `import` dollars a unit, and surplus sells for half that. There's no separate "food" resource any more — each
// kind is its own stock, though people still eat from whichever ones are in store (more kinds, happier residents).
export const RES = {
  water: { name: 'Water', unit: 'kilolitres' },
  power: { name: 'Power', unit: 'megawatt-hours' },
  wood: { name: 'Wood', import: 0.7 },
  metal: { name: 'Metal', import: 1.4 },
  stone: { name: 'Stone', import: 0.9 },
  coal: { name: 'Coal', import: 1.1 },
  vegetables: { name: 'Vegetables', food: true, import: 0.15 },
  fruit: { name: 'Fruit', food: true, import: 0.2 },
  dairy: { name: 'Dairy', food: true, import: 0.25 },
  meat: { name: 'Meat', food: true, import: 0.35 },
  eggs: { name: 'Eggs', food: true, import: 0.22 },
};
export const FOOD = ['vegetables', 'fruit', 'dairy', 'meat', 'eggs'];
// Raw materials: wood and metal feed straight into building costs (buildPrice); stone and coal don't, they're
// traded and turned into Bricks instead. All four share the same produce/store/sell-surplus handling in sim.js.
export const RAW_GOODS = ['wood', 'metal', 'stone', 'coal'];
// The market: offers to sell or buy resources, and loan requests, open to every mayor in the world.
export const TRADE_RES = [...RAW_GOODS, ...FOOD];
// The exchange. A resource's price follows how scarce it is across the whole world (days of everyone's needs
// in store) and a demand that swings from day to day, the same for every player. The exchange buys and sells
// at that price, less or plus `spread`; automatic food imports pay it too, within `importBand` of the base.
export const EXCHANGE = { spread: 0.08, importBand: [0.6, 1.6], coverDays: 3, demandSwing: 0.35 };
export const PER_CAPITA = { wood: 0.2, metal: 0.12, stone: 0.15, coal: 0.1, vegetables: 0.25, fruit: 0.25, dairy: 0.25, meat: 0.25, eggs: 0.2 };   // a day, per person, worldwide
// Products: factories turn raw resources into these once you've researched the recipe. A factory with a recipe
// assigned consumes `recipe` from store each day (scaled by staffing, capped by what's there) and adds `makes` of
// the product. Sell them in a Store for cash, or trade them on the Market like any resource. `benefit` is what
// having some in store does for the city.
export const PRODUCTS = {
  furniture: { name: 'Furniture', recipe: { wood: 2, metal: 1 }, makes: 1, tech: 'carpentry', import: 4.5, benefit: 'Homes with furniture in store are a little happier.' },
  tools: { name: 'Tools', recipe: { metal: 2, wood: 1 }, makes: 1, tech: 'toolmaking', import: 5, benefit: 'Builders work faster while tools are in store.' },
  baked: { name: 'Baked goods', recipe: { vegetables: 2, eggs: 1 }, makes: 1, tech: 'bakery', import: 3, benefit: 'Feeds people faster and cheaper than raw ingredients.' },
  bricks: { name: 'Bricks', recipe: { stone: 2, coal: 1 }, makes: 1, tech: 'masonry', import: 4, benefit: 'Everything costs a little less to build while bricks are in store.' },
};
export const PRODUCT_IDS = Object.keys(PRODUCTS);
export const STORE_SALE_SHARE = 0.85;    // a Store sells products for this share of the import price (vs SURPLUS_SALE on the open market)
export const FACTORY_BATCHES = 6;        // batches of a recipe a fully-staffed, fully-levelled factory can run a day
// What a brand new city starts with: enough to build straight away and try a trade, without waiting on production.
export const STARTING_RES = { water: 100, power: 200, wood: 200, bricks: 200 };
// Bricks in store take this share off every build, on top of whatever wood or metal load discount applies.
export const BRICK_DISCOUNT = 0.95;
// City shares. Every city is worth what its public figures say (people, money, buildings, resources, growth,
// mood) and has `shares` shares. A mayor can list between listMin and listMax of them once the city has minPop
// people, and is paid for them at once (less ipoDiscount); others then buy and sell them on the exchange.
export const STOCK = { shares: 1000, listMin: 50, listMax: 490, minPop: 40, ipoDiscount: 0.95, fee: 0.01 };
export const MARKET = { maxQty: 5000, maxPrice: 50, maxLoan: 20000, maxLoanDays: 30, maxOpen: 6 };
export const USE = { water: 1, power: 0.5, food: 1, powerPerBuilding: 1 };   // a day, per person (and per staffed building for power)
export const STORE_BASE = 200;          // of each resource, before warehouses
export const SURPLUS_SALE = 0.5;        // surplus sells for this share of the import price
// Building takes materials: a load per $25 of price. The price includes buying them in; every load you have in
// store is used first and takes MAT_BUY off the price.
export const MAT_PER_COST = 1 / 25, MAT_BUY = 2;
// Harvests: a producing building builds up extra for up to `max` hours; tap it (from `min` hours) to collect
// `bonus` of what it made in that time, on top of its normal output.
export const HARVEST = { min: 3, max: 12, bonus: 1 };
export const MATERIALS_BOOST = 1.5, MATERIALS_PER_WORK = 0.2;   // builders with materials in stock, and what a unit of work uses
// Eras: a city's size gives it a title and a one-off grant, and speeds research.
export const ERAS = [
  { id: 'village', name: 'Village', pop: 0, grant: 0 },
  { id: 'town', name: 'Town', pop: 50, grant: 400 },
  { id: 'city', name: 'City', pop: 200, grant: 1200 },
  { id: 'metropolis', name: 'Metropolis', pop: 500, grant: 3000 },
];
// Election opponents run on the issue where you look weakest.
export const ISSUES = [
  { k: 'jobs', promise: 'a job for everyone' }, { k: 'homes', promise: 'more homes' }, { k: 'school', promise: 'a school place for every child' },
  { k: 'health', promise: 'shorter waits at the doctor' }, { k: 'safety', promise: 'safer streets' }, { k: 'commute', promise: 'an end to traffic jams' },
  { k: 'leisure', promise: 'more to do in the evenings' }, { k: 'air', promise: 'clean air' }, { k: 'waste', promise: 'clean streets' },
];
// Letters from residents: a worry about the city's weakest need, and a reply that has consequences.
export const LETTER_DAYS = 3, PLEDGE_DAYS = 6;
// Regional projects: shared goals several mayors pay into. Everyone who paid at least 5% gets the benefit.
export const REGIONAL = {
  park: { name: 'Regional park', goal: 4000, text: 'Everyone in every city that paid in is a little happier.', mood: 0.03 },
  stadium: { name: 'Regional stadium', goal: 9000, text: '20 extra tourists a day for every city that paid in.', draw: 20 },
  hospital: { name: 'Regional hospital', goal: 7000, text: 'Residents of every city that paid in fall ill less often.', health: 0.2 },
  railhub: { name: 'Regional rail hub', goal: 6000, text: '$60 extra trade a day for every city that paid in.', trade: 60 },
};
export const REGIONAL_SHARE = 0.05;
export const ALLIANCE_TRADE = 15;   // a day, for each other member of your alliance (up to 6)
// Historic buildings: after this many days, a building is part of the city's heritage.
export const HISTORIC_DAYS = 30;
// Insurance: a daily premium per building; disasters then do 40% of the damage (the insurer pays for repairs).
export const INSURANCE = { premium: 0.4, damage: 0.4 };
// City bonds: borrow from your own residents. Up to $25 a resident, repaid with 12% interest over 30 days.
export const BONDS = { perHead: 25, rate: 0.12, days: 30, minPop: 20 };
export const LAND_RESALE = 0.5;   // selling a parcel back returns half of what it would cost now
export const CROWDFUND = { daily: 0.08, max: 0.4 };   // neighbours chip in towards a request, up to 40% of its price
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
  // With neighbours
  { id: 'friend1', text: 'Make a friend of a neighbouring mayor', reward: 150 },
  { id: 'gift1', text: 'Send a gift to a neighbour', reward: 150 },
  { id: 'link1', text: 'Link a road or railway with a neighbour', reward: 400 },
  { id: 'deal1', text: 'Trade with another mayor', reward: 300 },
  { id: 'ally1', text: 'Join or found an alliance', reward: 400 },
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
  { id: 'carfree', title: 'Referendum: car-free Sundays', text: 'Residents voted on closing the centre to cars on weekends. Do you honour the result?', a: ['Close the streets', 'Cleaner air and happier walkers for 5 days'], b: ['Keep roads open', 'Drivers relieved, others grumble'] },
  { id: 'fourday', title: 'Trial a four-day week?', text: 'Employers suggest letting people work from home one day a week.', a: ['Run the trial', 'Less traffic, happier workers, 10% less tax for 5 days'], b: ['Business as usual', 'Nothing changes'] },
  { id: 'scandal', title: 'Expenses scandal', text: 'A councillor spent city money on a holiday. The paper wants answers.', a: ['Hold an inquiry ($200)', 'Trust restored'], b: ['Keep it quiet', 'It leaks later, and people are angrier'] },
  { id: 'robots', title: 'Factory automation', text: 'A supplier offers robots for your factories.', a: ['Buy them ($400)', 'Factories make 30% more goods; workers are uneasy'], b: ['Say no', 'Workers are grateful'] },
  // Follow-ups: these only come after an earlier choice, never at random.
  { id: 'company2', chain: true, title: 'The firm is back', text: 'The company you let in wants a second, bigger site on the edge of town.', a: ['Agree (+$800)', 'Money now, noise and grumbling'], b: ['Say no', 'They stay small; locals relieved'] },
  { id: 'festival2', chain: true, title: 'Make the festival yearly?', text: 'Last festival was a hit. Organisers want it every year, and it could draw visitors.', a: ['Yes ($500)', 'A bigger party and tourists for 5 days'], b: ['One was enough', 'A little disappointment'] },
  { id: 'robots2', chain: true, title: 'Factory workers protest', text: 'Workers who lost shifts to the robots are marching on the town hall.', a: ['Fund retraining ($300)', 'Some gain new skills'], b: ['Ignore them', 'Anger, and a short strike'] },
  { id: 'clinic', title: 'Free health checks', text: 'Visiting doctors offer free check-ups if the council hosts them.', a: ['Host them ($150)', 'Sick residents recover'], b: ['Decline', 'Nothing changes'] },
];
export const ELECTION_EVERY = 20;   // days between elections

// Zones, SimCity-style: paint them and private developers build when there's demand. Zoned buildings cost you no upkeep.
export const ZONES = { 1: { key: 'homes', name: 'Homes zone', col: 'rgba(63,167,103,0.30)' }, 2: { key: 'shops', name: 'Shops zone', col: 'rgba(59,125,221,0.28)' }, 3: { key: 'industry', name: 'Industry zone', col: 'rgba(240,150,58,0.30)' } };
export const ZONE_COST = 2;   // per tile painted
