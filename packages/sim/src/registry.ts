/**
 * Content registry. Turns string ids into small numbers for the typed arrays.
 * Saves store string ids, so content order may change between versions and mods.
 */
import type { Content, ItemDef, TerrainDef, ThingDef } from "@wc/data";

export class Table<T extends { id: string }> {
  readonly list: T[];
  private index = new Map<string, number>();

  constructor(list: T[]) {
    this.list = list;
    list.forEach((d, i) => {
      if (this.index.has(d.id)) throw new Error(`duplicate content id: ${d.id}`);
      this.index.set(d.id, i);
    });
  }

  idx(id: string): number {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`unknown content id: ${id}`);
    return i;
  }

  get(id: string): T {
    return this.list[this.idx(id)];
  }

  has(id: string): boolean {
    return this.index.has(id);
  }
}

export class Registry {
  readonly terrain: Table<TerrainDef>;
  readonly things: Table<ThingDef>;
  readonly items: Table<ItemDef>;

  constructor(readonly content: Content) {
    this.terrain = new Table(content.terrain);
    this.things = new Table(content.things);
    this.items = new Table(content.items);
  }
}
