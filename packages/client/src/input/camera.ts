/**
 * Camera: pan and zoom the world container.
 * Desktop: WASD/arrows, drag, mouse wheel. Touch: one-finger drag, pinch.
 * A short press without movement is a "tap" and goes to onTap (selection, later orders).
 */
import type { Container } from "pixi.js";

export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 4;
const DRAG_THRESHOLD = 6;

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private pinchDist = 0;
  onTap: (worldX: number, worldY: number) => void = () => {};

  constructor(
    private el: HTMLElement,
    private world: Container,
    private bounds: { w: number; h: number },
  ) {
    el.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    el.addEventListener("pointerdown", (e) => this.onDown(e));
    el.addEventListener("pointermove", (e) => this.onMove(e));
    el.addEventListener("pointerup", (e) => this.onUp(e));
    el.addEventListener("pointercancel", (e) => this.onUp(e));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  get viewW() {
    return this.el.clientWidth;
  }
  get viewH() {
    return this.el.clientHeight;
  }

  /** Visible world rectangle in world pixels. */
  get view() {
    return { x: this.x - this.viewW / 2 / this.zoom, y: this.y - this.viewH / 2 / this.zoom, w: this.viewW / this.zoom, h: this.viewH / this.zoom };
  }

  centerOn(wx: number, wy: number) {
    this.x = wx;
    this.y = wy;
  }

  screenToWorld(sx: number, sy: number) {
    return { x: this.x + (sx - this.viewW / 2) / this.zoom, y: this.y + (sy - this.viewH / 2) / this.zoom };
  }

  /** Zoom keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  update(dtSec: number) {
    const speed = (700 * dtSec) / this.zoom;
    if (this.keys.has("w") || this.keys.has("arrowup")) this.y -= speed;
    if (this.keys.has("s") || this.keys.has("arrowdown")) this.y += speed;
    if (this.keys.has("a") || this.keys.has("arrowleft")) this.x -= speed;
    if (this.keys.has("d") || this.keys.has("arrowright")) this.x += speed;
    if (this.keys.has("=") || this.keys.has("+")) this.zoomAt(this.viewW / 2, this.viewH / 2, 1 + dtSec * 2);
    if (this.keys.has("-")) this.zoomAt(this.viewW / 2, this.viewH / 2, 1 / (1 + dtSec * 2));
    this.x = Math.max(0, Math.min(this.bounds.w, this.x));
    this.y = Math.max(0, Math.min(this.bounds.h, this.y));
    // Round so pixel art stays crisp.
    this.world.scale.set(this.zoom);
    this.world.position.set(Math.round(this.viewW / 2 - this.x * this.zoom), Math.round(this.viewH / 2 - this.y * this.zoom));
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  }

  private onDown(e: PointerEvent) {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.offsetX, y: e.offsetY };
      this.dragging = false;
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.pinchDistance();
      this.dragging = true; // a pinch is never a tap
    }
  }

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX;
    p.y = e.offsetY;
    if (this.pointers.size === 2) {
      const d = this.pinchDistance();
      const [a, b] = [...this.pointers.values()];
      if (this.pinchDist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinchDist);
      this.pinchDist = d;
      this.x -= dx / 2 / this.zoom;
      this.y -= dy / 2 / this.zoom;
      return;
    }
    if (this.dragStart && !this.dragging) {
      if (Math.hypot(e.offsetX - this.dragStart.x, e.offsetY - this.dragStart.y) > DRAG_THRESHOLD) this.dragging = true;
    }
    if (this.dragging) {
      this.x -= dx / this.zoom;
      this.y -= dy / this.zoom;
    }
  }

  private onUp(e: PointerEvent) {
    const wasTap = this.pointers.size === 1 && !this.dragging && e.type === "pointerup";
    this.pointers.delete(e.pointerId);
    if (wasTap) {
      const w = this.screenToWorld(e.offsetX, e.offsetY);
      this.onTap(w.x, w.y);
    }
    if (this.pointers.size === 0) {
      this.dragStart = null;
      this.dragging = false;
    }
  }

  private pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
