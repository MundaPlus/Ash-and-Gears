# 05 — Automation and tech

## Principle: progressive automation

The colony starts with bare hands. Each tech tier moves a kind of work from survivors to machines. Survivors become operators, defenders and explorers.

| Tier | Name | Power | Logistics | Production |
|---|---|---|---|---|
| 0 | Scrap Age | None (fire, muscle) | Survivors haul by hand | Hand-worked benches |
| 1 | Salvage Age | Scrap generator (wood/fuel), wires, batteries | Hand carts, first conveyor belt | Smelter, powered benches (faster) |
| 2 | Machine Age | Solar panels, wind turbine, fuel generator | Belts, splitters, loaders (bench in/out), pipes for water | **Auto-crafter** (recipe set, no survivor), pump, purifier, hydroponics |
| 3 | Old-World Age | Geothermal, fuel refinery | Hauler drones, sorters, underground belts | Assembler lines, refinery, auto-kitchen (nutrient paste), turrets with ammo belts |
| 4 | Reborn Age | Restored reactor (story) | Robot workers (build, mine, farm) | Robot factory, bionics, story machines |

## Power

- Power network: generators, consumers and batteries linked by wires (or adjacency for conduits).
- Network has supply (W) and demand (W). Shortage → consumers run slower or stop by priority.
- Machines can break down. Repair needs components and Tech skill.
- Underground: wires go through ladders/stairs links.

## Logistics

- **Conveyor belt**: moves items 1 tile per X ticks. Directional. Tier 1 basic, tier 2 fast.
- **Loader / unloader**: puts items into or takes them out of a bench, crafter or stockpile.
- **Splitter / sorter**: splits or filters items (tier 2/3).
- **Pipes** (tier 2): water and fuel. Tanks store fluid.
- **Hauler drones** (tier 3): fly items between stockpiles and machines. Need charge pads.
- Belts and survivors share the same item system. A survivor can pick items off a belt.

## Auto-crafters

- Placed building with a recipe. Input from loaders or survivors. Output to a belt or the tile.
- Speed and quality: lower quality than a skilled survivor at first; tier upgrades raise it.
- This creates a real choice: skilled hand-crafted gear vs mass machine output.

## Robots (tier 4)

- Robot types: builder, miner, farmer, hauler, guard.
- No mood. Need charge and repairs. Can be hacked by raiders (event) — dark humor: "Your robot joined the Rust Knights."

## Research

- Research desk (tier 0), lab (tier 2), old-world terminal (tier 3).
- Research points from survivors (Technology skill) at a desk.
- Tree: about 60 nodes in the full game, grouped by tier and branch (Power, Logistics, Production, Food & Water, Medicine, Defense, Vehicles).
- **Blueprints**: key nodes need a blueprint item before research can start. Blueprints come from salvage (rare), expeditions, trade and quests.
- Example: "Auto-crafter" needs blueprint "Factory Control Manual". "Reactor Restart" needs "Reactor Schematics" (story item).

## Demo subset

- Tier 0 and tier 1 complete, plus one tier 2 machine (auto-crafter, basic).
- Research desk with about 10 nodes. 1 blueprint-gated node (blueprint found in a ruin on the home map).
- Scrap generator, wires, battery, lamp, powered bench, conveyor belt, loader, auto-crafter.
