// ============================================================
// GRAND LINE ONLINE — training commands
// Put this file at: plugins/glo-train.js
// ============================================================

const { bot } = require('../lib/')
const glo = require('../lib/glo-data')

function requireChar(message) {
  const c = glo.getPlayer(message.sender)
  if (!c) {
    message.send('You have no character yet. Use:\n.glo register Name | Race | Style')
    return null
  }
  return c
}

bot(
  {
    pattern: 'train (str|def|spd) ?(.*)',
    desc: 'Spend Training Points on a stat. Usage: .train str 10',
    type: 'glo',
  },
  async (message, match) => {
    const c = requireChar(message)
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
    glo.savePlayer(message.sender, c)

    return await message.send(
      `✅ ${statName.toUpperCase()} trained: ${newVal - amount} → ${newVal}\n` +
      `TP banked: ${c.tpBanked} | Used this Tier: ${c.tpSpentTotal}/${tier.upgradeCap}`
    )
  }
)

bot(
  {
    pattern: 'haki (armament|observation)',
    desc: 'Spend TP to rank up a Haki type. Usage: .haki armament',
    type: 'glo',
  },
  async (message, match) => {
    const c = requireChar(
