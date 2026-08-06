// ============================================================
// GRAND LINE ONLINE — registration & profile card
// Put this file at: plugins/glo-profile.js
// ============================================================

const { bot } = require('../lib/')
const glo = require('../lib/glo-data')

bot(
  {
    pattern: 'glo register ?(.*)',
    desc: 'Create a Grand Line Online character. Usage: .glo register Name | Race | Style',
    type: 'glo',
  },
  async (message, match) => {
    const jid = message.sender
    if (glo.getPlayer(jid)) {
      return await message.send(
        '⚠ You already have a character registered. DM a mod if you need it reset.'
      )
    }
    const raw = (match[1] || '').trim()
    const parts = raw.split('|').map((s) => s.trim())
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      return await message.send(
        'Format:\n.glo register Name | Race | Fighting Style\n\nExample:\n.glo register Reiju | Human | Iron Wave Style'
      )
    }
    const [name, race, style] = parts
    const raceKey = race.toLowerCase().replace(/[^a-z]/g, '')
    if (!glo.RACES[raceKey]) {
      const list = Object.keys(glo.RACES).join(', ')
      return await message.send(`⚠ Unknown race "${race}".\n\nValid races: ${list}`)
    }

    const character = glo.newCharacter({ name, race, style })
    glo.savePlayer(jid, character)

    return await message.send(
      `✅ Character created!\n\n` +
      `*${name}*\n` +
      `Race: ${race}\nStyle: ${style}\nTier: 1\n\n` +
      `Send *.card* anytime to view your full sheet.\n` +
      `Send *.help glo* to see all training commands.`
    )
  }
)

bot(
  {
    pattern: '(card|profile)',
    desc: 'Show your Grand Line Online character card',
    type: 'glo',
  },
  async (message) => {
    const jid = message.sender
    const c = glo.getPlayer(jid)
    if (!c) {
      return await message.send('You have no character yet. Use:\n.glo register Name | Race | Style')
    }

    const strEff = glo.effectiveStat(c, 'str')
    const defEff = glo.effectiveStat(c, 'def')
    const spdEff = glo.effectiveStat(c, 'spd')
    const tier = glo.TIERS[c.tier]
    const tpLeft = glo.tpRemainingForTier(c)

    const armBoost = glo.ARMAMENT_RANKS.find((r) => r.rank === c.haki.armament).boost
    const obsBoost = glo.OBSERVATION_RANKS.find((r) => r.rank === c.haki.observation).boost

    const moveList = c.style.moves.length
      ? c.style.moves.map((m, i) => `  ${i + 1}. ${m.name} [${m.rank}]`).join('\n')
      : '  (none yet — use .glo move add <name>)'

    const dfBlock = c.devilFruit
      ? `\n🍈 *Devil Fruit:* ${c.devilFruit.name} (${c.devilFruit.type})\n` +
        (c.devilFruit.moves.length
          ? c.devilFruit.moves.map((m, i) => `  ${i + 1}. ${m.name} [${m.rank}]`).join('\n')
          : '  (no moves trained yet)')
      : ''

    const msg =
`━━━━━━━━━━━━━━━
⚔ *${c.name}*
━━━━━━━━━━━━━━━
Tier: *${c.tier}*
Race: ${c.race}
XP: ${c.xp}${tier.xpToNext ? ` / ${tier.xpToNext}` : ' (T6 — max)'}

❤ HP: ${c.hp.current} / ${c.hp.max}

*STATS* (base +race = effective)
STR: ${c.stats.str} → ${strEff}
DEF: ${c.stats.def} → ${defEff}
SPD: ${c.stats.spd} → ${spdEff}

*HAKI*
Armament: ${c.haki.armament}-rank (+${Math.round(armBoost * 100)}%)
Observation: ${c.haki.observation}-rank (+${Math.round(obsBoost * 100)}%)

*FIGHTING STYLE:* ${c.style.name || '(none set)'}
Rank: ${c.style.rank}
Moves:
${moveList}
${dfBlock}

*TRAINING POINTS*
Banked (unspent): ${c.tpBanked}
Used this Tier: ${c.tpSpentTotal}${tpLeft !== null ? ` / ${tier.upgradeCap} cap` : ' (T6 cap TBD)'}
━━━━━━━━━━━━━━━`

    return await message.send(msg)
  }
)
