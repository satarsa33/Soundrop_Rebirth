// physics.js — Soundrop Rebirth
// Minimal 2D physics: circular balls, line-segment "instruments", collisions.

export class Ball {
  constructor(x, y, vx = 0, vy = 0, radius = 9) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.age = 0;
    this.trail = [];
    this.dead = false;
  }

  step(dt, world) {
    this.vy += world.gravity * dt;
    if (world.gravityX) this.vx += world.gravityX * dt;
    // air friction: exponential velocity damping
    const damp = Math.exp(-world.airFriction * dt);
    this.vx *= damp;
    this.vy *= damp;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.age += dt;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();

    if (
      this.x < -50 ||
      this.x > world.width + 50 ||
      this.y > world.height + 80
    ) {
      this.dead = true;
    }
    if (this.y < -400) this.dead = true;
  }
}

export class LineInstrument {
  constructor(x1, y1, x2, y2, colorId) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.colorId = colorId;
    this.flashUntil = 0; // timestamp (ms) for hit-flash animation
    this.id = LineInstrument._nextId++;
  }

  get midX() {
    return (this.x1 + this.x2) / 2;
  }
  get midY() {
    return (this.y1 + this.y2) / 2;
  }
  get length() {
    return Math.hypot(this.x2 - this.x1, this.y2 - this.y1);
  }

  toJSON() {
    return {
      x1: this.x1,
      y1: this.y1,
      x2: this.x2,
      y2: this.y2,
      colorId: this.colorId,
    };
  }
}
LineInstrument._nextId = 1;

// Closest point on a segment to a given point, plus distance.
function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return { x: cx, y: cy, t };
}

// Resolve ball vs. line-segment collision. Returns collision info or null.
export function resolveBallLine(ball, line, restitution) {
  const c = closestPointOnSegment(ball.x, ball.y, line.x1, line.y1, line.x2, line.y2);
  const dx = ball.x - c.x;
  const dy = ball.y - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= ball.radius || dist === 0) return null;

  // Normal pointing away from the line toward the ball.
  const nx = dx / dist;
  const ny = dy / dist;

  // Push ball out of the line.
  const overlap = ball.radius - dist;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  const speedBefore = Math.hypot(ball.vx, ball.vy);

  // Reflect velocity around the normal, scaled by restitution.
  const vDotN = ball.vx * nx + ball.vy * ny;
  ball.vx = ball.vx - (1 + restitution) * vDotN * nx;
  ball.vy = ball.vy - (1 + restitution) * vDotN * ny;

  return { speed: speedBefore, point: c, colorId: line.colorId };
}

export function stepWorld(balls, lines, world, dt, onCollision) {
  for (const ball of balls) {
    ball.step(dt, world);
    for (const line of lines) {
      const hit = resolveBallLine(ball, line, world.restitution);
      if (hit && onCollision) onCollision(ball, line, hit);
    }
  }
  return balls.filter((b) => !b.dead);
}
