// All tunable numbers live here so balancing never means hunting through logic.

export const WORLD_ID = 'public';
export const PLOT = 24;          // tiles per side of a plot
export const GAP = 2;            // empty tiles between neighbouring plots on the master map

export const TICK_MS = 2500;     // 1 tick = 1 in-game hour, so 1 in-game day = 60 real seconds
export const HOURS_PER_DAY = 24;
export const MAX_OFFLINE_DAYS = 3; // catch-up cap when a player comes back
export const SAVE_EVERY_MS = 30000;

export const START_MONEY = 2500;
export const REBUILD_MONEY = 1500;
export const GRACE_DAYS = 3;     // no one leaves during a new city's first days
export const EDU_DAYS = 3;       // days of schooling before a citizen graduates
export const VOLUNTEER_RATE = 0.25; // build hours an unskilled citizen contributes per hour
export const RUBBLE_CLEAR_COST = 25;
export const COLLAPSE_UNPAID_DAYS = 10;
export const TAP_SHARE = 0.05;   // each tap on a building site finishes 5% of it...
export const TAP_CAP = 0.25;     // ...up to 25% per site

export const ROAD_CAP = 45;      // residents per day a road tile carries before jamming
export const HALL_CAP = 120;

export const TAX = { unskilled: 3, teacher: 5, pro: 7, builder: 4, unemployed: 0.5 };
export const JOB_ODDS = { builder: 0.35, teacher: 0.15, pro: 0.5 }; // graduates get a random job

export const T = { EMPTY: 0, ROAD: 1, HOUSE: 2, WORK: 3, SHOP: 4, SCHOOL: 5, PARK: 6, HALL: 7, RUBBLE: 8 };

// cost: money to place, work: builder-hours to finish, upkeep: money per day
export const B = {
  [T.ROAD]:   { key: 'road',   name: 'Road',      cost: 10,  work: 1,  upkeep: 0.3, blurb: 'Connects everything. Jams above 45 trips a day.' },
  [T.HOUSE]:  { key: 'house',  name: 'House',     cost: 120, work: 16, upkeep: 2,   homes: 6,  blurb: 'Homes for 6 people.' },
  [T.WORK]:   { key: 'work',   name: 'Workplace', cost: 220, work: 30, upkeep: 4,   jobs: 10,  blurb: '10 jobs. Employed people pay more tax.' },
  [T.SHOP]:   { key: 'shop',   name: 'Shop',      cost: 160, work: 20, upkeep: 3,   jobs: 3, serves: 30, blurb: 'Serves 30 people and adds 3 jobs.' },
  [T.SCHOOL]: { key: 'school', name: 'School',    cost: 320, work: 40, upkeep: 6,   jobs: 2, seats: 8, blurb: '8 seats. Graduates become builders, teachers or professionals.' },
  [T.PARK]:   { key: 'park',   name: 'Park',      cost: 80,  work: 6,  upkeep: 1,   blurb: 'Homes within 3 tiles are happier.' },
  [T.HALL]:   { key: 'hall',   name: 'Town hall', cost: 0,   work: 0,  upkeep: 0,   homes: 6, jobs: 4, serves: 10 },
  [T.RUBBLE]: { key: 'rubble', name: 'Rubble',    cost: 0,   work: 0,  upkeep: 0 },
};

export const BUILDABLE = [T.ROAD, T.HOUSE, T.WORK, T.SHOP, T.SCHOOL, T.PARK];
export const UPGRADABLE = [T.HOUSE, T.WORK, T.SHOP, T.SCHOOL];
export const MAX_LEVEL = 3;
export const LEVEL = {
  capacity: [0, 1, 1.75, 2.5],   // index by level
  upkeep:   [0, 1, 1.6, 2.2],
  cost:     [0, 0, 1, 1.6],      // upgrade price as a multiple of the base cost, to reach this level
};

// Milestones, checked every in-game hour. Rewards are paid once.
export const GOALS = [
  { id: 'roads10',  text: 'Lay 10 road tiles',              reward: 100 },
  { id: 'houses3',  text: 'Build 3 houses',                 reward: 150 },
  { id: 'work1',    text: 'Open a workplace',               reward: 150 },
  { id: 'shop1',    text: 'Open a shop',                    reward: 150 },
  { id: 'pop25',    text: 'Reach 25 people',                reward: 250 },
  { id: 'school1',  text: 'Open a school',                  reward: 300 },
  { id: 'upgrade1', text: 'Upgrade a building',             reward: 300 },
  { id: 'build6',   text: 'Have 6 builders',                reward: 300 },
  { id: 'happy75',  text: 'Keep 30+ people at 75% mood',    reward: 400 },
  { id: 'days10',   text: 'Keep your city running 10 days', reward: 500 },
  { id: 'pop100',   text: 'Reach 100 people',               reward: 800 },
  { id: 'days30',   text: 'Keep your city running 30 days', reward: 1500 },
];
