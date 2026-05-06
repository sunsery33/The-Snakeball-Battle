import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "..");
const PORT = Number.parseInt(process.env.PORT || "3000", 10);

const ROOM_SIZE = 11;
const QUICK_ROOM_PREFIX = "Q";
const TICK_RATE = 30;
const SNAPSHOT_RATE = 12;
const TICK_DT = 1 / TICK_RATE;

const TAU = Math.PI * 2;
const WORLD_SIZE = 3900;
const WORLD_MIN = -WORLD_SIZE / 2;
const WORLD_MAX = WORLD_SIZE / 2;
const FOOD_TARGET = 500;
const DROPPED_FOOD_LIMIT = 360;
const SPIKE_TARGET = 14;
const MAX_DT = 0.05;
const MERGE_BODY_SAFE_THRESHOLD = 0.12;
const MERGE_MIN_DRAIN_TIME = 0.72;
const MERGE_START_ENERGY = 0.18;
const MERGE_RESTART_ENERGY = 0.55;
const LENGTHEN_CHARGE_TIME = 7.2;
const SHORTEN_CHARGE_TIME = 6.2;
const SPIT_FOOD_COST = 3.2;
const SPIT_COOLDOWN = 0.18;
const SPIT_SPEED = 780;
const MIN_SEGMENTS = 5;
const NORMAL_MAX_SEGMENTS = 22;
const STRETCH_MAX_SEGMENTS = 42;
const MIN_CHUBBY_UNIT_MASS = 12.5;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
]);

const palettes = [
  { main: "#4de0ff", light: "#d9fbff", dark: "#087d9b", ring: "#ffffff" },
  { main: "#ff5d73", light: "#ffd2d9", dark: "#98253d", ring: "#ffe5ea" },
  { main: "#ffd166", light: "#fff2bd", dark: "#a56b00", ring: "#fff8d9" },
  { main: "#75f0a4", light: "#e0ffe9", dark: "#208b48", ring: "#effff3" },
  { main: "#b38cff", light: "#efe5ff", dark: "#5731aa", ring: "#f7f0ff" },
  { main: "#ff9f4a", light: "#ffe1bc", dark: "#9e4f00", ring: "#fff0dc" },
  { main: "#f06ee6", light: "#ffd8fb", dark: "#8f2488", ring: "#fff1fd" },
  { main: "#7be7d8", light: "#e1fffb", dark: "#168074", ring: "#effffc" },
];

const pelletColors = [
  "#4de0ff",
  "#ff5d73",
  "#ffd166",
  "#75f0a4",
  "#b38cff",
  "#ff9f4a",
  "#f06ee6",
  "#7be7d8",
];

const botNames = [
  "Nova",
  "Pulse",
  "Orbit",
  "Vector",
  "Blaze",
  "Prism",
  "Comet",
  "Echo",
  "Flux",
  "Quanta",
  "Spark",
];

const rooms = new Map();
const clients = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleLerp(a, b, t) {
  let diff = ((b - a + Math.PI) % TAU) - Math.PI;
  if (diff < -Math.PI) diff += TAU;
  return a + diff * t;
}

function radiusFromMass(mass) {
  return 4.8 + Math.sqrt(Math.max(1, mass)) * 2.35;
}

function worldRand() {
  return randomRange(WORLD_MIN + 120, WORLD_MAX - 120);
}

function paletteForSkin(index) {
  return palettes[clamp(Number.isInteger(index) ? index : 0, 0, palettes.length - 1)];
}

function normalizeName(value) {
  return String(value || "Guest")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16) || "Guest";
}

function normalizeSkinIndex(value) {
  return Number.isInteger(value) ? clamp(value, 0, palettes.length - 1) : 0;
}

function safeJson(value) {
  return JSON.stringify(value);
}

function send(client, type, payload = {}) {
  if (client.readyState !== WebSocket.OPEN) return;
  client.send(safeJson({ type, ...payload }));
}

function broadcast(room, type, payload = {}) {
  for (const player of room.players.values()) {
    send(player.socket, type, payload);
  }
}

function makeClientId() {
  return `p_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function makeRoomCode(prefix = "") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    let code = prefix;
    while (code.length < 4) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error("Unable to allocate room code");
}

function makeSegment(x, y, mass) {
  return {
    x,
    y,
    mass,
    wobble: Math.random() * TAU,
  };
}

function makeWorld() {
  return {
    snakes: [],
    foods: [],
    shots: [],
    spikes: [],
    particles: [],
    texts: [],
    elapsed: 0,
    snapshotClock: 0,
  };
}

function totalMass(snake) {
  return snake.segments.reduce((sum, segment) => sum + segment.mass, 0);
}

function unitMass(snake) {
  if (!snake.segments.length) return 0;
  return totalMass(snake) / snake.segments.length;
}

function headMass(snake) {
  if (!snake.segments.length) return 0;
  const base = unitMass(snake);
  const pooled = (totalMass(snake) - base) * snake.merge;
  return base + pooled;
}

function easeInOut(value) {
  value = clamp(value, 0, 1);
  return value * value * (3 - 2 * value);
}

function segmentAbsorbStage(snake, index) {
  if (index <= 0 || snake.segments.length <= 1) return 0;
  const bodyCount = snake.segments.length - 1;
  const delay = ((index - 1) / Math.max(1, bodyCount - 1)) * 0.34;
  return clamp((snake.merge - delay) / 0.66, 0, 1);
}

function segmentAbsorbProgress(snake, index) {
  return easeInOut(segmentAbsorbStage(snake, index));
}

function normalSegmentRadius(snake) {
  return radiusFromMass(unitMass(snake)) * (snake.spikeScale ?? 1);
}

function segmentRadius(snake, index) {
  const base = normalSegmentRadius(snake);
  if (index === 0) {
    return lerp(base, radiusFromMass(headMass(snake)) * (snake.spikeScale ?? 1), easeInOut(snake.merge));
  }
  return base;
}

function collisionRadius(snake, index) {
  if (index === 0) return segmentRadius(snake, index);
  if (snake.merge > MERGE_BODY_SAFE_THRESHOLD) return 0;
  const visibleBody = 1 - segmentAbsorbProgress(snake, index);
  return segmentRadius(snake, index) * visibleBody * visibleBody;
}

function desiredGap(snake) {
  const radius = normalSegmentRadius(snake);
  return Math.max(4, radius * 2 * 0.74);
}

function createSnake(participant, x = worldRand(), y = worldRand()) {
  const angle = Math.random() * TAU;
  const segments = [];
  const startMass = randomRange(participant.isHuman ? 15.5 : 13.5, participant.isHuman ? 17.5 : 18.5);

  for (let index = 0; index < MIN_SEGMENTS; index += 1) {
    segments.push(makeSegment(x - Math.cos(angle) * index * 18, y - Math.sin(angle) * index * 18, startMass));
  }

  return {
    id: participant.id,
    name: participant.name,
    skinIndex: participant.skinIndex,
    isHuman: Boolean(participant.isHuman),
    segments,
    angle,
    targetAngle: angle,
    merge: 0,
    mergeHold: false,
    mergeEnergy: 1,
    mergeExhausted: false,
    mergeEmptyNotified: false,
    mergeIntent: false,
    mergeDrainTimer: 0,
    lengthenCharge: 1,
    shortenCharge: 1,
    manualLengthOffset: 0,
    boostHold: false,
    boostEmitClock: 0,
    spitCooldown: 0,
    spikeScale: 1,
    spikeDragSeverity: 0,
    digestMass: 0,
    stun: 0,
    respawnTimer: 0,
    invulnerable: 1.2,
    alive: true,
    kills: 0,
    ai: {
      timer: 0,
      targetX: x + Math.cos(angle) * 300,
      targetY: y + Math.sin(angle) * 300,
      mode: "food",
    },
  };
}

function desiredNormalSegments(mass) {
  const growthMass = Math.max(0, mass - 82);
  return clamp(Math.round(MIN_SEGMENTS + growthMass / 105), MIN_SEGMENTS, NORMAL_MAX_SEGMENTS);
}

function chubbySegmentLimit(mass, maxSegments = STRETCH_MAX_SEGMENTS) {
  return clamp(Math.floor(Math.max(0, mass) / MIN_CHUBBY_UNIT_MASS), MIN_SEGMENTS, maxSegments);
}

function equalizeSnakeMass(snake, mass = totalMass(snake)) {
  if (!snake.segments.length) return;
  const share = Math.max(1, mass / snake.segments.length);
  for (const segment of snake.segments) {
    segment.mass = share;
  }
}

function setSnakeSegmentCount(snake, desired, mass = totalMass(snake)) {
  const maxSegments = chubbySegmentLimit(mass);
  desired = clamp(Math.round(desired), MIN_SEGMENTS, maxSegments);

  while (snake.segments.length < desired) {
    const tail = snake.segments[snake.segments.length - 1];
    const tailRadius = segmentRadius(snake, snake.segments.length - 1);
    snake.segments.push(
      makeSegment(
        tail.x - Math.cos(snake.angle) * (tailRadius + 8) + randomRange(-7, 7),
        tail.y - Math.sin(snake.angle) * (tailRadius + 8) + randomRange(-7, 7),
        1,
      ),
    );
  }

  while (snake.segments.length > desired && snake.segments.length > MIN_SEGMENTS) {
    snake.segments.pop();
  }

  equalizeSnakeMass(snake, mass);
  return snake.segments.length;
}

function rebalanceSnake(snake) {
  if (!snake.alive || !snake.segments.length) return;
  const mass = totalMass(snake);
  const normalDesired = desiredNormalSegments(mass);
  const desired = clamp(normalDesired + snake.manualLengthOffset, MIN_SEGMENTS, STRETCH_MAX_SEGMENTS);
  setSnakeSegmentCount(snake, desired, mass);
}

function growSnake(snake, amount, options = {}) {
  if (!snake.alive || amount <= 0) return;
  const mass = totalMass(snake) + amount;
  if (options.keepSegments) {
    equalizeSnakeMass(snake, mass);
    return;
  }
  equalizeSnakeMass(snake, mass);
  rebalanceSnake(snake);
}

function availableSnakeMass(snake) {
  const mass = totalMass(snake);
  const minimum = snake.segments.length * MIN_CHUBBY_UNIT_MASS;
  return Math.max(0, mass - minimum);
}

function spendSnakeMass(snake, amount) {
  const mass = totalMass(snake);
  const spent = clamp(amount, 0, availableSnakeMass(snake));
  equalizeSnakeMass(snake, mass - spent);
  return spent;
}

function addText(world, x, y, value, color = "#ffffff") {
  world.texts.push({
    x,
    y,
    value,
    color,
    life: 0.95,
    age: 0,
    vy: -38,
  });
}

function addParticles(world, x, y, color, count = 14, force = 1) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * TAU;
    const speed = randomRange(40, 180) * force;
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomRange(2, 5.5),
      color,
      life: randomRange(0.35, 0.78),
      age: 0,
    });
  }
}

function trimDroppedFood(world) {
  let dropped = 0;
  for (const food of world.foods) {
    if (!food.ambient) dropped += 1;
  }
  if (dropped <= DROPPED_FOOD_LIMIT) return;

  const removeCount = dropped - DROPPED_FOOD_LIMIT;
  let removed = 0;
  for (let index = 0; index < world.foods.length && removed < removeCount; ) {
    if (world.foods[index].ambient) {
      index += 1;
      continue;
    }
    world.foods.splice(index, 1);
    removed += 1;
  }
}

function spawnFood(world, x = worldRand(), y = worldRand(), mass = randomRange(2.2, 7.2), color = pick(pelletColors), ambient = true) {
  world.foods.push({
    x,
    y,
    mass,
    radius: radiusFromMass(mass) * 0.48,
    color,
    ambient,
    spin: Math.random() * TAU,
  });
  if (!ambient) trimDroppedFood(world);
}

function spawnFoodBurst(world, x, y, mass, color) {
  const count = clamp(Math.ceil(mass / 5.2), 2, 24);
  const share = mass / count;

  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * TAU;
    const distance = randomRange(7, 74);
    const pelletMass = Math.max(1.8, share * randomRange(0.72, 1.32));
    spawnFood(
      world,
      clamp(x + Math.cos(angle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
      clamp(y + Math.sin(angle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
      pelletMass,
      color || pick(pelletColors),
      false,
    );
  }

  trimDroppedFood(world);
}

function spawnSpike(world, x = worldRand(), y = worldRand()) {
  world.spikes.push({
    x,
    y,
    vx: 0,
    vy: 0,
    mass: randomRange(55, 90),
    radius: randomRange(24, 34),
    spin: Math.random() * TAU,
  });
}

function initializeWorld(world) {
  world.foods = [];
  world.spikes = [];
  while (world.foods.length < FOOD_TARGET) spawnFood(world);
  while (world.spikes.length < SPIKE_TARGET) spawnSpike(world);
}

function updateLengthCharges(snake, dt) {
  snake.lengthenCharge = Math.min(1, snake.lengthenCharge + dt / LENGTHEN_CHARGE_TIME);
  snake.shortenCharge = Math.min(1, snake.shortenCharge + dt / SHORTEN_CHARGE_TIME);
}

function adjustSnakeLength(world, snake, delta) {
  if (!snake || !snake.alive) return false;

  const chargeKey = delta > 0 ? "lengthenCharge" : "shortenCharge";
  if (snake[chargeKey] < 1 || snake.merge > 0.08) return false;

  const mass = totalMass(snake);
  const beforeLength = snake.segments.length;
  const maxSegments = chubbySegmentLimit(mass);
  const target = clamp(beforeLength + delta, MIN_SEGMENTS, maxSegments);
  if (target === beforeLength) return false;

  const actualLength = setSnakeSegmentCount(snake, target, mass);
  snake.manualLengthOffset = actualLength - desiredNormalSegments(mass);
  snake[chargeKey] = 0;

  const changed = Math.abs(actualLength - beforeLength);
  const head = snake.segments[0];
  addText(world, head.x, head.y - 22, delta > 0 ? `+${changed} BALL` : `-${changed} BALL`, paletteForSkin(snake.skinIndex).light);
  return true;
}

function spitFood(world, snake) {
  if (!snake || !snake.alive || snake.spitCooldown > 0) return false;
  if (snake.merge > 0.14) return false;
  if (availableSnakeMass(snake) < SPIT_FOOD_COST * 0.72) {
    snake.spitCooldown = SPIT_COOLDOWN;
    return false;
  }

  const spent = spendSnakeMass(snake, SPIT_FOOD_COST);
  rebalanceSnake(snake);
  const head = snake.segments[0];
  const radius = segmentRadius(snake, 0);
  const x = head.x + Math.cos(snake.angle) * (radius + 12);
  const y = head.y + Math.sin(snake.angle) * (radius + 12);
  const color = paletteForSkin(snake.skinIndex).main;

  world.shots.push({
    x,
    y,
    vx: Math.cos(snake.angle) * SPIT_SPEED,
    vy: Math.sin(snake.angle) * SPIT_SPEED,
    mass: spent * 0.92,
    radius: radiusFromMass(spent) * 0.5,
    color,
    ownerId: snake.id,
    life: 1.05,
    age: 0,
    spin: Math.random() * TAU,
  });

  snake.spitCooldown = SPIT_COOLDOWN;
  addParticles(world, x, y, color, 6, 0.36);
  return true;
}

function shedBoostFood(world, snake, dt) {
  if (!snake.alive || !snake.boostHold || totalMass(snake) < 62) return false;
  snake.boostEmitClock -= dt;
  let emitted = false;

  while (snake.boostEmitClock <= 0) {
    snake.boostEmitClock += 0.12;
    const tail = snake.segments[snake.segments.length - 1];
    const pelletMass = randomRange(0.8, 1.35);
    const spent = spendSnakeMass(snake, pelletMass);
    if (spent <= 0.05) break;

    const backAngle = snake.angle + Math.PI + randomRange(-0.55, 0.55);
    const tailRadius = segmentRadius(snake, snake.segments.length - 1);
    const distance = tailRadius + randomRange(8, 20);
    const color = paletteForSkin(snake.skinIndex).main;
    spawnFood(
      world,
      clamp(tail.x + Math.cos(backAngle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
      clamp(tail.y + Math.sin(backAngle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
      spent * 0.9,
      color,
      false,
    );
    addParticles(world, tail.x, tail.y, color, snake.isHuman ? 2 : 1, 0.24);
    emitted = true;
  }

  if (emitted) rebalanceSnake(snake);
  return emitted;
}

function spikePressureForSnake(snake, mass = totalMass(snake), length = snake.segments.length) {
  const massPressure = clamp((mass - 150) / 680, 0, 1);
  const lengthPressure = clamp((length - 8) / 24, 0, 1);
  return Math.max(massPressure, lengthPressure);
}

function spikeOuchText(pressure) {
  return `ouc${"h".repeat(1 + Math.round(pressure * 5))}`;
}

function splitSnakeBySpike(world, snake, spike) {
  if (!snake.alive) return;

  const beforeMass = totalMass(snake);
  const beforeLength = snake.segments.length;
  const pressure = spikePressureForSnake(snake, beforeMass, beforeLength);
  const shrinkRatio = lerp(0.12, 0.48, pressure);
  const spikeReward = spike.mass * lerp(0.42, 1.08, pressure);
  const shrinkScale = clamp(1 - shrinkRatio, 0.42, 1);
  const palette = paletteForSkin(snake.skinIndex);

  snake.spikeScale = Math.min(snake.spikeScale ?? 1, shrinkScale);
  snake.digestMass += spikeReward;
  snake.spikeDragSeverity = Math.max(snake.spikeDragSeverity, lerp(0.14, 0.86, pressure));
  snake.stun = Math.max(snake.stun, lerp(0.03, 0.24, pressure));

  spawnFoodBurst(world, spike.x, spike.y, spike.mass * lerp(0.12, 0.22, pressure), "#75f0a4");
  addParticles(world, spike.x, spike.y, "#75f0a4", 28, 1.35);
  addText(world, spike.x, spike.y - 18, spikeOuchText(pressure), palette.light);
}

function digestSpikeMass(snake, dt) {
  if (!snake.alive || snake.digestMass <= 0) return 0;

  const severity = snake.spikeDragSeverity || 0;
  const massPressure = clamp((totalMass(snake) - 180) / 900, 0, 1);
  const passiveRate = lerp(snake.isHuman ? 5.2 : 4.8, snake.isHuman ? 2.6 : 2.3, massPressure);
  const mergeRate = snake.mergeHold ? lerp(3.4, 1.4, massPressure) : 0;
  const rate = (passiveRate + mergeRate) * lerp(1, 0.58, severity);
  const amount = Math.min(snake.digestMass, dt * rate);
  snake.digestMass -= amount;
  growSnake(snake, amount, { keepSegments: true });
  snake.manualLengthOffset = snake.segments.length - desiredNormalSegments(totalMass(snake));
  if (snake.digestMass <= 0.001) snake.digestMass = 0;
  return amount;
}

function updateSpikeScale(snake, dt) {
  if (!snake.alive) return;
  snake.spikeScale = snake.spikeScale ?? 1;
  if (snake.spikeScale < 1) {
    const severity = snake.spikeDragSeverity || 0;
    const massPressure = clamp((totalMass(snake) - 180) / 900, 0, 1);
    const recoverRate = lerp(0.095, 0.035, Math.max(severity, massPressure));
    snake.spikeScale = Math.min(1, snake.spikeScale + dt * recoverRate);
  }
  if (snake.digestMass <= 0 && snake.spikeScale >= 0.999) {
    snake.spikeScale = 1;
    snake.spikeDragSeverity = 0;
  }
}

function canStartMerge(snake) {
  return !snake.mergeExhausted && snake.mergeEnergy >= MERGE_START_ENERGY;
}

function updateMergeEnergy(world, snake, dt) {
  if (!snake.alive) return;

  if (snake.mergeHold && !snake.mergeIntent && snake.mergeEnergy > 0) {
    snake.mergeDrainTimer = Math.max(snake.mergeDrainTimer, MERGE_MIN_DRAIN_TIME);
  }

  const forcedDrain = snake.mergeDrainTimer > 0;
  const bodySafeWindow = snake.merge > MERGE_BODY_SAFE_THRESHOLD;
  const shouldDrain = (snake.mergeHold || forcedDrain || bodySafeWindow) && snake.mergeEnergy > 0;

  if (shouldDrain) {
    const releaseTax = bodySafeWindow && !snake.mergeHold ? 0.1 : 0;
    const drain = dt * (0.18 + snake.merge * 0.14 + releaseTax);
    snake.mergeEnergy = Math.max(0, snake.mergeEnergy - drain);
    snake.mergeDrainTimer = Math.max(0, snake.mergeDrainTimer - dt);

    if (snake.mergeEnergy <= 0) {
      snake.mergeHold = false;
      snake.mergeExhausted = true;
      snake.mergeDrainTimer = 0;
      if (!snake.mergeEmptyNotified && snake.segments[0]) {
        snake.mergeEmptyNotified = true;
        addText(world, snake.segments[0].x, snake.segments[0].y - 28, "EMPTY", paletteForSkin(snake.skinIndex).light);
      }
    }

    snake.mergeIntent = snake.mergeHold;
    return;
  }

  const recoverRate = snake.merge > 0.03 ? 0.52 : 0.22;
  snake.mergeEnergy = Math.min(1, snake.mergeEnergy + dt * recoverRate);

  if (snake.mergeEnergy >= MERGE_RESTART_ENERGY && snake.merge < 0.03) {
    snake.mergeExhausted = false;
    snake.mergeEmptyNotified = false;
  }

  snake.mergeIntent = snake.mergeHold;
}

function killSnake(world, snake, killer = null) {
  if (!snake.alive) return;

  const deathMass = totalMass(snake);
  snake.alive = false;
  snake.mergeHold = false;
  snake.mergeExhausted = false;
  snake.mergeIntent = false;
  snake.mergeDrainTimer = 0;
  snake.boostHold = false;
  snake.merge = 0;
  snake.mergeEnergy = 1;
  snake.spitCooldown = 0;
  snake.spikeScale = 1;
  snake.digestMass = 0;
  snake.spikeDragSeverity = 0;
  snake.respawnTimer = 2.6;

  const palette = paletteForSkin(snake.skinIndex);
  for (const segment of snake.segments) {
    spawnFoodBurst(world, segment.x, segment.y, segment.mass * 0.95, palette.main);
  }

  const head = snake.segments[0];
  addParticles(world, head.x, head.y, palette.main, 30, 1.1);

  if (killer && killer.alive) {
    killer.kills += 1;
    growSnake(killer, Math.max(8, deathMass * 0.16));
    addText(world, head.x, head.y - 18, "K.O.", paletteForSkin(killer.skinIndex).light);
  }
}

function severSnake(world, defender, cutIndex, attacker) {
  if (!defender.alive || !attacker.alive || cutIndex <= 0) return;

  const removed = defender.segments.slice(cutIndex);
  const bitten = removed[0];
  defender.segments = defender.segments.slice(0, cutIndex);
  const defenderPalette = paletteForSkin(defender.skinIndex);
  const attackerPalette = paletteForSkin(attacker.skinIndex);

  growSnake(attacker, bitten.mass * 0.82);
  spawnFoodBurst(world, bitten.x, bitten.y, bitten.mass * 0.28, attackerPalette.main);

  for (let index = 1; index < removed.length; index += 1) {
    const segment = removed[index];
    spawnFoodBurst(world, segment.x, segment.y, segment.mass * 0.94, defenderPalette.main);
    addParticles(world, segment.x, segment.y, defenderPalette.main, 4, 0.8);
  }

  attacker.kills += removed.length >= 4 ? 1 : 0;
  defender.stun = Math.max(defender.stun, 0.34);
  addParticles(world, bitten.x, bitten.y, attackerPalette.main, 22, 1.1);
  addText(world, bitten.x, bitten.y - 18, "YUMMY", attackerPalette.light);

  if (defender.segments.length < 3 || totalMass(defender) < 32) {
    killSnake(world, defender, attacker);
    return;
  }

  const remainingMass = totalMass(defender);
  equalizeSnakeMass(defender, remainingMass);
  defender.manualLengthOffset = defender.segments.length - desiredNormalSegments(remainingMass);
}

function nearestFood(world, x, y, radius = 680) {
  let best = null;
  let bestDist = radius * radius;
  for (const food of world.foods) {
    const distance = distSq(x, y, food.x, food.y);
    if (distance < bestDist) {
      best = food;
      bestDist = distance;
    }
  }
  return best;
}

function findDanger(world, snake) {
  const head = snake.segments[0];
  const ownMass = headMass(snake);
  let best = null;
  let bestDist = Infinity;

  for (const other of world.snakes) {
    if (!other.alive || other === snake) continue;
    const otherHead = other.segments[0];
    const otherMass = headMass(other);
    if (otherMass < ownMass * 1.14) continue;
    const distance = distSq(head.x, head.y, otherHead.x, otherHead.y);
    if (distance < bestDist && distance < 560 * 560) {
      best = otherHead;
      bestDist = distance;
    }
  }

  return best;
}

function findEdibleSegment(world, snake) {
  const head = snake.segments[0];
  const ownMass = headMass(snake);
  let best = null;
  let bestDist = Infinity;

  for (const other of world.snakes) {
    if (!other.alive || other === snake || other.invulnerable > 0) continue;
    for (let index = 1; index < other.segments.length; index += 1) {
      const segment = other.segments[index];
      if (ownMass < segment.mass * 1.12) continue;
      const distance = distSq(head.x, head.y, segment.x, segment.y);
      if (distance < bestDist && distance < 760 * 760) {
        best = { x: segment.x, y: segment.y, distance: Math.sqrt(distance), owner: other };
        bestDist = distance;
      }
    }
  }

  return best;
}

function updateAi(world, snake, dt) {
  snake.ai.timer -= dt;
  const head = snake.segments[0];

  if (snake.ai.timer <= 0) {
    snake.ai.timer = randomRange(0.18, 0.42);
    snake.mergeHold = false;

    const danger = findDanger(world, snake);
    if (danger) {
      snake.ai.mode = "flee";
      snake.ai.targetX = head.x + (head.x - danger.x) * 1.25 + randomRange(-90, 90);
      snake.ai.targetY = head.y + (head.y - danger.y) * 1.25 + randomRange(-90, 90);
    } else {
      const target = findEdibleSegment(world, snake);
      if (target && Math.random() < 0.72) {
        snake.ai.mode = "attack";
        snake.ai.targetX = target.x;
        snake.ai.targetY = target.y;
        snake.mergeHold = canStartMerge(snake) && target.distance < 380 && totalMass(snake) > 95;
      } else {
        snake.ai.mode = "food";
        const food = nearestFood(world, head.x, head.y, 820);
        if (food) {
          snake.ai.targetX = food.x;
          snake.ai.targetY = food.y;
        } else {
          snake.ai.targetX = clamp(head.x + randomRange(-460, 460), WORLD_MIN + 120, WORLD_MAX - 120);
          snake.ai.targetY = clamp(head.y + randomRange(-460, 460), WORLD_MIN + 120, WORLD_MAX - 120);
        }

        if (canStartMerge(snake) && snake.mergeEnergy > 0.45 && totalMass(snake) > 210 && Math.random() < 0.08) {
          snake.mergeHold = true;
        }
      }
    }
  }

  const margin = 270;
  if (head.x < WORLD_MIN + margin) snake.ai.targetX = head.x + 520;
  if (head.x > WORLD_MAX - margin) snake.ai.targetX = head.x - 520;
  if (head.y < WORLD_MIN + margin) snake.ai.targetY = head.y + 520;
  if (head.y > WORLD_MAX - margin) snake.ai.targetY = head.y - 520;

  snake.targetAngle = angleTo(head.x, head.y, snake.ai.targetX, snake.ai.targetY);
}

function sanitizeInput(input = {}) {
  return {
    targetAngle: Number.isFinite(input.targetAngle) ? input.targetAngle : 0,
    mergeHold: Boolean(input.mergeHold),
    boostHold: Boolean(input.boostHold),
    spitHold: Boolean(input.spitHold),
  };
}

function applyInput(world, snake, input) {
  const control = sanitizeInput(input);
  snake.targetAngle = control.targetAngle;

  const canContinueMerge = snake.mergeHold && snake.mergeEnergy > 0;
  snake.mergeHold = control.mergeHold && (canContinueMerge || canStartMerge(snake));
  snake.boostHold = control.boostHold;

  if (control.spitHold && snake.merge <= 0.14) {
    spitFood(world, snake);
  }
}

function updateSnake(world, room, snake, dt) {
  if (!snake.alive || snake.segments.length === 0) return;

  snake.invulnerable = Math.max(0, snake.invulnerable - dt);
  snake.stun = Math.max(0, snake.stun - dt);
  snake.spitCooldown = Math.max(0, snake.spitCooldown - dt);

  if (snake.isHuman) {
    applyInput(world, snake, room.inputs.get(snake.id));
  } else {
    updateAi(world, snake, dt);
  }

  const head = snake.segments[0];
  const margin = 80;
  if (head.x < WORLD_MIN + margin || head.x > WORLD_MAX - margin || head.y < WORLD_MIN + margin || head.y > WORLD_MAX - margin) {
    snake.targetAngle = angleLerp(snake.targetAngle, angleTo(head.x, head.y, 0, 0), 0.34);
  }

  updateLengthCharges(snake, dt);
  updateMergeEnergy(world, snake, dt);

  const spikeDragSeverity =
    snake.digestMass > 0 || (snake.spikeScale ?? 1) < 0.999 ? Math.max(0.16, snake.spikeDragSeverity || 0) : 0;
  const spikeDrag = spikeDragSeverity > 0;
  const mergeTarget = snake.mergeHold && snake.segments.length > 3 ? 1 : 0;
  const baseMergeRate = mergeTarget > snake.merge ? 1.75 : 2.45;
  const mergeRate = baseMergeRate * (spikeDrag && mergeTarget > snake.merge ? lerp(0.74, 0.36, spikeDragSeverity) : 1);
  snake.merge = lerp(snake.merge, mergeTarget, clamp(dt * mergeRate, 0, 1));
  digestSpikeMass(snake, dt);
  updateSpikeScale(snake, dt);
  snake.angle = angleLerp(snake.angle, snake.targetAngle, clamp(dt * (snake.merge > 0.7 ? 5.2 : 7.4), 0, 1));

  const mass = totalMass(snake);
  const length = snake.segments.length;
  const perBallMass = unitMass(snake);
  const baseSpeed = snake.isHuman ? 210 : 198;
  const massPenalty = clamp(Math.sqrt(mass) * 1.55, 14, 82);
  const ballSizePenalty = clamp(Math.sqrt(perBallMass) * 8.2, 14, 112);
  const lengthDelta = length - desiredNormalSegments(mass);
  const lengthBonus = clamp(lengthDelta * 0.9, -20, 18);
  const thinPenalty = perBallMass < MIN_CHUBBY_UNIT_MASS ? (MIN_CHUBBY_UNIT_MASS - perBallMass) * 3.2 : 0;
  const sizePenalty = massPenalty + ballSizePenalty + thinPenalty - lengthBonus;
  const mergeBonus = snake.merge * 34;
  const boostActive = snake.boostHold && mass > 62 && unitMass(snake) > 5.4 && snake.stun <= 0;
  const boostBonus = boostActive ? 58 : 0;
  const stunPenalty = snake.stun > 0 ? 0.38 : 1;
  const spikeSpeedPenalty = spikeDrag ? lerp(0.96, 0.82, spikeDragSeverity) : 1;
  const speed = clamp(baseSpeed - sizePenalty + mergeBonus + boostBonus, 58, 276) * stunPenalty * spikeSpeedPenalty;

  head.x += Math.cos(snake.angle) * speed * dt;
  head.y += Math.sin(snake.angle) * speed * dt;
  head.x = clamp(head.x, WORLD_MIN + 26, WORLD_MAX - 26);
  head.y = clamp(head.y, WORLD_MIN + 26, WORLD_MAX - 26);

  if (boostActive) {
    shedBoostFood(world, snake, dt);
  } else {
    snake.boostEmitClock = 0;
  }

  const followRate = 12.5 * (spikeDrag ? lerp(0.9, 0.52, spikeDragSeverity) : 1);
  const follow = 1 - Math.exp(-dt * followRate);
  for (let index = 1; index < snake.segments.length; index += 1) {
    const previous = snake.segments[index - 1];
    const segment = snake.segments[index];
    const dx = segment.x - previous.x;
    const dy = segment.y - previous.y;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const gap = desiredGap(snake);
    const tx = previous.x + (dx / distance) * gap;
    const ty = previous.y + (dy / distance) * gap;

    segment.x = lerp(segment.x, tx, follow);
    segment.y = lerp(segment.y, ty, follow);
    segment.wobble += dt * (1.8 + index * 0.02);
  }
}

function updateFoodCollision(world) {
  for (const snake of world.snakes) {
    if (!snake.alive) continue;
    const head = snake.segments[0];
    const radius = segmentRadius(snake, 0);

    for (let index = world.foods.length - 1; index >= 0; index -= 1) {
      const food = world.foods[index];
      const eatDistance = radius + food.radius * 0.65;
      if (distSq(head.x, head.y, food.x, food.y) < eatDistance * eatDistance) {
        world.foods.splice(index, 1);
        growSnake(snake, food.mass);
        addParticles(world, food.x, food.y, food.color, snake.isHuman ? 5 : 2, 0.42);
      }
    }
  }
}

function settleShotAsFood(world, shot) {
  spawnFood(
    world,
    clamp(shot.x, WORLD_MIN + 24, WORLD_MAX - 24),
    clamp(shot.y, WORLD_MIN + 24, WORLD_MAX - 24),
    Math.max(1.2, shot.mass),
    shot.color,
    false,
  );
}

function findShotAbsorber(world, shot) {
  for (const snake of world.snakes) {
    if (!snake.alive || snake.id === shot.ownerId) continue;
    for (let index = 0; index < snake.segments.length; index += 1) {
      const segment = snake.segments[index];
      const radius = index === 0 ? segmentRadius(snake, 0) : collisionRadius(snake, index);
      if (radius < 2.4) continue;
      const hitDistance = shot.radius + radius * 0.82;
      if (distSq(shot.x, shot.y, segment.x, segment.y) < hitDistance * hitDistance) {
        return snake;
      }
    }
  }
  return null;
}

function updateShots(world, dt) {
  for (let shotIndex = world.shots.length - 1; shotIndex >= 0; shotIndex -= 1) {
    const shot = world.shots[shotIndex];
    shot.age += dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.spin += dt * 14;

    let removeShot = false;
    if (shot.age >= shot.life || shot.x < WORLD_MIN || shot.x > WORLD_MAX || shot.y < WORLD_MIN || shot.y > WORLD_MAX) {
      settleShotAsFood(world, shot);
      removeShot = true;
    } else {
      const absorber = findShotAbsorber(world, shot);
      if (absorber) {
        growSnake(absorber, shot.mass * 0.96);
        const palette = paletteForSkin(absorber.skinIndex);
        addParticles(world, shot.x, shot.y, palette.main, absorber.isHuman ? 5 : 3, 0.42);
        addText(world, shot.x, shot.y - 18, "YUMMY", palette.light);
        removeShot = true;
      } else {
        for (const spike of world.spikes) {
          const hitDistance = spike.radius + shot.radius;
          if (distSq(shot.x, shot.y, spike.x, spike.y) > hitDistance * hitDistance) continue;
          const speed = Math.max(1, Math.hypot(shot.vx, shot.vy));
          const nx = shot.vx / speed;
          const ny = shot.vy / speed;
          const push = 360 + shot.mass * 26;
          spike.vx += nx * push;
          spike.vy += ny * push;
          spike.x += nx * (shot.radius + 3);
          spike.y += ny * (shot.radius + 3);
          addParticles(world, shot.x, shot.y, "#75f0a4", 16, 0.92);
          removeShot = true;
          break;
        }
      }
    }

    if (removeShot) {
      world.shots.splice(shotIndex, 1);
    }
  }
}

function updateSpikeCollision(world, dt) {
  for (let spikeIndex = world.spikes.length - 1; spikeIndex >= 0; spikeIndex -= 1) {
    const spike = world.spikes[spikeIndex];
    spike.x += spike.vx * dt;
    spike.y += spike.vy * dt;
    const damping = Math.pow(0.18, dt);
    spike.vx *= damping;
    spike.vy *= damping;

    if (spike.x < WORLD_MIN + spike.radius || spike.x > WORLD_MAX - spike.radius) {
      spike.x = clamp(spike.x, WORLD_MIN + spike.radius, WORLD_MAX - spike.radius);
      spike.vx *= -0.42;
    }
    if (spike.y < WORLD_MIN + spike.radius || spike.y > WORLD_MAX - spike.radius) {
      spike.y = clamp(spike.y, WORLD_MIN + spike.radius, WORLD_MAX - spike.radius);
      spike.vy *= -0.42;
    }

    for (const snake of world.snakes) {
      if (!snake.alive) continue;
      for (let segmentIndex = 0; segmentIndex < snake.segments.length; segmentIndex += 1) {
        const segment = snake.segments[segmentIndex];
        const radius = segmentIndex === 0 ? segmentRadius(snake, 0) : collisionRadius(snake, segmentIndex);
        if (radius < 2.4) continue;
        const trigger = radius + spike.radius * 0.72;
        if (distSq(segment.x, segment.y, spike.x, spike.y) >= trigger * trigger) continue;

        world.spikes.splice(spikeIndex, 1);
        splitSnakeBySpike(world, snake, spike);
        spawnSpike(world);
        break;
      }
      if (!world.spikes.includes(spike)) break;
    }
  }
}

function resolveHeadPair(world, a, b) {
  if (!a.alive || !b.alive || a.invulnerable > 0 || b.invulnerable > 0) return;

  const ah = a.segments[0];
  const bh = b.segments[0];
  const ar = segmentRadius(a, 0);
  const br = segmentRadius(b, 0);
  const overlap = (ar + br) * 0.62;
  if (distSq(ah.x, ah.y, bh.x, bh.y) > overlap * overlap) return;

  const am = headMass(a);
  const bm = headMass(b);
  if (am > bm * 1.18) {
    killSnake(world, b, a);
    return;
  }
  if (bm > am * 1.18) {
    killSnake(world, a, b);
    return;
  }

  const pushAngle = angleTo(bh.x, bh.y, ah.x, ah.y);
  ah.x += Math.cos(pushAngle) * 18;
  ah.y += Math.sin(pushAngle) * 18;
  bh.x -= Math.cos(pushAngle) * 18;
  bh.y -= Math.sin(pushAngle) * 18;
  a.stun = Math.max(a.stun, 0.16);
  b.stun = Math.max(b.stun, 0.16);
}

function resolveHeadToBody(world, attacker, defender) {
  if (!attacker.alive || !defender.alive || attacker === defender) return false;
  if (attacker.invulnerable > 0 || defender.invulnerable > 0) return false;

  const head = attacker.segments[0];
  const headRadiusValue = segmentRadius(attacker, 0);
  const attackerMass = headMass(attacker);

  for (let index = 1; index < defender.segments.length; index += 1) {
    const segment = defender.segments[index];
    const bodyRadius = collisionRadius(defender, index);
    if (bodyRadius < 2.4) continue;
    const contact = headRadiusValue * 0.72 + bodyRadius * 0.84;
    if (distSq(head.x, head.y, segment.x, segment.y) > contact * contact) continue;

    if (attackerMass > segment.mass * 1.12) {
      severSnake(world, defender, index, attacker);
    } else {
      killSnake(world, attacker, defender);
    }
    return true;
  }

  return false;
}

function resolveSnakeCollisions(world) {
  const snakes = world.snakes;
  for (let a = 0; a < snakes.length; a += 1) {
    for (let b = a + 1; b < snakes.length; b += 1) {
      resolveHeadPair(world, snakes[a], snakes[b]);
    }
  }

  for (const attacker of snakes) {
    if (!attacker.alive) continue;
    for (const defender of snakes) {
      if (!attacker.alive) break;
      if (!defender.alive || attacker === defender) continue;
      if (resolveHeadToBody(world, attacker, defender)) break;
    }
  }
}

function respawnSnakeBody(world, snake) {
  const x = worldRand();
  const y = worldRand();
  const angle = Math.random() * TAU;
  const startMass = randomRange(snake.isHuman ? 15.5 : 13.5, snake.isHuman ? 17.5 : 18.5);

  snake.segments = [];
  for (let index = 0; index < MIN_SEGMENTS; index += 1) {
    snake.segments.push(makeSegment(x - Math.cos(angle) * index * 18, y - Math.sin(angle) * index * 18, startMass));
  }

  snake.angle = angle;
  snake.targetAngle = angle;
  snake.merge = 0;
  snake.mergeHold = false;
  snake.mergeEnergy = 1;
  snake.mergeExhausted = false;
  snake.mergeEmptyNotified = false;
  snake.mergeIntent = false;
  snake.mergeDrainTimer = 0;
  snake.lengthenCharge = 1;
  snake.shortenCharge = 1;
  snake.manualLengthOffset = 0;
  snake.boostHold = false;
  snake.boostEmitClock = 0;
  snake.spitCooldown = 0;
  snake.spikeScale = 1;
  snake.spikeDragSeverity = 0;
  snake.digestMass = 0;
  snake.stun = 0;
  snake.invulnerable = 1.2;
  snake.alive = true;
  snake.respawnTimer = 0;
  addText(world, x, y - 24, "READY", paletteForSkin(snake.skinIndex).light);
}

function maintainWorld(world, dt) {
  while (world.foods.filter((food) => food.ambient).length < FOOD_TARGET) spawnFood(world);
  trimDroppedFood(world);
  while (world.spikes.length < SPIKE_TARGET) spawnSpike(world);

  for (const snake of world.snakes) {
    if (snake.alive) continue;
    snake.respawnTimer = Math.max(0, (snake.respawnTimer || 2.6) - dt);
    if (snake.respawnTimer <= 0) respawnSnakeBody(world, snake);
  }
}

function updateParticles(world, dt) {
  for (let index = world.particles.length - 1; index >= 0; index -= 1) {
    const particle = world.particles[index];
    particle.age += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 1 - dt * 2.4;
    particle.vy *= 1 - dt * 2.4;
    if (particle.age >= particle.life) {
      world.particles.splice(index, 1);
    }
  }

  for (let index = world.texts.length - 1; index >= 0; index -= 1) {
    const text = world.texts[index];
    text.age += dt;
    text.y += text.vy * dt;
    if (text.age >= text.life) {
      world.texts.splice(index, 1);
    }
  }
}

function publicWorldState(room) {
  const world = room.world;
  return {
    elapsed: world.elapsed,
    snakes: world.snakes.map((snake) => ({
      id: snake.id,
      name: snake.name,
      skinIndex: snake.skinIndex,
      isHuman: snake.isHuman,
      alive: snake.alive,
      angle: snake.angle,
      targetAngle: snake.targetAngle,
      merge: snake.merge,
      mergeHold: snake.mergeHold,
      mergeEnergy: snake.mergeEnergy,
      mergeExhausted: snake.mergeExhausted,
      mergeEmptyNotified: snake.mergeEmptyNotified,
      mergeIntent: snake.mergeIntent,
      mergeDrainTimer: snake.mergeDrainTimer,
      lengthenCharge: snake.lengthenCharge,
      shortenCharge: snake.shortenCharge,
      manualLengthOffset: snake.manualLengthOffset,
      boostHold: snake.boostHold,
      boostEmitClock: snake.boostEmitClock,
      spitCooldown: snake.spitCooldown,
      spikeScale: snake.spikeScale,
      spikeDragSeverity: snake.spikeDragSeverity,
      digestMass: snake.digestMass,
      stun: snake.stun,
      invulnerable: snake.invulnerable,
      kills: snake.kills,
      respawnTimer: snake.respawnTimer,
      segments: snake.segments.map((segment) => ({
        x: segment.x,
        y: segment.y,
        mass: segment.mass,
        wobble: segment.wobble,
      })),
    })),
    foods: world.foods,
    shots: world.shots,
    spikes: world.spikes,
    particles: world.particles.slice(-180),
    texts: world.texts.slice(-36),
  };
}

function updateWorld(room, dt) {
  if (room.players.size === 0) return;
  const world = room.world;
  dt = Math.min(MAX_DT, dt);
  world.elapsed += dt;

  for (const snake of world.snakes) updateSnake(world, room, snake, dt);
  updateFoodCollision(world);
  updateShots(world, dt);
  updateSpikeCollision(world, dt);
  resolveSnakeCollisions(world);
  maintainWorld(world, dt);
  updateParticles(world, dt);

  world.snapshotClock += dt;
  if (world.snapshotClock >= 1 / SNAPSHOT_RATE) {
    world.snapshotClock = 0;
    broadcast(room, "world_state", { state: publicWorldState(room) });
  }
}

function createRoom({ quick = false } = {}) {
  const code = makeRoomCode(quick ? QUICK_ROOM_PREFIX : "");
  const room = {
    code,
    quick,
    size: ROOM_SIZE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: new Map(),
    bots: [],
    inputs: new Map(),
    world: makeWorld(),
  };
  rooms.set(code, room);
  ensureBots(room);
  initializeWorld(room.world);
  syncWorldRoster(room);
  return room;
}

function ensureBots(room) {
  const needed = Math.max(0, room.size - room.players.size);
  while (room.bots.length < needed) {
    const index = room.bots.length;
    room.bots.push({
      id: `bot_${room.code}_${index}`,
      name: botNames[index % botNames.length],
      skinIndex: (index + 2) % palettes.length,
      isHuman: false,
    });
  }
  while (room.bots.length > needed) {
    room.bots.pop();
  }
  room.updatedAt = Date.now();
}

function roomParticipants(room) {
  return [
    ...[...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      skinIndex: player.skinIndex,
      isHuman: true,
    })),
    ...room.bots,
  ].slice(0, ROOM_SIZE);
}

function syncWorldRoster(room) {
  const participants = roomParticipants(room);
  const participantIds = new Set(participants.map((participant) => participant.id));
  room.world.snakes = room.world.snakes.filter((snake) => participantIds.has(snake.id));

  participants.forEach((participant, index) => {
    let snake = room.world.snakes.find((candidate) => candidate.id === participant.id);
    if (!snake) {
      const angle = (index / Math.max(1, participants.length)) * TAU + randomRange(-0.18, 0.18);
      const x = Math.cos(angle) * 470 + randomRange(-90, 90);
      const y = Math.sin(angle) * 470 + randomRange(-90, 90);
      snake = createSnake(participant, x, y);
      room.world.snakes.push(snake);
    }

    snake.name = participant.name;
    snake.skinIndex = participant.skinIndex;
    snake.isHuman = Boolean(participant.isHuman);
  });
}

function publicRoom(room) {
  return {
    code: room.code,
    size: room.size,
    hostId: null,
    playerCount: room.players.size,
    botCount: room.bots.length,
    quick: room.quick,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      skinIndex: player.skinIndex,
    })),
    bots: room.bots,
  };
}

function findQuickRoom() {
  for (const room of rooms.values()) {
    if (room.quick && room.players.size < room.size) return room;
  }
  return createRoom({ quick: true });
}

function leaveRoom(client) {
  const session = clients.get(client);
  if (!session?.roomCode) return;

  const room = rooms.get(session.roomCode);
  if (room) {
    room.players.delete(session.id);
    room.inputs.delete(session.id);
    ensureBots(room);
    syncWorldRoster(room);
    broadcast(room, "room_state", { room: publicRoom(room) });
    if (room.players.size === 0 && Date.now() - room.createdAt > 1000) {
      rooms.delete(room.code);
    }
  }

  session.roomCode = null;
}

function enterRoom(client, room, profile) {
  const session = clients.get(client);
  leaveRoom(client);

  session.name = normalizeName(profile?.name);
  session.skinIndex = normalizeSkinIndex(profile?.skinIndex);
  session.roomCode = room.code;

  room.players.set(session.id, {
    id: session.id,
    socket: client,
    name: session.name,
    skinIndex: session.skinIndex,
  });
  room.inputs.set(session.id, sanitizeInput());
  ensureBots(room);
  syncWorldRoster(room);

  send(client, "joined_room", { selfId: session.id, room: publicRoom(room), state: publicWorldState(room) });
  broadcast(room, "room_state", { room: publicRoom(room) });
  broadcast(room, "world_state", { state: publicWorldState(room) });
}

function handleMessage(client, data) {
  let message;
  try {
    message = JSON.parse(String(data));
  } catch {
    send(client, "error_message", { message: "Bad JSON" });
    return;
  }

  if (message.type === "hello") {
    const session = clients.get(client);
    session.name = normalizeName(message.name);
    session.skinIndex = normalizeSkinIndex(message.skinIndex);
    send(client, "hello", {
      selfId: session.id,
      roomSize: ROOM_SIZE,
      serverTime: Date.now(),
    });
    return;
  }

  if (message.type === "create_room") {
    const room = createRoom();
    enterRoom(client, room, message.profile);
    return;
  }

  if (message.type === "join_room") {
    const code = String(message.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      send(client, "error_message", { message: "Room not found" });
      return;
    }
    if (room.players.size >= room.size) {
      send(client, "error_message", { message: "Room is full" });
      return;
    }
    enterRoom(client, room, message.profile);
    return;
  }

  if (message.type === "quick_match") {
    enterRoom(client, findQuickRoom(), message.profile);
    return;
  }

  if (message.type === "leave_room") {
    leaveRoom(client);
    send(client, "left_room");
    return;
  }

  if (message.type === "input") {
    const session = clients.get(client);
    const room = rooms.get(session?.roomCode);
    if (!room || !room.players.has(session.id)) return;
    room.inputs.set(session.id, sanitizeInput(message.input));
    return;
  }

  if (message.type === "command") {
    const session = clients.get(client);
    const room = rooms.get(session?.roomCode);
    if (!room || !room.players.has(session.id)) return;
    const snake = room.world.snakes.find((candidate) => candidate.id === session.id);
    if (message.command === "length") {
      adjustSnakeLength(room.world, snake, Number(message.delta) > 0 ? 1 : -1);
    }
    return;
  }

  if (message.type === "ping") {
    send(client, "pong", { serverTime: Date.now() });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(safeJson({ ok: true, rooms: rooms.size, clients: clients.size }));
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  if (pathname.startsWith("/server/")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.resolve(CLIENT_DIR, `.${pathname}`);
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    const noCache = [".html", ".js", ".css"].includes(ext);
    res.writeHead(200, {
      "content-type": contentTypes.get(ext) || "application/octet-stream",
      "cache-control": noCache ? "no-cache" : "public, max-age=60",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  serveStatic(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500);
    res.end("Server error");
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (client) => {
  const id = makeClientId();
  clients.set(client, {
    id,
    name: "Guest",
    skinIndex: 0,
    roomCode: null,
  });
  send(client, "hello", { selfId: id, roomSize: ROOM_SIZE, serverTime: Date.now() });

  client.on("message", (data) => handleMessage(client, data));
  client.on("close", () => {
    leaveRoom(client);
    clients.delete(client);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    updateWorld(room, TICK_DT);
  }
}, 1000 / TICK_RATE).unref();

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.players.size === 0 && now - room.updatedAt > 10 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`SnakeBall server listening on http://localhost:${PORT}`);
});
