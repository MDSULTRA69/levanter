// ============================================================
// GRAND LINE ONLINE — spar logging & tier-up
// Put this file at: plugins/glo-spar.js
// ============================================================

const { bot } = require('../lib/')
const glo = require('../lib/glo-data')

const GM_NUMBERS = [
  '2349015512002',
  '2349137017829',
]

function isGM(message) {
  const num = message.sender.split('@')[0]
  return GM_NUMBERS.includes(num)
}

function getTargetJid(message, match) {
  if (message.mention && message.mention.length) return message.mention[0]
  if (message.quoted && message.quoted.sender) return message.quoted.sender
  const digits = (match[1] || '').replace(/[^0-9]/g, '')
  if (digits) return `${digits}@s.whatsapp.net`
  return null
}

bot(
  {
    pattern: 'glo spar ?(.*)',
    desc: '[GM] Log a spar between two tagged players — awards XP + TP to both',
    type: 'glo',
  },
  async (message, match) => {
    if (!isGM(message)) return await message.send('⚠ GM/mod only.')
    const mentions = message.mention || []
    if (mentions.length < 2) {
      return await message.send('Tag both players. Usage: .glo spar @player1 @player2')
    }

    const results = []
    for (const jid of mentions.slice(0, 2)) {
      const c = glo.getPlayer(jid)
      if (!c) {
        results.push(`⚠ ${jid.split('@')[0]} has no character registered — skipped.`)
        continue
      }
      const tier = glo.TIERS[c.tier]
      const xpGain = tier.xpPerSpar
      const tpGain = tier.tpPerSpar

      if (xpGain === null) {
        results.push(`${c.name}: already Tier 6 (max) — no XP gained, but +${tpGain} TP.`)
        c.tpBanked += tpGain
        glo.savePlayer(jid, c)
        continue
      }

      c.xp += xpGain
      c.tpBanked += tpGain
      let tierUpNote = ''

      if (c.tier < 4 && c.xp >= tier.xpToNext) {
        c.xp -= tier.xpToNext
        c.tier += 1
        c.hp.max = glo.TIERS[c.tier].hp
        c.hp.current = c.hp.max
        tierUpNote = `\n🎉 *${c.name} reached Tier ${c.tier}!* Stat caps and Move limit increased.`
      } else if ((c.tier === 4 || c.tier === 5) && c.xp >= tier.xpToNext) {
        tierUpNote = `\n⚠ *${c.name} has hit the XP threshold for Tier ${c.tier + 1}* but promotion needs a Trial (defeat a higher-Tier opponent in an official battle, OR faction sign-off). Use .glo promote to confirm once earned.`
      }

      glo.savePlayer(jid, c)
      results.push(`${c.name}: +${xpGain} XP, +${tpGain} TP${tierUpNote}`)
    }

    return await message.send(`🥊 Spar logged.\n\n${results.join('\n')}`)
  }
)

bot(
  {
    pattern: 'glo promote ?(.*)',
    desc: '[GM] Confirm a Tier 5/6 promotion Trial was met for a tagged player',
    type: 'glo',
  },
  async (message, match) => {
    if (!isGM(message)) return await message.send('⚠ GM/mod only.')
    const jid = getTargetJid(message, match)
    if (!jid) return await message.send('Tag the player. Usage: .glo promote @player')
    const c = glo.getPlayer(jid)
    if (!c) return await message.send('⚠ That player has no character registered.')
    if (c.tier !== 4 && c.tier !== 5) {
      return await message.send(`⚠ ${c.name} is Tier ${c.tier} — this command is only for the Tier 5/6 Trial gate.`)
    }
    const tier = glo.TIERS[c.tier]
    if (c.xp < tier.xpToNext) {
      return await message.send(`⚠ ${c.name} hasn't hit the XP threshold yet (${c.xp}/${tier.xpToNext}).`)
    }
    c.xp -= tier.xpToNext
    c.tier += 1
    c.hp.max = glo.TIERS[c.tier].hp
    c.hp.current = c.hp.max
    glo.savePlayer(jid, c)
    return await message.send(`🎉 ${c.name} promoted to Tier ${c.tier}!`)
  }
)

bot(
  {
    pattern: 'glo grant (xp|tp) ?(.*)',
    desc: '[GM] Manually grant XP or TP. Usage: .glo grant tp @player 50',
    type: 'glo',
  },
  async (message, match) => {
    if (!isGM(message)) return await message.send('⚠ GM/mod only.')
    const kind = match[1]
    const jid = getTargetJid(message, match)
    if (!jid) return await message.send(`Tag the player. Usage: .glo grant ${kind} @player 50`)
    const amountMatch = (match[2] || '').match(/(\d+)/)
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : 0
    if (!amount) return await message.send(`Usage: .glo grant ${kind} @player 50`)

    const c = glo.getPlayer(jid)
    if (!c) return await message.send('⚠ That player has no character registered.')

    if (kind === 'xp') c.xp += amount
    else c.tpBanked += amount
    glo.savePlayer(jid, c)

    return await message.send(`✅ Granted ${amount} ${kind.toUpperCase()} to ${c.name}.`)
  }
)
