# 01 — Survivors (colonists)

## Count

- Start: 3 survivors (scenario can change this).
- Soft cap: 20. Storyteller lowers join events above 15.
- New survivors join by: wanderer events, rescue, recruit prisoners, trade, story events, births (post-alpha, optional).

## Identity

Each survivor has:

- Name and nickname (generated, sometimes funny: "Two-Can Mendez").
- Age, gender (cosmetic and pronoun only), portrait built from parts.
- **Backstory**: one pre-war job + one post-war life. Each gives skill bonuses, maybe a work restriction ("Ex-Banker: will not do dumb labor").
- 1–3 **traits**.
- 10 **skills**.
- Body with parts (health).
- Relationship list.
- Thought log (recent mood thoughts).

## Needs

| Need | Drops when | Fix | Low effect |
|---|---|---|---|
| Hunger | Always | Eat food | Mood penalty, then starving damage |
| Rest | Awake | Sleep in bed (better), on floor (worse) | Slow work, then collapse |
| Thirst | Always | Drink clean water | Faster than hunger. Dirty water: disease risk, rad dose |
| Recreation | Working | Chat, games, booze, jukebox | Mood penalty |
| Comfort | Standing, sitting on floor | Chairs, beds | Small mood penalty |
| Beauty | Ugly or dirty rooms | Clean rooms, decoration | Small mood penalty |
| Outdoors | Inside for long | Go outside (if air is safe) | Small mood penalty |

Thirst is a confirmed addition for the setting (user approved). Clean water is a key resource.

## Mood

- Mood is 0–100. It is the sum of base + all active thoughts.
- Thoughts have value, duration and stack limits. Examples:
  - "Ate a fine meal" +5. "Ate raw mutant meat" −7. "Ate raw mutant meat (Iron Stomach)" +2.
  - "Slept outside in acid rain" −8. "Friend died" −20. "Saw a corpse" −3.
- **Mental breaks** below thresholds:
  - Minor (< 35): sulk, binge eat, hide in room, rant at the sky.
  - Major (< 20): drunken rampage, food hoarding, insult spree, "tries to start a cult".
  - Extreme (< 5): violent rage, run away into the wasteland, destroy a machine.
- **Inspiration** above 85 (chance): faster work, better crafting, a free research boost.

## Skills (0–20)

Shooting, Melee, Construction, Mining, Cooking, Farming, Crafting, Medicine, Scavenging, Technology (research + machines), Social.

- Skills grow by use. Skills slowly decay above level 10 when unused.
- **Passion** (none / interested / burning) changes learning speed and mood from doing that work.

## Traits (examples, full list in data)

| Trait | Effect |
|---|---|
| Iron Stomach | Can eat raw and rotten food without penalty |
| Rad-Hardened | 50% less radiation dose |
| Paranoid | Mood penalty without walls; bonus when guarding |
| Optimist / Pessimist | Base mood +/− |
| Hoarder | Happy near full stockpiles |
| Tinkerer | Faster machine repair; sometimes "improves" machines (random effect) |
| Lazy | 20% slower work; more recreation need |
| Night Owl | Prefers night work |
| Cannibal | Human meat is fine. Others dislike them |
| Lucky Idiot | Low skills; survives things they should not |
| Pyromaniac | Random fire-starting break |
| Old-Worlder | Remembers before the war. Tech bonus. Sad about everything |

## Health

- Body parts: head, torso, 2 arms, 2 hands, 2 legs, 2 feet, eyes, internal organs (simplified: heart, lungs, stomach, liver).
- Injuries: cut, bruise, gunshot, bite, burn, fracture. Each has bleed rate, pain and heal time.
- Conditions: infection, disease (from dirty water/food), radiation sickness (stages), hypothermia, heatstroke, addiction.
- Capacities derived from parts: moving, manipulation, sight, consciousness, breathing.
- **Radiation dose** is a counter. It slowly drops. Stages: none → mild (nausea) → serious (weakness) → severe (organ damage) → lethal. Rad-Away-style medicine lowers it.
- Medicine: bandages, scrap medkits, old-world medkits. Doctor skill sets quality.
- Prosthetics: scrap limbs (weak, cheap) → old-world bionics (strong, rare, from expeditions).

## Relationships

- Opinion of each other survivor: −100 to +100. Changes from chats, insults, shared events, traits.
- Relation types: friend, rival, lover, spouse, ex, family.
- Events: romance, breakups, fights, grief for dead.
- Social skill improves chats and trade.

## Work

- Work types: Doctor, Firefight, Patient/Rest, Cook, Hunt, Construct, Grow, Mine, Salvage, Smith/Craft, Tech (research + machines), Haul, Clean, Guard.
- **Work priority grid**: survivors × work types, values 1–4 or off. Simple mode: on/off only.
- Schedule: hours set to sleep / work / recreation / anything.
- Survivor can be **drafted** (see `06-combat-threats.md`).

## Demo subset

Hunger, rest, thirst, mood with ~20 thoughts, minor breaks only, 6 skills, 8 traits, simple health (HP per body region, bleeding, rad dose), no relationships beyond opinion number.
