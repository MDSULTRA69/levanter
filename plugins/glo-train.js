// ============================================================
// GRAND LINE ONLINE — training commands
// Put this file at: plugins/glo-train.js
// Commands (DM the bot):
//   .train str <amount>          spend TP to raise STR (1 TP = 1 point)
//   .train def <amount>
//   .train spd <amount>
//   .haki armament                spend TP to rank Armament up one rank
//   .haki observation             spend TP to rank Observation up one rank
//   .style rank                   spend TP to rank your Fighting Style up one rank
//   .move add <move name>         add a new E-rank move to your Fighting Style
//   .df set <fruit name> | <type>   assign a Devil Fruit (Paramecia/Zoan/Logia)
//   .dfmove add <move name>       add a move to your Devil Fruit moveset
// ============================================================

const { bot } = require('../lib/')
const glo = require('../lib/glo-data')

async function requireChar(message) {
  const c = await glo.getPlayer(message.sender)
  if (!c) {
    message.send('You have no character yet. Use:\n.glo register Name | Race | Style')
    return null
  }
  return c
}

// ---------- STAT TRAINING ----------
bot(
  {
    pattern: 'train (str|def|spd) ?(.*)',
    desc: 'Spend Training Points on a stat. Usage: .train str 10',
    type: 'glo',
  },
  async (message, match) => {
    const c = await requireChar(message)
    if (!c) return
    const statName = match[1]
    const amount = parseInt(match[2], 10)
    if (!amount || amount <= 0) {
      return await message.send('Usage: .train str 10  (spends 10 TP → +10 STR, 1 TP = 1 point)')
    }

    const tier = glo.TIERS[c.tier]
    if (tier.statCap === null) {
      return await message.send('⚠ Tier 6 stat cap is not finalised yet — ask a GM before training.')
    }

    if (c.tpBanked < amount) {
      return await message.send(`⚠ Not enough TP. You have ${c.tpBanked} TP banked, this costs ${amount}.`)
    }
    const newVal = c.stats[statName] + amount
    if (newVal > tier.statCap) {
      return await message.send(
        `⚠ That would put ${statName.toUpperCase()} at ${newVal}, above your Tier ${c.tier} cap of ${tier.statCap}.\n` +
        `Room left: ${tier.statCap - c.stats[statName]}`
      )
    }
    const tpLeft = glo.tpRemainingForTier(c)
    if (tpLeft !== null && amount > tpLeft) {
      return await message.send(
        `⚠ That exceeds your Tier ${c.tier} lifetime upgrade cap.\nRoom left across ALL training: ${tpLeft} TP.`
      )
    }

    c.stats[statName] = newVal
    c.tpBanked -= amount
    c.tpSpentTotal += amount
    await glo.savePlayer(message.sender, c)

    return await message.send(
      `✅ ${statName.toUpperCase()} trained: ${newVal - amount} → ${newVal}\n` +
      `TP banked: ${c.tpBanked} | Used this Tier: ${c.tpSpentTotal}/${tier.upgradeCap}`
    )
  }
)

// ---------- HAKI TRAINING ----------
bot(
  {
    pattern: 'haki (armament|observation)',
    desc: 'Spend TP to rank up a Haki type. Usage: .haki armament',
    type: 'glo',
  },
  async (message, match) => {
    const c = await requireChar(message)
    if (!c) return
    const type = match[1]
    const table = type === 'armament' ? glo.ARMAMENT_RANKS : glo.OBSERVATION_RANKS
    const current = c.haki[type]
    const next = glo.nextRank(current)

    if (!next) {
      return await message.send(`Your ${type} Haki is already at S-rank — the current maximum.`)
    }
    // Tier gate: rank index roughly maps to Tier - 1 (E unlocked T1, S needs T5+ per class-unlock pattern)
    const rankIdx = glo.RANK_ORDER.indexOf(next)
    if (c.tier < rankIdx + 1 && rankIdx > 0) {
      // soft warning, not a hard block, since exact Tier-gate wasn't finalised for Haki in the doc
    }

    const cost = table.find((r) => r.rank === next).tpCost
    if (c.tpBanked < cost) {
      return await message.send(
        `⚠ Ranking ${type} up to ${next} costs ${cost} TP. You have ${c.tpBanked} banked.`
      )
    }
    const tpLeft = glo.tpRemainingForTier(c)
    if (tpLeft !== null && cost > tpLeft) {
      return await message.send(`⚠ That exceeds your Tier ${c.tier} lifetime upgrade cap. Room left: ${tpLeft} TP.`)
    }

    c.haki[type] = next
    c.tpBanked -= cost
    c.tpSpentTotal += cost
    await glo.savePlayer(message.sender, c)

    const boost = table.find((r) => r.rank === next).boost
    return await message.send(
      `✅ ${type[0].toUpperCase() + type.slice(1)} Haki: ${current} → ${next} (+${Math.round(boost * 100)}%)\n` +
      `TP banked: ${c.tpBanked}`
    )
  }
)

// ---------- FIGHTING STYLE RANK ----------
bot(
  {
    pattern: 'style rank',
    desc: 'Spend TP to rank up your Fighting Style (all its moves rank up with it)',
    type: 'glo',
  },
  async (message) => {
    const c = await requireChar(message)
    if (!c) return
    if (!c.style.name) {
      return await message.send('⚠ You have no Fighting Style set. Ask a GM to set one on your sheet.')
    }
    const next = glo.nextRank(c.style.rank)
    if (!next) {
      return await message.send('Your Fighting Style is already at S-rank — the current maximum.')
    }
    const cost = glo.STYLE_RANKS.find((r) => r.rank === next).tpCost
    if (c.tpBanked < cost) {
      return await message.send(`⚠ Ranking your Style up to ${next} costs ${cost} TP. You have ${c.tpBanked} banked.`)
    }
    const tpLeft = glo.tpRemainingForTier(c)
    if (tpLeft !== null && cost > tpLeft) {
      return await message.send(`⚠ That exceeds your Tier ${c.tier} lifetime upgrade cap. Room left: ${tpLeft} TP.`)
    }

    c.style.rank = next
    c.style.moves.forEach((m) => (m.rank = next)) // all moves rank up together
    c.tpBanked -= cost
    c.tpSpentTotal += cost
    await glo.savePlayer(message.sender, c)

    return await message.send(
      `✅ ${c.style.name} ranked up: → ${next}\n` +
      `All ${c.style.moves.length} move(s) in your Style now match ${next}-rank.\n` +
      `TP banked: ${c.tpBanked}`
    )
  }
)

// ---------- STYLE MOVE CREATION ----------
bot(
  {
    pattern: 'move add ?(.*)',
    desc: 'Add a new move to your Fighting Style, starts at E-rank. Usage: .move add Falling Star',
    type: 'glo',
  },
  async (message, match) => {
    const c = await requireChar(message)
    if (!c) return
    const name = (match[1] || '').trim()
    if (!name) return await message.send('Usage: .move add Falling Star')
    if (!c.style.name) {
      return await message.send('⚠ You have no Fighting Style set. Ask a GM to set one on your sheet first.')
    }

    const cap = glo.MOVE_CAP_BY_TIER[c.tier]
    if (c.style.moves.length >= cap) {
      return await message.send(
        `⚠ Your Style is at its Tier ${c.tier} move cap (${cap}).\n` +
        `On your next Tier-up, choose: retrain the whole Style fresh, or add 1 more move.`
      )
    }
    if (c.style.moves.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return await message.send(`⚠ You already have a move called "${name}".`)
    }

    c.style.moves.push({ name, rank: 'E' })
    await glo.savePlayer(message.sender, c)

    return await message.send(
      `✅ "${name}" added to ${c.style.name} at E-rank.\n` +
      `(${c.style.moves.length}/${cap} moves used this Tier)\n\n` +
      `Note: this move will rank up automatically whenever your Style ranks up — it isn't trained separately.`
    )
  }
)

// ---------- DEVIL FRUIT ----------
bot(
  {
    pattern: 'df set ?(.*)',
    desc: 'Assign a Devil Fruit. Usage: .df set Mera Mera no Mi | Logia',
    type: 'glo',
  },
  async (message, match) => {
    const c = await requireChar(message)
    if (!c) return
    const raw = (match[1] || '').trim()
    const parts = raw.split('|').map((s) => s.trim())
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return await message.send('Usage: .df set Fruit Name | Paramecia/Zoan/Logia')
    }
    if (c.devilFruit) {
      return await message.send('⚠ You already have a Devil Fruit set. Ask a GM if this needs to change.')
    }
    c.devilFruit = { name: parts[0], type: parts[1], moves: [] }
    await glo.savePlayer(message.sender, c)
    return await message.send(`✅ Devil Fruit set: ${parts[0]} (${parts[1]})`)
  }
)

bot(
  {
    pattern: 'dfmove add ?(.*)',
    desc: 'Add a move to your Devil Fruit. Usage: .dfmove add Fire Fist',
    type: 'glo',
  },
  async (message, match) => {
    const c = await requireChar(message)
    if (!c) return
    if (!c.devilFruit) return await message.send('⚠ You have no Devil Fruit set. Use .df set first.')
    const name = (match[1] || '').trim()
    if (!name) return await message.send('Usage: .dfmove add Fire Fist')
    if (c.devilFruit.moves.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return await message.send(`⚠ You already have a Devil Fruit move called "${name}".`)
    }
    // Devil Fruit moves scale with the USER's Tier automatically (per design) —
    // so we tag it with current Tier rather than E-rank.
    c.devilFruit.moves.push({ name, rank: `T${c.tier}` })
    await glo.savePlayer(message.sender, c)
    return await message.send(
      `✅ "${name}" added to your Devil Fruit moveset (scales automatically with your Tier — currently T${c.tier}).`
    )
  }
)
      
