// ============================================================
// GRAND LINE ONLINE — combat math helper (Phase 1)
// Put this file at: plugins/glo-combat.js
//
// This does the ARITHMETIC for a GM moderating a live match —
// it does not yet track turn order, cooldowns, or Traps automatically.
// That's Phase 2.
//
// Commands (GM runs these in the fight thread):
//   .glo dmg @attacker @defender          → damage/dodge result for one exchange
//   .glo hp @player -25                   → apply damage/healing directly to HP
//   .glo resethp @player                  → reset HP to max (after rest/recovery)
// ============================================================

const { bot } = require('../lib/')
const glo = require('../lib/glo-data')

const GM_NUMBERS = [
  // '2349073353353','2349137017829'
]

function isGM(message) {
  const num = message.sender.split('@')[0]
  return GM_NUMBERS.includes(num)
}

function armamentBoost(c) {
  return glo.ARMAMENT_RANKS.find((r) => r.rank === c.haki.armament).boost
}
function observationBoost(c) {
  return glo.OBSERVATION_RANKS.find((r) => r.rank === c.haki.observation).boost
}

// ---------- ONE EXCHANGE: attacker vs defender ----------
// .glo dmg @attacker @defender
bot(
  {
    pattern: 'glo dmg ?(.*)',
    desc: '[GM] Resolve one attack exchange (damage + dodge) between two tagged players',
    type: 'glo',
  },
  async (message) => {
    if (!isGM(message)) return await message.send('⚠ GM/mod only.')
    const mentions = message.mention || []
    if (mentions.length < 2) {
      return await message.send('Tag attacker then defender. Usage: .glo dmg @attacker @defender')
    }
    const [atkJid, defJid] = mentions
    const atk = await glo.getPlayer(atkJid)
    const def = await glo.getPlayer(defJid)
    if (!atk || !def) return await message.send('⚠ Both players need registered characters.')

    // effective stats including Haki
    const atkSTR = Math.round(glo.effectiveStat(atk, 'str') * (1 + armamentBoost(atk)))
    const defDEF = Math.round(glo.effectiveStat(def, 'def') * (1 + armamentBoost(def)))
    const atkSPD = Math.round(glo.effectiveStat(atk, 'spd') * (1 + observationBoost(atk)))
    const defSPD = Math.round(glo.effectiveStat(def, 'spd') * (1 + observationBoost(def)))

    // --- Dodge check first (Speed Gap) ---
    const speedGap = atkSPD - defSPD
    let dodgeResult, dodgeMult
    if (speedGap <= 5) {
      dodgeResult = 'Full Dodge'
      dodgeMult = 0
    } else if (speedGap <= 24) {
      dodgeResult = 'Partial Dodge (50%)'
      dodgeMult = 0.5
    } else {
      dodgeResult = 'Full Hit'
      dodgeMult = 1
    }

    // --- Damage (STR vs DEF) ---
    let rawDamage
    if (defDEF >= atkSTR) {
      rawDamage = 0
    } else {
      rawDamage = atkSTR - defDEF
    }

    const finalDamage = Math.round(rawDamage * dodgeMult)

    return await message.send(
      `⚔ *${atk.name}* attacks *${def.name}*\n\n` +
      `Effective STR: ${atkSTR} vs Effective DEF: ${defDEF}\n` +
      `→ Base damage: ${rawDamage}${rawDamage === 0 ? ' (fully blocked, DEF ≥ STR)' : ''}\n\n` +
      `Speed Gap: ${atkSPD} − ${defSPD} = ${speedGap}\n` +
      `→ ${dodgeResult}\n\n` +
      `💥 *Final damage: ${finalDamage}*\n\n` +
      `Apply it with: .glo hp @${def.name} -${finalDamage}`
    )
  }
)

// ---------- APPLY HP CHANGE ----------
// .glo hp @player -25   or   .glo hp @player +40
bot(
  {
    pattern: 'glo hp ?(.*)',
    desc: '[GM] Apply damage (negative) or healing (positive) to a tagged player',
    type: 'glo',
  },
  async (message, match) => {
    if (!isGM(message)) return await message.send('⚠ GM/mod only.')
    const mentions = message.mention || []
    if (!mentions.length) return await message.send('Tag the player. Usage: .glo hp @player -25')
    const jid = mentions[0]
    const c = await glo.getPlayer(jid)
    if (!c) return await message.send('⚠ That player has no character registered.')

    const deltaMatch = (match[1] || '').match(/([+-]?\d+)/)
    if (!deltaMatch) return await message.send('Usage: .glo hp @player -25  (or +25 to heal)')
    const delta = parseInt(deltaMatch[1], 10)

    c.hp.current = Math.max(0, Math.min(c.hp.max, c.hp.current + delta))
    await glo.savePlayer(jid, c)

    const status = c.hp.current === 0 ? '\n💀 *0 HP — down.*' : ''
    return await message.send(`❤ ${c.name}: ${c.hp.current} / ${c.hp.max} HP${status}`)
  }
)

// ---------- RESET HP (after daily rest / recovery items) ----------
bot(
  {
    pattern: 'glo resethp ?(.*)',
    desc: '[GM] Reset a tagged player to full HP',
    type: 'glo',
  },
  async (message) => {
    if (!isGM(message)) return await message.send('⚠ GM/mod only.')
    const mentions = message.mention || []
    if (!mentions.length) return await message.send('Tag the player. Usage: .glo resethp @player')
    const jid = mentions[0]
    const c = await glo.getPlayer(jid)
    if (!c) return await message.send('⚠ That player has no character registered.')
    c.hp.current = c.hp.max
    await glo.savePlayer(jid, c)
    return await message.send(`❤ ${c.name} restored to full HP (${c.hp.max}).`)
  }
)
                              
