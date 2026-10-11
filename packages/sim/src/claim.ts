/**
 * Claiming old buildings: survivors patch up ruin walls and rusted doors, and the colony owns them as if
 * it built them. The player orders it (Orders › Claim). A ruin also gets claimed by itself once the
 * colony closes it in and hangs its own door: every old wall around that room is then marked for claim.
 */
import { designate } from "./designations.ts";
import type { Game } from "./game.ts";
import { NO_THING } from "./map.ts";
import { roomAt } from "./rooms.ts";

/** How often (ticks) to look for closed-in ruins. */
const CLAIM_EVERY = 250;

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Corner walls touch their room only on a diagonal. */
const AROUND = [...SIDES, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Rooms (enclosed, not outdoors) next to a door the colony built or claimed. */
function ownRooms(game: Game): Set<number> {
  const out = new Set<number>();
  for (const t of game.things.values()) {
    const d = game.reg.things.list[t.def];
    if (!d.door || !d.build) continue;
    for (const [dx, dy] of SIDES) {
      const r = roomAt(game, t.layer, t.x + dx, t.y + dy);
      if (r && !r.outdoor) out.add(r.id);
    }
  }
  return out;
}

/** Mark every old wall or door around a room the colony has closed in with its own door. */
export function tickClaims(game: Game): void {
  if (game.tick % CLAIM_EVERY !== 0) return;
  const rooms = ownRooms(game);
  if (!rooms.size) return;
  for (const t of game.things.values()) {
    if (!game.reg.things.list[t.def].claimAs) continue;
    const L = game.map.layers[t.layer];
    const i = L.i(t.x, t.y);
    if (L.desig[i] || L.thing[i] === NO_THING) continue;
    if (AROUND.some(([dx, dy]) => {
      const r = roomAt(game, t.layer, t.x + dx, t.y + dy);
      return !!r && rooms.has(r.id);
    })) designate(game, "claim", t.layer, t.x, t.y);
  }
}
