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

export const ROAD_CAP = 45;      // residents per day a road tile carries before jamming
export const HALL_CAP = 120;

export const TAX = { unskilled: 3, teacher: 5, pro: 7, builder: 4, unemployed: 0.5 };
export const JOB_ODDS = { builder: 0.35, teacher: 0.15, pro: 0.5 }; // graduates get a random job

export const T = { EMPTY: 0, ROAD: 1, HOUSE: 2, WORK: 3, SHOP: 4, SCHOOL: 5, PARK: 6, HALL: 7, RUBBLE: 8 };

// cost: money to place, work: builder-hours to finish, upkeep: money per day
export const B = {
  [T.ROAD]:   { key: 'road',   name: 'Road',      cost: 10,  work: 1,  upkeep: 0.3, color: '#7a8290' },
  [T.HOUSE]:  { key: 'house',  name: 'House',     cost: 120, work: 16, upkeep: 2,   color: '#e3a34b', homes: 6 },
  [T.WORK]:   { key: 'work',   name: 'Workplace', cost: 220, work: 30, upkeep: 4,   color: '#3f6fb5', jobs: 10 },
  [T.SHOP]:   { key: 'shop',   name: 'Shop',      cost: 160, work: 20, upkeep: 3,   color: '#c8577e', jobs: 3, serves: 30 },
  [T.SCHOOL]: { key: 'school', name: 'School',    cost: 320, work: 40, upkeep: 6,   color: '#e8c547', jobs: 2, seats: 8 },
  [T.PARK]:   { key: 'park',   name: 'Park',      cost: 80,  work: 6,  upkeep: 1,   color: '#5b9e5f' },
  [T.HALL]:   { key: 'hall',   name: 'Town hall', cost: 0,   work: 0,  upkeep: 0,   color: '#6b4fa0', homes: 6, jobs: 4, serves: 10 },
  [T.RUBBLE]: { key: 'rubble', name: 'Rubble',    cost: 0,   work: 0,  upkeep: 0,   color: '#8a7362' },
};

export const BUILDABLE = [T.ROAD, T.HOUSE, T.WORK, T.SHOP, T.SCHOOL, T.PARK];
