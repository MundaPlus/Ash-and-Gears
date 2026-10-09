# 06 — Combat and threats

## Combat model

- Real-time, ticks. Pause allowed at any time.
- **Drafting**: player drafts survivors. Drafted survivors take direct move and target orders. Undrafted survivors flee or fight back by trait.
- Ranged hit chance = shooter skill + weapon accuracy at range − target cover − target movement − light/weather.
- Cover: low walls, sandbags, wrecks, rubble, trees. Cover gives a block chance by direction.
- Damage hits a body part. Armor reduces it by type (sharp, blunt, heat, radiation).
- Morale: enemies flee when losses or pain are high.

## Weapons (examples)

| Tier | Melee | Ranged |
|---|---|---|
| 0 | Pipe, plank with nail, knife | Slingshot, thrown bricks |
| 1 | Machete, sledgehammer | Pipe pistol, crossbow, scrap shotgun |
| 2 | Chainsaw, shock baton | Hunting rifle, SMG |
| 3 | Power fist | Assault rifle, flamethrower |
| 4 | — | Old-world laser (rare), rocket launcher |

## Defenses

- Walls, doors, sandbags, spike traps, tripwire bells (early).
- Turrets (tier 1: scrap turret, needs power; tier 2: ammo-fed by belt; tier 3: auto-cannon).
- Mines and IED traps (chemicals).
- Late game: defense is mostly automated. Survivors repair and refill.

## Threats

### Raiders and factions

- Raid size from colony wealth and storyteller.
- Raid types: assault, siege (they dig in), sappers (dig through walls), kidnap, theft.
- Captured raiders can be recruited, ransomed or released (goodwill +).

### Mutants and creatures

| Creature | Behavior |
|---|---|
| Rad-rats | Swarm. Eat food stockpiles |
| Glow-hounds | Pack hunters at night |
| Sludge crawlers | Underground; burrow through rock |
| Two-headed cattle | Tameable. Milk + meat. Sometimes angry |
| The Big One | Rare boss mutant. Drop: rare parts |

- Night hordes: more mutant attacks at night. Lights reduce them.

### Environment

- Radiation cloud (see `04-economy.md`).
- Acid rain: damages outdoor items and crops.
- Dust storm: low vision, solar off.
- Heat wave / cold snap.
- Fire (from lightning, breaks, cooking accidents).
- Cave-in, flood underground.

### Internal

- Disease outbreak, food poisoning.
- Mental breaks, fights, theft, sabotage by a sad survivor.
- Addiction.

## Storytellers

The storyteller is the AI that picks events.

| Name | Style |
|---|---|
| **Grandma Grit** | Calm. Long quiet times. For building |
| **The Sheriff** | Classic. Rising tension, then relief |
| **Doctor Chaos** | Random. Anything can happen any day |

### Custom sliders (0–200%)

- Raid frequency, raid size, mutant frequency, environment events, disease, mental break threshold, resource abundance, radiation cloud frequency.
- Permadeath toggle.

### Event pacing

- Each event has a cost. Storyteller has a "threat budget" that grows with time and colony wealth.
- Storyteller avoids two big threats in a row (except Doctor Chaos).
- Good events too: wanderer joins, trader, cargo drop, "a dog finds you".

## Demo subset

Drafting, move/attack orders, cover, 3 melee + 3 ranged weapons, sandbags, scrap turret, rad-rats and glow-hounds, one raider group type, radiation cloud, fire (simple), storyteller The Sheriff + sliders for raid/mutant/environment.
