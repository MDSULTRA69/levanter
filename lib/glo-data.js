// ============================================================
// GRAND LINE ONLINE — shared data layer
// Postgres storage via `pg` (Levanter already depends on this).
// Put this file at: lib/glo-data.js  (inside your Levanter bot folder)
//
// Requires a DATABASE_URL env var pointing at a Postgres instance
// (Render Postgres free tier, Neon, Supabase, etc. all work).
// Falls back to a local JSON file automatically if DATABASE_URL is
// not set, so local/dev testing still works without a DB.
// ============================================================

const path = require('path')

const DATABASE_URL = process.env.DATABASE_URL || null

// ---------- storage backend ----------

let backend

if (DATABASE_URL) {
  const { Pool } = require('pg')

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  })

  let ready = null
  function init() {
    if (!ready) {
      ready = pool.query(`
        CREATE TABLE IF NOT EXISTS glo_players (
          jid TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
    }
    return ready
  }

  backend = {
    async getPlayer(jid) {
      await init()
      const { rows } = await pool.query('SELECT data FROM glo_players WHERE jid = $1', [jid])
      return rows.length ? rows[0].data : null
    },
    async savePlayer(jid, player) {
      await init()
      await pool.query(
        `INSERT INTO glo_players (jid, data, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (jid) DO UPDATE SET data = $2, updated_at = now()`,
        [jid, player]
      )
    },
    async deletePlayer(jid) {
      await init()
      await pool.query('DELETE FROM glo_players WHERE jid = $1', [jid])
    },
    async loadAll() {
      await init()
      const { rows } = await pool.query('SELECT jid, data FROM glo_players')
      const all = {}
      for (const row of rows) all[row.jid] = row.data
      return all
    },
  }
} else {
  // ---------- fallback: plain JSON file (local/dev only) ----------
  const fs = require('fs')
  const DB_PATH = path.join(__dirname, '..', 'data', 'glo_players.json')

  function ensureDb() {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2))
    }
  }

  function loadAllSync() {
    ensureDb()
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
  }

  function saveAllSync(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
  }

  backend = {
    async getPlayer(jid) {
      const all = loadAllSync()
      return all[jid] || null
    },
    async savePlayer(jid, player) {
      const all = loadAllSync()
      all[jid] = player
      saveAllSync(all)
    },
    async deletePlayer(jid) {
      const all = loadAllSync()
      delete all[jid]
      saveAllSync(all)
    },
    async loadAll() {
      return loadAllSync()
    },
  }

  console.warn(
    '[glo-data] DATABASE_URL not set — falling back to local JSON file storage. ' +
    'This will NOT persist on hosts without a persistent disk (e.g. Render free tier).'
  )
}

// ---------- GAME RULE TABLES (from the Guidebook, Version 1.1) ----------

const TIERS = {
  1: { xpPerSpar: 800,   xpToNext: 336000,  sparsPerDay: 30, tpPerSpar: 1, upgradeCap: 420,  statCap: 90,   hp: 100 },
  2: { xpPerSpar: 1080,  xpToNext: 675000,  sparsPerDay: 25, tpPerSpar: 2, upgradeCap: 1250, statCap: 250,  hp: 160 },
  3: { xpPerSpar: 1500,  xpToNext: 1260000, sparsPerDay: 20, tpPerSpar: 3, upgradeCap: 2520, statCap: 450,  hp: 220 },
  4: { xpPerSpar: 2200,  xpToNext: 2475000, sparsPerDay: 15, tpPerSpar: 4, upgradeCap: 4500, statCap: 800,  hp: 280 },
  5: { xpPerSpar: 3600,  xpToNext: 4680000, sparsPerDay: 10, tpPerSpar: 5, upgradeCap: 6500, statCap: 1200, hp: 340 },
  6: { xpPerSpar: null,  xpToNext: null,    sparsPerDay: 5,  tpPerSpar: 7, upgradeCap: null, statCap: null, hp: 400 },
}

const MOVE_CAP_BY_TIER = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 }

// STR/DEF Armament rank table (Table 7)
const ARMAMENT_RANKS = [
  { rank: 'E', boost: 0.00, tpCost: 0 },
  { rank: 'D', boost: 0.10, tpCost: 35 },
  { rank: 'C', boost: 0.20, tpCost: 65 },
  { rank: 'B', boost: 0.30, tpCost: 105 },
  { rank: 'A', boost: 0.40, tpCost: 160 },
  { rank: 'S', boost: 0.50, tpCost: 250 },
]

// SPD Observation rank table (Table 8)
const OBSERVATION_RANKS = [
  { rank: 'E', boost: 0.00, tpCost: 0 },
  { rank: 'D', boost: 0.12, tpCost: 35 },
  { rank: 'C', boost: 0.24, tpCost: 65 },
  { rank: 'B', boost: 0.36, tpCost: 105 },
  { rank: 'A', boost: 0.48, tpCost: 160 },
  { rank: 'S', boost: 0.60, tpCost: 250 },
]

// Fighting Style rank progression cost (Table 9)
const STYLE_RANKS = [
  { rank: 'E', tpCost: 0 },
  { rank: 'D', tpCost: 40 },
  { rank: 'C', tpCost: 75 },
  { rank: 'B', tpCost: 120 },
  { rank: 'A', tpCost: 185 },
  { rank: 'S', tpCost: 300 },
]

const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S']

const RACES = {
  human:        { str: 0,   spd: 0,   def: 0,   hpRec: 0.05 },
  fishman:      { str: 15,  spd: 0,   def: 5,   hpRec: 0.10 },
  merfolk:      { str: 0,   spd: 20,  def: -5,  hpRec: 0.10 },
  giant:        { str: 25,  spd: -10, def: 10,  hpRec: 0.12 },
  mink:         { str: 5,   spd: 15,  def: 0,   hpRec: 0.12 },
  skypiean:     { str: 0,   spd: 10,  def: 5,   hpRec: 0.05 },
  longarmleg:   { str: 5,   spd: 5,   def: 0,   hpRec: 0.05 },
  threeeye:     { str: 0,   spd: 5,   def: 5,   hpRec: 0.05 },
  celestial:    { str: -5,  spd: 0,   def: 15,  hpRec: 0.05 },
  snakeneck:    { str: 0,   spd: 10,  def: 0,   hpRec: 0.05 },
  tontatta:     { str: -15, spd: 20,  def: 5,   hpRec: 0.12 },
  kuja:         { str: 5,   spd: 10,  def: 5,   hpRec: 0.08 },
  lunarian:     { str: 0,   spd: 25,  def: 25,  hpRec: 0.15 },
}

// ---------- helpers ----------

function rankCostToReach(table, targetRank) {
  // cumulative TP cost from E up to and including targetRank
  const idx = RANK_ORDER.indexOf(targetRank)
  let total = 0
  for (let i = 0; i <= idx; i++) total += table[i].tpCost
  return total
}

function nextRank(currentRank) {
  const idx = RANK_ORDER.indexOf(currentRank)
  if (idx === -1 || idx === RANK_ORDER.length - 1) return null
  return RANK_ORDER[idx + 1]
}

function newCharacter({ name, race, style }) {
  const raceKey = race.toLowerCase().replace(/[^a-z]/g, '')
  const raceData = RACES[raceKey] || RACES.human
  return {
    name,
    race: raceKey,
    tier: 1,
    xp: 0,
    tpBanked: 0,           // TP earned but not yet spent
    tpSpentTotal: 0,       // counts against the Tier's upgradeCap
    stats: { str: 0, def: 0, spd: 0 }, // points PURCHASED (not incl. race mod)
    haki: { armament: 'E', observation: 'E' },
    style: { name: style || null, rank: 'E', moves: [] },
    devilFruit: null,      // { name, type, moves: [] }
    hp: { current: TIERS[1].hp, max: TIERS[1].hp },
    createdAt: Date.now(),
  }
}

function effectiveStat(character, statName) {
  const raceData = RACES[character.race] || RACES.human
  const raceMod = raceData[statName] || 0
  return character.stats[statName] + raceMod
}

function tpRemainingForTier(character) {
  const cap = TIERS[character.tier].upgradeCap
  if (cap === null) return null // T6 TBD
  return cap - character.tpSpentTotal
}

module.exports = {
  // storage — now ASYNC, callers must `await` these
  getPlayer: backend.getPlayer,
  savePlayer: backend.savePlayer,
  deletePlayer: backend.deletePlayer,
  loadAll: backend.loadAll,

  // static data / helpers — unchanged
  TIERS,
  MOVE_CAP_BY_TIER,
  ARMAMENT_RANKS,
  OBSERVATION_RANKS,
  STYLE_RANKS,
  RANK_ORDER,
  RACES,
  rankCostToReach,
  nextRank,
  newCharacter,
  effectiveStat,
  tpRemainingForTier,
}
