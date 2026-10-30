// Frog Pond Defense - a simple tower defense game.
// Frogs and tadpoles are the towers, bugs are the enemies. Survive 10 rounds!

// Bump this (and data-version + ?v= in index.html) every time the game is updated.
// If index.html and game.js come from different updates, the game shows a warning.
const GAME_VERSION = 22;
if (document.body && document.body.dataset) {
  const page = Number(document.body.dataset.version || 0);
  const ver = document.getElementById("ver");
  if (ver) ver.textContent = "v" + GAME_VERSION;
  if (page !== GAME_VERSION) {
    const warn = document.getElementById("versionWarning");
    if (warn) {
      warn.style.display = "block";
      warn.textContent = `⚠️ Your game files don't match (page v${page || "?"}, game v${GAME_VERSION}). ` +
        "Upload BOTH index.html and game.js again, then press Ctrl+F5.";
    }
  }
}

const canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");
const TILE = 40;
const COLS = canvas.width / TILE;  // 20
const ROWS = canvas.height / TILE; // 12

// ---------- Maps ----------
// path: the corners bugs walk through (grid coordinates). The last one is where they're headed.
// goal: "pond" = bugs jump into the pond, "home" = bugs attack the frogs' home base.
// flyStraight: flying bosses ignore the path and fly in a straight line to the goal.
const MAPS = [
  {
    name: "Lily Pond", difficulty: "Normal",
    desc: "The path loops all the way around the pond before the bugs reach the water.",
    pond: { x: 400, y: 240, rx: 150, ry: 90 },
    path: [[0, 2], [16, 2], [16, 10], [3, 10], [3, 6], [6, 6]],
    goal: "pond", reedGap: Math.PI, seed: 7,
    lilyPads: [
      { x: 360, y: 210, r: 16 }, { x: 450, y: 270, r: 20 }, { x: 480, y: 200, r: 13 },
      { x: 320, y: 280, r: 12 }, { x: 410, y: 300, r: 10 },
    ],
  },
  {
    name: "Cattail Marsh", difficulty: "Medium",
    desc: "Bugs zig-zag down from the top right into a smaller pond. A shorter path than Lily Pond, and flying bosses cut the corners.",
    pond: { x: 225, y: 250, rx: 160, ry: 115 },
    path: [[19, 1], [10, 1], [10, 6], [17, 6], [17, 10], [4, 10], [4, 8]],
    goal: "pond", reedGap: 1.94, seed: 13,
    lilyPads: [
      { x: 180, y: 220, r: 15 }, { x: 260, y: 290, r: 18 }, { x: 300, y: 210, r: 12 }, { x: 140, y: 280, r: 11 },
    ],
  },
  {
    name: "Frog Home", difficulty: "Hard",
    desc: "Bugs march around a big pond to reach the frogs' home. Yellow Jackets fly straight across the water!",
    pond: { x: 360, y: 250, rx: 200, ry: 135 },
    path: [[0, 10], [1, 10], [1, 1], [18, 1], [18, 11], [16, 11], [16, 6]],
    goal: "home", flyStraight: true, reedGap: null, seed: 21,
    lilyPads: [
      { x: 290, y: 200, r: 18 }, { x: 420, y: 300, r: 22 }, { x: 470, y: 190, r: 14 },
      { x: 250, y: 310, r: 13 }, { x: 360, y: 250, r: 11 }, { x: 510, y: 270, r: 12 },
    ],
  },
];

// The current map's layout (filled in by loadMap)
let currentMap, POND, PATH_TILES, waypoints, entrance, pathSet, decorations, reeds, lilyPads, mapPadTiles;

function inPond(x, y) {
  const dx = (x - POND.x) / POND.rx, dy = (y - POND.y) / POND.ry;
  return dx * dx + dy * dy <= 1;
}

function loadMap(map) {
  currentMap = map;
  POND = map.pond;
  PATH_TILES = map.path;
  waypoints = PATH_TILES.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));
  // Bugs appear one tile outside the map edge, lined up with the first stretch of path
  const dx = waypoints[0].x - waypoints[1].x, dy = waypoints[0].y - waypoints[1].y;
  const len = Math.hypot(dx, dy) || 1;
  entrance = { x: waypoints[0].x + (dx / len) * TILE, y: waypoints[0].y + (dy / len) * TILE };

  // Mark every tile on the path so towers can't be placed there.
  pathSet = new Set();
  for (let i = 0; i < PATH_TILES.length - 1; i++) {
    let [c1, r1] = PATH_TILES[i];
    const [c2, r2] = PATH_TILES[i + 1];
    pathSet.add(c1 + "," + r1);
    while (c1 !== c2 || r1 !== r2) {
      c1 += Math.sign(c2 - c1);
      r1 += Math.sign(r2 - r1);
      pathSet.add(c1 + "," + r1);
    }
  }

  // Random grass, flowers, rocks and reeds (same every time thanks to a fixed seed).
  let seed = map.seed;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  decorations = [];
  for (let i = 0; i < 160; i++) {
    const x = rand() * canvas.width, y = rand() * canvas.height;
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (pathSet.has(c + "," + r) || inPond(x, y)) continue;
    if (map.goal === "home" && Math.hypot(x - waypoints.at(-1).x, y - waypoints.at(-1).y) < 45) continue;
    const roll = rand();
    decorations.push({ x, y, kind: roll < 0.7 ? "grass" : roll < 0.88 ? "flower" : "rock", hue: rand() });
  }
  reeds = [];
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    if (map.reedGap !== null && Math.abs(a - map.reedGap) < 0.4) continue; // gap where the path enters the pond
    reeds.push({ x: POND.x + Math.cos(a) * (POND.rx + 4), y: POND.y + Math.sin(a) * (POND.ry + 4), lean: rand() - 0.5 });
  }
  lilyPads = map.lilyPads;

  // The lily pads already drawn in the pond work like placed ones: land frogs can sit on them
  mapPadTiles = new Set();
  for (const p of lilyPads) {
    const c = Math.floor(p.x / TILE), r = Math.floor(p.y / TILE);
    mapPadTiles.add(c + "," + r);
  }
}
loadMap(MAPS[0]);

// ---------- Bugs: 15 tiers (10 normal bugs + 5 bosses) ----------
// The number is just an ID. "look" picks how the bug is drawn.
// flies: flying bugs cut corners (cornerCut = how early they turn, in pixels),
// and on maps with flyStraight they fly straight at the goal.
const BUG_TYPES = {
  // Normal bugs, weakest to strongest
  6:  { name: "Cricket",        hp: 15,   speed: 1.3, reward: 3,   lifeCost: 1,  color: "#7a6a2c", size: 7,  look: "cricket" },
  1:  { name: "Gnat",           hp: 30,   speed: 1.4, reward: 5,   lifeCost: 1,  color: "#333333", size: 8,  look: "gnat" },
  7:  { name: "Mosquito",       hp: 50,   speed: 1.8, reward: 7,   lifeCost: 1,  color: "#5d4a3a", size: 8,  look: "mosquito" },
  2:  { name: "Beetle",         hp: 110,  speed: 0.8, reward: 12,  lifeCost: 2,  color: "#8b4513", size: 12, look: "beetle" },
  8:  { name: "Ladybug",        hp: 140,  speed: 1.1, reward: 14,  lifeCost: 2,  color: "#d62828", size: 11, look: "ladybug" },
  9:  { name: "Fire Ant",       hp: 180,  speed: 1.3, reward: 18,  lifeCost: 3,  color: "#b5300f", size: 10, look: "ant" },
  3:  { name: "Hornet",         hp: 220,  speed: 1.6, reward: 25,  lifeCost: 4,  color: "#f2c200", size: 13, look: "hornet" },
  10: { name: "Praying Mantis", hp: 350,  speed: 1.0, reward: 35,  lifeCost: 5,  color: "#5cb85c", size: 14, look: "mantis" },
  11: { name: "Wasp",           hp: 450,  speed: 1.7, reward: 45,  lifeCost: 6,  color: "#e8a317", size: 13, look: "wasp" },
  12: { name: "Rhino Beetle",   hp: 700,  speed: 0.7, reward: 60,  lifeCost: 8,  color: "#3b2a1e", size: 15, look: "rhino" },
  // Bosses, weakest to strongest
  4:  { name: "Stag Beetle",    hp: 1500, speed: 0.4, reward: 150, lifeCost: 10, color: "#4a2c17", size: 20, boss: true },
  13: { name: "Giant Centipede", hp: 2000, speed: 0.7, reward: 180, lifeCost: 11, color: "#8a2b1a", size: 18, boss: true },
  14: { name: "Atlas Moth",     hp: 2200, speed: 1.0, reward: 200, lifeCost: 11, color: "#b5651d", size: 22, boss: true, flies: true, cornerCut: 110 },
  5:  { name: "Yellow Jacket",  hp: 2500, speed: 1.8, reward: 250, lifeCost: 12, color: "#ffcc00", size: 16, boss: true, flies: true, cornerCut: 130 },
  15: { name: "Asian Giant Hornet", hp: 4500, speed: 1.3, reward: 400, lifeCost: 15, color: "#e8731c", size: 22, boss: true, flies: true, cornerCut: 130 },
  // ULTRA BOSS (round 50): two stages. At half health it digs a tunnel, and from then on
  // every bug comes out of the tunnel, easy bugs keep pouring out, and it takes less damage.
  // It's too big to be stunned by Spring Peepers.
  16: { name: "Giant Mole Cricket", hp: 5000, speed: 0.35, reward: 1000, lifeCost: 50, color: "#6b4a2f", size: 26, boss: true, ultra: true, stunImmune: true },
};

// Ultra boss stage 2 settings
const ULTRA = {
  armor: 0.25,            // takes 25% less damage in stage 2
  flowEvery: 50,          // frames between easy bugs coming out of the tunnel
  flowBugs: [6, 1, 7],    // Cricket, Gnat, Mosquito
};
let tunnel = null;        // { x, y, wp, flowTimer } once the ultra boss digs it

// Normal bugs from weakest to strongest, with the round each one first shows up (after round 10)
const NORMALS = [
  { id: 6, from: 1, weight: 0.5 }, { id: 1, from: 1, weight: 1 }, { id: 7, from: 1, weight: 1 },
  { id: 2, from: 1, weight: 1 }, { id: 8, from: 1, weight: 1 }, { id: 9, from: 1, weight: 1 },
  { id: 3, from: 1, weight: 1.2 }, { id: 10, from: 1, weight: 1 }, { id: 11, from: 18, weight: 1 },
  { id: 12, from: 26, weight: 1 },
];

// What spawns each round: [bug ID, count] groups.
const ROUNDS = [
  [[6, 8], [1, 6]],
  [[1, 12], [7, 3]],
  [[1, 10], [2, 3], [7, 3]],
  [[2, 6], [8, 2]],
  [[1, 20], [2, 6], [4, 1]],           // first boss: Stag Beetle
  [[2, 8], [9, 2], [3, 2]],
  [[1, 20], [7, 6], [3, 4]],
  [[2, 15], [3, 6], [4, 1]],
  [[3, 10], [10, 1]],
  [[1, 30], [2, 15], [3, 15], [4, 2]], // two bosses
];

// Rounds 11-50 are made by a formula. Each round has a "strength budget" that grows
// every round, shared out between all the normal bugs unlocked so far.
// Stag Beetles come every 5 rounds, and the other bosses have their own rounds below.
function normalBugsFor(r) {
  const budget = (10 + r) * 30 + Math.floor(r * 0.7) * 110 + Math.floor(r * 0.5) * 220;
  const unlocked = NORMALS.filter((n) => r >= n.from);
  const totalWeight = unlocked.reduce((s, n) => s + n.weight, 0);
  return unlocked
    .map((n) => [n.id, Math.round((budget * n.weight) / totalWeight / BUG_TYPES[n.id].hp)])
    .filter(([, count]) => count > 0);
}
for (let r = 11; r <= 50; r++) {
  const groups = normalBugsFor(r);
  if (r % 5 === 0 && r < 50) groups.push([4, Math.floor(r / 10)]);
  ROUNDS.push(groups);
}

// FREEPLAY: rounds after 50 never run out. They're made up on the spot,
// keep getting bigger and tougher, and bring bosses along:
//   every 5 rounds: Stag Beetles, every 7: Yellow Jackets, every 10: a Centipede + Atlas Moth,
//   every 15: Asian Giant Hornets, every 25: the ULTRA BOSS.
function getRound(r) {
  if (r <= ROUNDS.length) return ROUNDS[r - 1];
  const groups = normalBugsFor(r);
  const n = Math.floor(r / 25); // more bosses the further you get
  if (r % 5 === 0) groups.push([4, 2 + n]);
  if (r % 7 === 0) groups.push([5, 1 + n]);
  if (r % 10 === 0) groups.push([13, n], [14, n]);
  if (r % 15 === 0) groups.push([15, n]);
  if (r % 25 === 0) groups.push([16, 1]);
  return groups.filter(([, count]) => count > 0);
}

// Special boss rounds
const BOSS_ROUNDS = {
  15: [[5, 1]],              // Yellow Jacket (with a swarm of hornets, below)
  20: [[13, 1]],             // Giant Centipede
  22: [[5, 1]],              // Yellow Jacket is back
  25: [[14, 1]],             // Atlas Moth (Easy's final round)
  28: [[5, 1]],
  30: [[13, 2]],
  35: [[5, 1], [14, 1]],
  40: [[15, 1]],             // Asian Giant Hornet (Medium's final round)
  42: [[5, 2]],
  45: [[5, 2]],
  50: [[16, 1]],             // Hard's final round: the ULTRA BOSS, the Giant Mole Cricket!
};
for (const [r, bosses] of Object.entries(BOSS_ROUNDS)) ROUNDS[r - 1].push(...bosses);
ROUNDS[14] = [[3, 20], [5, 1]]; // round 15 stays the Yellow Jacket + hornets round

// Boss names for messages, e.g. "A Yellow Jacket" or "2 Stag Beetles"
function bossList(groups) {
  return groups
    .filter(([t]) => BUG_TYPES[t].boss)
    .map(([t, n]) => (n > 1 ? `${n} ${BUG_TYPES[t].name}s` : `a ${BUG_TYPES[t].name}`))
    .join(" and ");
}

// Flies you get for squashing a bug. Later rounds have lots of bugs, so each one pays a bit less.
// Every round after the first, each bug pays a bit less
// (round 10: about 3/4 of the normal flies, round 25: about half, round 50: about a third).
function rewardFor(tier) {
  return Math.max(1, Math.round(BUG_TYPES[tier].reward / (1 + (round - 1) * REWARD_DROP)));
}
const REWARD_DROP = 0.04;
const LATE_HP = 0.005;

// How much tougher bugs are in a given round
function hpScale(r) {
  const late = Math.max(0, r - 10);
  return 1 + (r - 1) * 0.08 + late * late * LATE_HP; // grows faster after round 10
}

// ---------- Towers (sold in the shop) ----------
const TOWERS = {
  frog: {
    name: "Frog", cost: 50, damage: 12, range: 100, cooldown: 40,
    colors: ["#3fa34d", "#2e7d32", "#1b5e20"],
    upgradeCosts: [25, 50, 100, 250], // price of tier 1, 2, 3, 4
  },
  // Tadpoles live in the pond: long range, fast water shots, lower damage per shot.
  tadpole: {
    name: "Tadpole", cost: 80, damage: 7, range: 170, cooldown: 14,
    colors: ["#55552e", "#3a3a1e", "#22220e"],
    upgradeCosts: [35, 70, 120, 300],
  },
  // Sniper: shoots slow poison darts that hit really hard from very far away.
  // It aims at the toughest bug in range, so it's great against bosses.
  // Each hit also poisons the bug (see POISON below).
  dartfrog: {
    name: "Poison Dart Frog", cost: 120, damage: 55, range: 260, cooldown: 110,
    colors: ["#1e88e5", "#1565c0", "#0d47a1"],
    upgradeCosts: [50, 100, 175, 400],
  },
};
// Bullfrog: a big bruiser. Huge slap, same slow speed as the dart frog, but tiny range,
// so it has to sit right next to the path (corners are best).
TOWERS.bullfrog = {
  name: "Bullfrog", cost: 70, damage: 75, range: 40, cooldown: 110,
  colors: ["#7a8b3a", "#5f6e2b", "#46511f"],
  upgradeCosts: [40, 80, 150, 300],
  splash: { radius: 45, share: 0.5 }, // bugs within 45px of the slap take 50% damage
};
// Spring Peeper: a tiny frog whose croak makes a shockwave around it.
// It only does 1 damage, but it stuns every bug it hits for 0.25 seconds.
// Base cooldown 180 frames (one croak every 3 seconds).
// At tier 4 Attack Speed (x0.35) that's 63 frames = about 0.95 attacks/sec.
TOWERS.peeper = {
  name: "Spring Peeper", cost: 60, damage: 9, range: 85, cooldown: 180,
  colors: ["#c9a46a", "#b08850", "#94703a"],
  upgradeCosts: [30, 60, 110, 260],
};
const STUN_FRAMES = 15; // 0.25 seconds

// ----- Special frogs -----
// Wallace's Flying Frog: its tongue chains from bug to bug (glides between them).
TOWERS.flyingfrog = {
  name: "Flying Frog", cost: 90, damage: 11, range: 130, cooldown: 50,
  colors: ["#2fa84f", "#228a3e", "#176b2e"],
  upgradeCosts: [40, 80, 150, 300],
  chain: 3,         // how many bugs one tongue hits
  chainReach: 85,   // how far the tongue can jump to the next bug
};
// Wood Frog: wood frogs freeze solid in winter! Its frosty croak slows every bug around it.
TOWERS.woodfrog = {
  name: "Wood Frog", cost: 80, damage: 7, range: 90, cooldown: 90,
  colors: ["#a0784a", "#8a6238", "#6e4c28"],
  upgradeCosts: [35, 70, 130, 280],
  slow: 0.5,        // bugs move 50% slower...
  slowFrames: 120,  // ...for 2 seconds
};
// Pacman Frog: swallows a regular bug whole (instant kill). Bosses are too big, so they just take a big bite.
TOWERS.pacman = {
  name: "Pacman Frog", cost: 150, damage: 300, range: 60, cooldown: 240,
  colors: ["#9bc53d", "#7fa82e", "#668a22"],
  upgradeCosts: [70, 140, 250, 450],
};
// Glass Frog: you can see right through it! Support: towers in its range attack faster. It doesn't attack.
TOWERS.glassfrog = {
  name: "Glass Frog", cost: 110, damage: 0, range: 100, cooldown: 0,
  colors: ["rgba(170,230,140,0.75)", "rgba(150,215,120,0.8)", "rgba(130,200,100,0.85)"],
  upgradeCosts: [50, 100, 180, 350],
  support: true, noAbility: true,
};
// Tomato Frog: a money maker. It makes flies every few seconds during rounds. It doesn't attack.
// Its "damage" is how many flies it makes, and its "speed" is how often.
TOWERS.tomatofrog = {
  name: "Tomato Frog", cost: 100, damage: 6, range: 0, cooldown: 300,
  colors: ["#e8552a", "#d1441c", "#b33612"],
  upgradeCosts: [40, 80, 150, 300],
  support: true, noAbility: true,
};
// Lily Pad: goes in the pond. Land frogs can then be placed on top of it.
// isTower: false means it is NOT a tower: it never goes in the towers list, never blocks a tile,
// and land frogs can be placed right on top of it.
TOWERS.lilypad = { name: "Lily Pad", cost: 40, damage: 0, range: 0, cooldown: 0, isPad: true, isTower: false };

let pads = new Set(); // tiles ("c,r") that have a lily pad

const SHOP_BUTTONS = {
  frog: "shopFrog", tadpole: "shopTadpole", dartfrog: "shopDart", bullfrog: "shopBull", peeper: "shopPeeper",
  lilypad: "shopPad", flyingfrog: "shopFlying", woodfrog: "shopWood", pacman: "shopPacman",
  glassfrog: "shopGlass", tomatofrog: "shopTomato",
};
// Number keys pick from the shop: 1-9 then 0, and - for the last one
const SHOP_KEYS = { 1: "frog", 2: "tadpole", 3: "dartfrog", 4: "bullfrog", 5: "peeper", 6: "lilypad",
  7: "flyingfrog", 8: "woodfrog", 9: "pacman", 0: "glassfrog", "-": "tomatofrog" };

// Poison from dart hits: extra damage spread over a few seconds.
// Total poison damage = 40% of the dart's hit. Getting hit again restarts the timer.
const POISON = { share: 0.4, frames: 180 }; // 180 frames = 3 seconds

// The 3 upgrade paths. "mult" is the multiplier at tier 0, 1, 2, 3, 4.
const PATHS = [
  {
    name: "Attack Speed", icon: "⚡", color: "#ffb84d", mult: [1, 0.75, 0.6, 0.45, 0.35],
    tiers: ["Faster attacks", "Even faster", "Lightning fast", "FRENZY"],
    ability: "Frenzy", abilityInfo: "4x attack speed for 5 seconds",
  },
  {
    name: "Damage", icon: "💥", color: "#ff6b6b", mult: [1, 1.6, 2.3, 3.2, 4.5],
    tiers: ["Stronger hits", "Heavy hits", "Crushing hits", "MEGA STRIKE"],
    ability: "Mega Strike", abilityInfo: "One giant hit on the toughest bug in range",
  },
  {
    name: "Range", icon: "🎯", color: "#6bc5ff", mult: [1, 1.25, 1.5, 1.75, 2],
    tiers: ["See farther", "Long reach", "Huge reach", "SHOCKWAVE"],
    ability: "Shockwave", abilityInfo: "Hits every bug in range at once",
  },
];
const ABILITY_COOLDOWN = 1200; // frames (20 seconds at 1x speed)
const FRENZY_TIME = 300;       // 5 seconds

// A tower's current stats, worked out from its upgrade tiers.
function towerStats(f) {
  const base = TOWERS[f.type];
  // Glass Frogs nearby make it attack faster (and hit harder, with Power Boost)
  const glass = base.support ? { speed: 0, power: 0 } : glassBoost(f);
  const frenzy = f.frenzy > 0 ? f.frenzyMult || 0.25 : 1;
  return {
    damage: base.damage * PATHS[1].mult[f.tiers[1]] * (1 + glass.power),
    range: base.range * PATHS[2].mult[f.tiers[2]],
    cooldown: Math.max(2, Math.round((base.cooldown * PATHS[0].mult[f.tiers[0]] * frenzy) / (1 + glass.speed))),
  };
}

// Glass Frog boosts. Speed Boost path: towers attack faster. Power Boost path: towers hit harder.
const GLASS_SPEED = [0.3, 0.38, 0.46, 0.55, 0.7];  // by Speed Boost tier
const GLASS_POWER = [0.1, 0.18, 0.26, 0.35, 0.5]; // by Power Boost tier
function glassPower(g) { return { speed: GLASS_SPEED[g.tiers[0]], power: GLASS_POWER[g.tiers[1]] }; }

// The best Glass Frog boosts reaching this tower (boosts from several Glass Frogs don't stack)
function glassBoost(f) {
  const best = { speed: 0, power: 0 };
  for (const g of frogs) {
    if (g.type !== "glassfrog" || g === f) continue;
    const reach = TOWERS.glassfrog.range * PATHS[2].mult[g.tiers[2]];
    if (Math.hypot(g.x - f.x, g.y - f.y) <= reach) {
      const p = glassPower(g);
      best.speed = Math.max(best.speed, p.speed);
      best.power = Math.max(best.power, p.power);
    }
  }
  return best;
}

// Tomato Frog Harvest path: bonus flies at the end of every round, by Harvest tier
const HARVEST = [0, 15, 35, 60, 100];

// Upgrade path names. Most frogs use the normal Speed / Damage / Range names,
// but the support frogs have their own.
const PATH_NAMES = {
  tomatofrog: [
    { name: "Fly Speed", icon: "⚡", tiers: ["Faster fly making", "Even faster flies", "Fly factory", "Fly rush"] },
    { name: "Fly Amount", icon: "🪰", tiers: ["More flies per batch", "Bigger batches", "Huge batches", "Fly feast"] },
    { name: "Harvest", icon: "🍅", tiers: ["+15 flies every round", "+35 flies every round", "+60 flies every round", "+100 flies every round"] },
  ],
  glassfrog: [
    { name: "Speed Boost", icon: "⚡", tiers: ["Towers 33% faster", "Towers 41% faster", "Towers 50% faster", "Towers 65% faster"] },
    { name: "Power Boost", icon: "💪", tiers: ["Towers hit 18% harder", "Towers hit 26% harder", "Towers hit 35% harder", "Towers hit 50% harder"] },
    { name: "Wider Glow", icon: "🎯", tiers: ["Bigger glow", "Even bigger glow", "Huge glow", "Giant glow"] },
  ],
};
function pathInfo(f, i) {
  const own = PATH_NAMES[f.type] && PATH_NAMES[f.type][i];
  const base = PATHS[i];
  return { name: own ? own.name : base.name, icon: own ? own.icon : base.icon, color: base.color, tiers: own ? own.tiers : base.tiers };
}

// Which path is at tier 4 (that path's ability is unlocked). -1 if none.
// Support frogs (Glass, Tomato) get a stronger boost at tier 4 instead of an ability.
function abilityPath(f) { return TOWERS[f.type].noAbility ? -1 : f.tiers.indexOf(4); }

// Upgrade rule: max tier 4, and only one path can go past tier 2.
function upgradeBlocked(f, p) {
  if (f.tiers[p] >= 4) return "Maxed!";
  if (f.tiers[p] >= 2 && f.tiers.some((t, i) => i !== p && t > 2)) return "Locked (another path is past tier 2)";
  return null;
}
function upgradeCost(f, p) { return TOWERS[f.type].upgradeCosts[f.tiers[p]]; }
function sellValue(f) { return Math.floor(f.spent * 0.7); }

// Frogs go on grass (or on a lily pad), tadpoles and lily pads go in the pond. Nothing goes on the path.
function canPlace(type, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  const key = c + "," + r;
  if (pathSet.has(key)) return false;
  const wet = inPond(c * TILE + TILE / 2, r * TILE + TILE / 2);
  const pad = hasPad(key);
  if (type === "lilypad") return wet && !pad;
  if (type === "tadpole") return wet && !pad;
  return !wet || pad;
}

// Is there a lily pad on this tile? (one you placed, or one that was already in the pond)
function hasPad(key) {
  return pads.has(key) || mapPadTiles.has(key);
}

// Why a tower can't go somewhere (shown as a message)
function placeHint(type) {
  if (type === "tadpole") return "Tadpoles can only go in open water!";
  if (type === "lilypad") return "Lily pads go in the pond, on open water!";
  return `${TOWERS[type].name}s go on grass, or on a lily pad in the pond!`;
}

// ---------- Difficulties ----------
// Picked in the start menu: how many lives you start with and how many rounds you must survive.
const DIFFICULTIES = {
  easy:   { name: "Easy",   lives: 100, rounds: 25 },
  medium: { name: "Medium", lives: 75, rounds: 40 },
  hard:   { name: "Hard",   lives: 50, rounds: 50 },
  freeplay: { name: "Freeplay", lives: 100, rounds: Infinity }, // endless: see how far you get!
};
let difficulty = "easy";
let freeplay = false; // true when playing endless rounds (Freeplay, or after winning and keeping going)
let won = false;      // true right after beating the last round (so you can keep going)
function totalRounds() { return freeplay ? Infinity : DIFFICULTIES[difficulty].rounds; }

// ---------- Game state ----------
let money = 120;
let lives = DIFFICULTIES[difficulty].lives;
let round = 0;
let roundActive = false;
let gameOver = false;
let speed = 1;
let frogs = [];        // all towers (frogs and tadpoles)
let bugs = [];
let spawnQueue = [];
let spawnTimer = 0;
let hoverTile = null;
let selected = "frog"; // which shop item is picked
let picked = null;     // the tower whose upgrade menu is open
let shots = [];        // water drops flying from tadpoles
let effects = [];      // splashes, shockwaves and other visual effects

const $ = (id) => document.getElementById(id);
const startBtn = $("startBtn");
const speedBtn = $("speedBtn");

function updateUI() {
  const total = totalRounds();
  const mode = DIFFICULTIES[difficulty].name + (freeplay && difficulty !== "freeplay" ? " + Freeplay" : "");
  $("round").textContent = isFinite(total) ? `${round} / ${total} (${mode})` : `${round} (${mode})`;
  $("lives").textContent = lives;
  $("money").textContent = money;
  startBtn.disabled = roundActive || (gameOver && !won);
  startBtn.textContent = won ? "Keep going in Freeplay ▶" : `Start Round ${round + 1}`;
  refreshPanel();
  refreshAbilityBar();
}

function showMsg(text) { $("msg").textContent = text; }

startBtn.onclick = () => {
  // After winning, this button carries on into endless Freeplay rounds
  if (won) {
    won = false;
    gameOver = false;
    freeplay = true;
  }
  if (inMenu || roundActive || gameOver || round >= totalRounds()) return;
  round++;
  roundActive = true;
  spawnQueue = [];
  const groups = getRound(round);
  if (round <= 10) {
    for (const [tier, count] of groups) {
      for (let i = 0; i < count; i++) spawnQueue.push(tier);
    }
  } else {
    // Later rounds mix the small bugs together, then bosses come last
    const left = groups.filter(([t]) => !BUG_TYPES[t].boss).map(([t, n]) => [t, n]);
    while (left.some(([, n]) => n > 0)) {
      for (const g of left) if (g[1] > 0) { spawnQueue.push(g[0]); g[1]--; }
    }
    for (const [t, n] of groups) if (BUG_TYPES[t].boss) for (let i = 0; i < n; i++) spawnQueue.push(t);
  }
  // The ultra boss leads the way, so its tunnel can open while bugs are still coming
  const ultras = spawnQueue.filter((t) => BUG_TYPES[t].ultra);
  spawnQueue = [...ultras, ...spawnQueue.filter((t) => !BUG_TYPES[t].ultra)];
  tunnel = null;
  spawnTimer = 0;
  const bossRound = groups.some(([tier]) => BUG_TYPES[tier].boss);
  showMsg(bossRound ? `⚠️ Boss round! Watch out for ${bossList(groups)}!` : "");
  updateUI();
};

// Asks before throwing away a game that's in progress
function okToLeave(question) {
  return !(round > 0 && !gameOver && typeof confirm === "function" && !confirm(question));
}

// Restart: start a fresh game on the same map
function restartGame() {
  if (!okToLeave("Restart the game from round 1?")) return;
  resetGame();
}

function resetGame() {
  money = 120;
  lives = DIFFICULTIES[difficulty].lives;
  freeplay = difficulty === "freeplay";
  won = false;
  round = 0;
  roundActive = false;
  gameOver = false;
  frogs = [];
  pads = new Set();
  bugs = [];
  spawnQueue = [];
  spawnTimer = 0;
  shots = [];
  effects = [];
  tunnel = null;
  hoverAbility = null;
  closePanel();
  showMsg(`New game on ${currentMap.name}! Place some frogs.`);
  updateUI();
}
$("restartBtn").onclick = restartGame;

// ---------- Start menu (pick a map) ----------
let inMenu = true; // the game waits while the menu is open
const menuEl = $("menu");

function showMenu() {
  inMenu = true;
  closePanel();
  menuEl.style.display = "flex";
}
function startMap(i) {
  loadMap(MAPS[i]);
  resetGame();
  inMenu = false;
  menuEl.style.display = "none";
}
$("menuBtn").onclick = () => { if (okToLeave("Leave this game and go back to the menu?")) showMenu(); };

// Difficulty buttons in the menu
function pickDifficulty(key) {
  difficulty = key;
  for (const k of Object.keys(DIFFICULTIES)) {
    $("diff-" + k).className = "diff-btn " + k + (k === key ? " selected" : "");
  }
}

// One card per map, each with a little picture of the map
function buildMenu() {
  const diffs = $("diffList");
  for (const [key, d] of Object.entries(DIFFICULTIES)) {
    const btn = document.createElement("button");
    btn.id = "diff-" + key;
    btn.innerHTML = `<b>${d.name}</b><small>${d.lives} lives · ${isFinite(d.rounds) ? d.rounds + " rounds" : "endless rounds"}</small>`;
    btn.onclick = () => pickDifficulty(key);
    diffs.appendChild(btn);
  }
  pickDifficulty("easy");

  const list = $("mapList");
  MAPS.forEach((m, i) => {
    const card = document.createElement("button");
    card.className = "map-card";
    card.innerHTML = `<canvas width="240" height="144"></canvas>
      <span class="map-name">${m.name} <span class="map-diff ${m.difficulty.toLowerCase()}">${m.difficulty} map</span></span>
      <span class="map-desc">${m.desc}</span>`;
    card.onclick = () => startMap(i);
    list.appendChild(card);
    drawMapThumb(m, card.querySelector("canvas"));
  });
  loadMap(MAPS[0]);
}

speedBtn.onclick = () => {
  speed = speed === 3 ? 1 : speed + 1;
  speedBtn.textContent = `Speed: ${speed}x`;
};

// ---------- Shop ----------
let lastLandFrog = "frog"; // the last frog picked that can sit on a lily pad
function selectTower(type) {
  selected = type;
  if (type !== "lilypad" && type !== "tadpole") lastLandFrog = type;
  closePanel();
  for (const [t, id] of Object.entries(SHOP_BUTTONS)) {
    $(id).className = "shopItem" + (t === type ? " selected" : "");
  }
  const name = TOWERS[type].name.toLowerCase();
  showMsg(type === "tadpole" ? "Click the pond to place a tadpole" : `Click the grass to place a ${name}`);
}
for (const [t, id] of Object.entries(SHOP_BUTTONS)) $(id).onclick = () => selectTower(t);
document.addEventListener("keydown", (e) => {
  if (SHOP_KEYS[e.key]) selectTower(SHOP_KEYS[e.key]);
  if (e.key === "Escape") closePanel();
  if (e.key === "q" || e.key === "Q") useAllAbilities();
});

// ---------- Abilities bar (beside the map) ----------
// Lists every tier 4 tower so its super attack can be fired with one click.
const abilityList = $("abilityList");
let abilityKey = null;     // which towers are in the bar right now
let abilityButtons = [];
let hoverAbility = null;   // tower to highlight when its button is hovered

function refreshAbilityBar() {
  const towers = frogs.filter((f) => abilityPath(f) >= 0);
  const key = towers.map((f) => frogs.indexOf(f) + ":" + abilityPath(f)).join(",");

  // Rebuild the buttons only when the list of towers changes
  if (key !== abilityKey) {
    abilityKey = key;
    abilityList.innerHTML = towers.length
      ? ""
      : `<div class="ab-empty">Get a tower to tier 4 on any path to unlock a super attack.</div>`;
    abilityButtons = towers.map((f) => {
      const p = abilityOf(f);
      const btn = document.createElement("button");
      btn.className = "ab-btn";
      btn.title = p.info;
      btn.style.borderColor = p.color;
      btn.innerHTML = `<span class="ab-name">${p.icon} ${p.name}</span>
        <span class="ab-sub"></span>
        <span class="ab-bar"><span style="background:${p.color}"></span></span>`;
      btn.onclick = () => useAbility(f);
      btn.onmouseenter = () => (hoverAbility = f);
      btn.onmouseleave = () => (hoverAbility = null);
      abilityList.appendChild(btn);
      return { btn, f, sub: btn.querySelector(".ab-sub"), fill: btn.querySelector(".ab-bar span") };
    });
  }

  // Update cooldowns
  for (const { btn, f, sub, fill } of abilityButtons) {
    const ready = f.abilityCd === 0;
    btn.disabled = !ready;
    sub.textContent = `${TOWERS[f.type].name} · ${ready ? "READY!" : Math.ceil(f.abilityCd / 60) + "s"}`;
    fill.style.width = `${100 - (f.abilityCd / ABILITY_COOLDOWN) * 100}%`;
  }
}

// Fires every ready super attack that has bugs in range (Q key)
function useAllAbilities() {
  for (const f of frogs) {
    const a = abilityOf(f);
    if (a && f.abilityCd === 0 && abilityTargets(f, a).length) useAbility(f);
  }
}
$("useAllBtn").onclick = useAllAbilities;

// ---------- Upgrade menu ----------
const towerPanel = $("towerPanel");
let panelRefs = null;

function openPanel(f) { picked = f; buildPanel(); }
function closePanel() { picked = null; buildPanel(); }

// Builds the menu's buttons. Called when it opens or after an upgrade.
function buildPanel() {
  if (!picked) {
    towerPanel.style.display = "none";
    panelRefs = null;
    return;
  }
  const f = picked;
  towerPanel.style.display = "flex";

  let html = `<div class="tp-head"><b>${TOWERS[f.type].name}</b><button class="tp-close" title="Close">✕</button></div>
    <div class="tp-stats"></div>`;
  PATHS.forEach((_, i) => {
    const p = pathInfo(f, i);
    const t = f.tiers[i];
    const pips = "●".repeat(t) + "○".repeat(4 - t);
    const blocked = upgradeBlocked(f, i);
    // Tier 4 on an attacking frog unlocks that frog's own super attack
    const ab = ABILITIES[f.type] && ABILITIES[f.type][i];
    const tierName = t === 3 && ab ? `${ab.name.toUpperCase()} ★` : p.tiers[t];
    const label = blocked || `Tier ${t + 1}: ${tierName} – ${upgradeCost(f, i)}`;
    const tip = ab ? `Tier 4 super attack – ${ab.name}: ${ab.info}` : "";
    html += `<div class="tp-path">
      <div class="tp-name" style="color:${p.color}"><span>${p.icon} ${p.name}</span><span>${pips}</span></div>
      <button class="tp-buy" title="${tip}">${label}</button>
    </div>`;
  });
  const ab = abilityOf(f);
  if (ab) html += `<div class="tp-stats">★ ${ab.name}: ${ab.info}</div><button class="tp-ability" title="${ab.info}"></button>`;
  html += `<button class="tp-sell"></button>`;
  towerPanel.innerHTML = html;

  panelRefs = {
    stats: towerPanel.querySelector(".tp-stats"),
    buys: [...towerPanel.querySelectorAll(".tp-buy")],
    ability: towerPanel.querySelector(".tp-ability"),
    sell: towerPanel.querySelector(".tp-sell"),
  };
  towerPanel.querySelector(".tp-close").onclick = closePanel;
  panelRefs.buys.forEach((b, i) => (b.onclick = () => buyUpgrade(f, i)));
  if (panelRefs.ability) panelRefs.ability.onclick = () => useAbility(f);
  panelRefs.sell.onclick = () => sellTower(f);
  refreshPanel();
}

// Updates the live parts of the menu (what you can afford, ability timer).
function refreshPanel() {
  if (!panelRefs || !picked) return;
  const f = picked, s = towerStats(f);
  const boost = glassBoost(f);
  if (f.type === "glassfrog") {
    const g = glassPower(f);
    panelRefs.stats.textContent = `Towers in range attack ${Math.round(g.speed * 100)}% faster` +
      (g.power ? ` and hit ${Math.round(g.power * 100)}% harder` : "") + ` · Range ${Math.round(s.range)}`;
  } else if (f.type === "tomatofrog") {
    panelRefs.stats.textContent = `Makes ${Math.round(s.damage)} flies every ${(s.cooldown / 60).toFixed(1)} sec during rounds` +
      (HARVEST[f.tiers[2]] ? ` · +${HARVEST[f.tiers[2]]} flies at the end of every round` : "");
  } else {
    const extra = [];
    if (boost.speed) extra.push(`+${Math.round(boost.speed * 100)}% speed`);
    if (boost.power) extra.push(`+${Math.round(boost.power * 100)}% damage`);
    panelRefs.stats.textContent =
      `Damage ${Math.round(s.damage)} · Range ${Math.round(s.range)} · ${(60 / s.cooldown).toFixed(1)} attacks/sec` +
      (extra.length ? ` (Glass Frog: ${extra.join(", ")})` : "");
  }
  panelRefs.buys.forEach((b, i) => { b.disabled = !!upgradeBlocked(f, i) || money < upgradeCost(f, i); });
  if (panelRefs.ability) {
    const a = abilityOf(f);
    panelRefs.ability.disabled = f.abilityCd > 0;
    panelRefs.ability.textContent = f.abilityCd > 0
      ? `${a.name} recharging (${Math.ceil(f.abilityCd / 60)}s)`
      : `★ USE ${a.name.toUpperCase()}!`;
  }
  panelRefs.sell.textContent = `Sell for ${sellValue(f)}`;
}

function buyUpgrade(f, p) {
  if (upgradeBlocked(f, p)) return;
  const cost = upgradeCost(f, p);
  if (money < cost) return showMsg(`That upgrade costs ${cost}`);
  money -= cost;
  f.spent += cost;
  f.tiers[p]++;
  const a = abilityOf(f);
  showMsg(f.tiers[p] === 4 && a ? `${a.name} unlocked! Use it from this menu or the Abilities bar.` : `${pathInfo(f, p).name} upgraded!`);
  buildPanel();
  updateUI();
}

function sellTower(f) {
  money += sellValue(f);
  frogs = frogs.filter((x) => x !== f);
  closePanel();
  updateUI();
}

// All damage goes through here, so armor (and the ultra boss's stage change) always applies
function hurt(b, dmg) {
  if (b.armor) dmg *= 1 - b.armor;
  b.hp -= dmg;
  if (BUG_TYPES[b.tier].ultra && !b.stage2 && b.hp > 0 && b.hp <= b.maxHp / 2) digTunnel(b);
}

// Ultra boss stage 2: it digs a tunnel right where it stands
function digTunnel(b) {
  b.stage2 = true;
  b.armor = ULTRA.armor;
  tunnel = { x: b.x, y: b.y, wp: b.wp, flowTimer: ULTRA.flowEvery };
  showMsg(`🕳️ The ${BUG_TYPES[b.tier].name} dug a tunnel! Bugs are pouring out, and it's tougher now!`);
  effects.push({ kind: "ring", x: b.x, y: b.y, from: 10, to: 90, color: "#8b5a2b", life: 40, max: 40 });
}

// ---------- Super attacks (tier 4 abilities) ----------
function bugsInRange(f, range) {
  // A bug counts as in range when any part of its body is inside the range circle
  return bugs.filter((b) => b.hp > 0 && !b.escaped && Math.hypot(b.x - f.x, b.y - f.y) - BUG_TYPES[b.tier].size <= range);
}

// Helpers the super attacks are built from
function toughest(list) { return list.reduce((a, b) => (b.hp > a.hp ? b : a)); }
function ring(x, y, to, color, life = 30) { effects.push({ kind: "ring", x, y, from: 8, to, color, life, max: life }); }
function beam(f, b, color) { effects.push({ kind: "beam", x: f.x, y: f.y, x2: b.x, y2: b.y, color, life: 25, max: 25 }); }
function stun(b, frames) { if (!BUG_TYPES[b.tier].stunImmune) b.stun = Math.max(b.stun || 0, frames); }
function poison(b, total, frames) { b.poisonDmg = Math.max(b.poisonDmg || 0, total / frames); b.poisonTime = frames; }
function isBoss(b) { return !!BUG_TYPES[b.tier].boss; }

// Push a bug backwards along the path (bugs flying straight can't be pushed)
function pushBack(b, px) {
  if (b.route !== waypoints) return;
  while (px > 0 && b.wp > 0) {
    const prev = waypoints[b.wp - 1];
    const d = Math.hypot(prev.x - b.x, prev.y - b.y);
    if (d <= px) {
      b.x = prev.x; b.y = prev.y; px -= d;
      if (b.wp - 1 === 0) break;
      b.wp--;
    } else {
      b.x += ((prev.x - b.x) / d) * px;
      b.y += ((prev.y - b.y) / d) * px;
      px = 0;
    }
  }
}

// Every attacking frog has its own 3 super attacks: [Speed path, Damage path, Range path].
// frenzy: [speed multiplier, frames] makes the frog attack faster for a while (no target needed).
// reach: how much bigger than the frog's normal range the attack reaches.
// run(f, s, targets): does the attack. s = the frog's stats, targets = bugs in reach.
const ABILITIES = {
  frog: [
    { name: "Tongue Flurry", info: "4x attack speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Mega Lick", info: "One giant lick on the toughest bug in range (25x damage)",
      run(f, s, t) { const b = toughest(t); hurt(b, s.damage * 25); beam(f, b, "#ff6b8a"); ring(b.x, b.y, 50, "#ff6b8a"); } },
    { name: "Tongue Lash", info: "Lashes every bug in range for 6x damage",
      run(f, s, t) { for (const b of t) hurt(b, s.damage * 6); ring(f.x, f.y, s.range, "#ff6b8a", 35); } },
  ],
  tadpole: [
    { name: "Bubble Stream", info: "5x attack speed for 6 seconds", frenzy: [0.2, 360] },
    { name: "Water Cannon", info: "Blasts the toughest bug for 30x damage and knocks it back",
      run(f, s, t) { const b = toughest(t); hurt(b, s.damage * 30); pushBack(b, 80); beam(f, b, "#6bc5ff"); ring(b.x, b.y, 45, "#aee3ff"); } },
    { name: "Tidal Wave", info: "Washes every bug in range back along the path (3x damage)",
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 3); pushBack(b, isBoss(b) ? 40 : 100); } ring(f.x, f.y, s.range, "#6bc5ff", 40); } },
  ],
  dartfrog: [
    { name: "Dart Barrage", info: "4x attack speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Assassin Dart", info: "A huge dart on the toughest bug (30x damage) plus deadly poison",
      run(f, s, t) { const b = toughest(t); hurt(b, s.damage * 30); poison(b, s.damage * 10, 240); beam(f, b, "#7cff6b"); ring(b.x, b.y, 40, "#7cff6b"); } },
    { name: "Poison Cloud", info: "Poisons every bug in range (8x damage over 4 seconds)",
      run(f, s, t) { for (const b of t) poison(b, s.damage * 8, 240); ring(f.x, f.y, s.range, "#7cff6b", 45); } },
  ],
  bullfrog: [
    { name: "Slap Frenzy", info: "4x attack speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Body Slam", info: "Slams every bug nearby for 10x damage and stuns them for 1 second", reach: 2,
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 10); stun(b, 60); } ring(f.x, f.y, s.range * 2, "#e8d36a", 30); } },
    { name: "Ground Pound", info: "Shakes the ground: stuns every bug in a huge area for 2 seconds", reach: 4,
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 2); stun(b, 120); } ring(f.x, f.y, s.range * 4, "#c9a66b", 45); } },
  ],
  peeper: [
    { name: "Croak Chorus", info: "4x croak speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Thunder Croak", info: "A booming croak: every bug in range loses 8% of its max health (2% for bosses)",
      run(f, s, t) { for (const b of t) hurt(b, b.maxHp * (isBoss(b) ? 0.02 : 0.08)); ring(f.x, f.y, s.range, "#ffe9a8", 35); } },
    { name: "Deafening Croak", info: "Stuns every bug in a huge area for 3 seconds", reach: 2.5,
      run(f, s, t) { for (const b of t) stun(b, 180); ring(f.x, f.y, s.range * 2.5, "#ffe9a8", 45); } },
  ],
  flyingfrog: [
    { name: "Glide Frenzy", info: "4x attack speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Storm Chain", info: "One tongue that chains through up to 12 bugs for 5x damage each",
      run(f, s, t) {
        let cur = t.reduce((a, b) => (b.wp > a.wp ? b : a));
        const hit = new Set();
        for (let i = 0; i < 12 && cur; i++) {
          hurt(cur, s.damage * 5); hit.add(cur);
          let next = null, nd = 130;
          for (const b of bugs) {
            if (hit.has(b) || b.hp <= 0 || b.escaped) continue;
            const d = Math.hypot(b.x - cur.x, b.y - cur.y);
            if (d < nd) { nd = d; next = b; }
          }
          if (next) effects.push({ kind: "beam", x: cur.x, y: cur.y, x2: next.x, y2: next.y, color: "#ff6b8a", life: 8, max: 8 });
          cur = next;
        }
      } },
    { name: "Sky Dive", info: "Glides over the whole map, hitting every bug for 3x damage", reach: 99,
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 3); ring(b.x, b.y, 16, "#2fa84f", 15); } } },
  ],
  woodfrog: [
    { name: "Blizzard", info: "4x croak speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Ice Shatter", info: "Shatters every slowed bug in range for 15x damage", filter: (b) => b.slow > 0,
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 15); ring(b.x, b.y, 22, "#dff6ff", 18); } } },
    { name: "Deep Freeze", info: "Freezes every bug in a big area solid for 3 seconds", reach: 2,
      run(f, s, t) { for (const b of t) { stun(b, 180); b.slow = 300; b.slowAmt = 0.5; } ring(f.x, f.y, s.range * 2, "#aee8ff", 45); } },
  ],
  pacman: [
    { name: "Feeding Frenzy", info: "4x gulp speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Mega Chomp", info: "A massive bite on the toughest bug, even bosses (10x damage)",
      run(f, s, t) { const b = toughest(t); hurt(b, s.damage * 10); f.croak = 20; ring(b.x, b.y, 40, "#9bc53d"); } },
    { name: "Vacuum Gulp", info: "Sucks in and swallows up to 6 regular bugs from a big area", reach: 3,
      filter: (b) => !isBoss(b),
      run(f, s, t) {
        for (const b of [...t].sort((a, b) => b.hp - a.hp).slice(0, 6)) { beam(f, b, "#9bc53d"); hurt(b, b.hp + 1); }
        f.croak = 20; ring(f.x, f.y, s.range * 3, "#9bc53d", 40);
      } },
  ],
};

// The super attack a frog has unlocked (or null)
function abilityOf(f) {
  const p = abilityPath(f);
  if (p < 0 || !ABILITIES[f.type]) return null;
  return { ...ABILITIES[f.type][p], path: p, icon: PATHS[p].icon, color: PATHS[p].color };
}

// The bugs a super attack would hit right now
function abilityTargets(f, a) {
  const s = towerStats(f);
  let t = bugsInRange(f, s.range * (a.reach || 1));
  if (a.filter) t = t.filter(a.filter);
  return t;
}

function useAbility(f) {
  const a = abilityOf(f);
  if (!a || f.abilityCd > 0) return;
  const s = towerStats(f);
  if (a.frenzy) {
    f.frenzyMult = a.frenzy[0];
    f.frenzy = a.frenzy[1];
    ring(f.x, f.y, 60, a.color);
  } else {
    const targets = abilityTargets(f, a);
    if (targets.length === 0) return showMsg(a.filter ? `No bugs ${a.name} can hit right now!` : "No bugs in range!");
    a.run(f, s, targets);
  }
  f.abilityCd = ABILITY_COOLDOWN;
  showMsg(`${a.name}!`);
  updateUI();
}

// ---------- Mouse input ----------
function tileFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}

canvas.addEventListener("mousemove", (e) => { hoverTile = tileFromEvent(e); });
canvas.addEventListener("mouseleave", () => { hoverTile = null; });

canvas.addEventListener("click", (e) => {
  if (gameOver || inMenu) return;
  const { c, r } = tileFromEvent(e);
  const existing = frogs.find((f) => f.c === c && f.r === r);

  // Clicking a tower opens its upgrade menu
  if (existing) return openPanel(existing);
  // Clicking somewhere else while the menu is open just closes it
  if (picked) return closePanel();

  const tower = TOWERS[selected];
  if (!canPlace(selected, c, r)) {
    if ((selected === "lilypad" || selected === "tadpole") && hasPad(c + "," + r)) {
      return showMsg("That's a lily pad! Pick a land frog in the shop, then click the lily pad to put it there.");
    }
    return showMsg(placeHint(selected));
  }
  if (money < tower.cost) return showMsg(`A ${tower.name.toLowerCase()} costs ${tower.cost}`);
  money -= tower.cost;
  if (tower.isTower === false) {
    // Lily pads aren't towers: they just make a spot in the pond for land frogs
    pads.add(c + "," + r);
    // Switch back to the last land frog picked, so the next click on the pad puts it there
    selectTower(lastLandFrog);
    showMsg(`Lily pad placed! Click it to put a ${TOWERS[lastLandFrog].name} on it (or pick a different frog).`);
    return updateUI();
  }
  frogs.push({
    type: selected, c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2,
    tiers: [0, 0, 0], spent: tower.cost, cooldown: 0, angle: 0, tongue: null, abilityCd: 0, frenzy: 0,
  });
  showMsg("");
  updateUI();
});

// ---------- Game logic ----------
function spawnBug(tier) {
  const t = BUG_TYPES[tier];
  const scale = hpScale(round); // bugs get tougher each round
  // Flyers on some maps skip the path and fly straight at the goal
  const straight = t.flies && currentMap.flyStraight;
  const route = straight ? [waypoints.at(-1)] : waypoints;
  // Normally bugs start at the entrance. Once the ultra boss digs its tunnel, they come out of it.
  const start = tunnel
    ? { x: tunnel.x, y: tunnel.y, wp: straight ? 0 : tunnel.wp }
    : { x: entrance.x, y: entrance.y, wp: 0 };
  bugs.push({
    tier, x: start.x, y: start.y, route,
    wp: start.wp, hp: t.hp * scale, maxHp: t.hp * scale,
    speed: t.speed, wobble: Math.random() * 10, angle: 0,
  });
  if (t.ultra) showMsg(`💀 ULTRA BOSS: the ${t.name} is here! Get it to half health and watch out...`);
  else if (t.boss) showMsg(`⚠️ The ${t.name} has arrived!`);
}

function step() {
  // Spawn bugs from the queue
  if (spawnQueue.length > 0) {
    spawnTimer--;
    if (spawnTimer <= 0) {
      spawnBug(spawnQueue.shift());
      spawnTimer = round <= 10 ? 35 : Math.max(14, 45 - round); // bugs come faster in later rounds
    }
  }

  // The ultra boss's tunnel keeps pouring out easy bugs until the boss is squashed
  if (tunnel) {
    const bossAlive = bugs.some((b) => BUG_TYPES[b.tier].ultra && b.hp > 0);
    if (!bossAlive) {
      tunnel = null; // the tunnel caves in
    } else if (--tunnel.flowTimer <= 0) {
      spawnBug(ULTRA.flowBugs[Math.floor(Math.random() * ULTRA.flowBugs.length)]);
      tunnel.flowTimer = ULTRA.flowEvery;
    }
  }

  // Move bugs along their route (the path, or a straight line for some flyers)
  for (const b of bugs) {
    // Stunned bugs can't move
    if (b.stun > 0) { b.stun--; continue; }
    // Wood Frog frost slows bugs down for a while
    let spd = b.speed;
    if (b.slow > 0) { b.slow--; spd *= 1 - b.slowAmt; }
    const route = b.route || waypoints;
    const target = route[b.wp];
    const dx = target.x - b.x, dy = target.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) b.angle = Math.atan2(dy, dx);
    // Flying bosses cut corners: they turn toward the next corner early
    const cut = BUG_TYPES[b.tier].cornerCut || 0;
    if (cut && dist < cut && b.wp < route.length - 1) {
      b.wp++;
    } else if (dist < spd) {
      b.x = target.x; b.y = target.y;
      b.wp++;
      if (b.wp >= route.length) {
        b.escaped = true;
        lives -= BUG_TYPES[b.tier].lifeCost;
      }
    } else {
      b.x += (dx / dist) * spd;
      b.y += (dy / dist) * spd;
    }
    b.wobble += 0.3;
  }

  // Frogs attack with their tongues, tadpoles shoot water
  for (const f of frogs) {
    if (f.abilityCd > 0) f.abilityCd--;
    if (f.frenzy > 0) f.frenzy--;
    if (f.tongue) { f.tongue.life--; if (f.tongue.life <= 0) f.tongue = null; }
    if (f.croak > 0) f.croak--;
    if (f.cooldown > 0) { f.cooldown--; continue; }

    // Glass Frog doesn't attack: its boost is worked out in towerStats
    if (f.type === "glassfrog") continue;

    // Tomato Frog: makes flies every few seconds
    if (f.type === "tomatofrog") {
      const stats = towerStats(f);
      const flies = Math.round(stats.damage);
      money += flies;
      f.cooldown = stats.cooldown;
      f.croak = 14;
      effects.push({ kind: "text", text: `+${flies}`, x: f.x, y: f.y - 14, color: "#ffe066", life: 40, max: 40 });
      continue;
    }

    // Wood Frog: frosty croak slows (and chills) every bug in range
    if (f.type === "woodfrog") {
      const stats = towerStats(f);
      const hit = bugsInRange(f, stats.range);
      if (hit.length) {
        for (const b of hit) {
          hurt(b, stats.damage);
          b.slow = TOWERS.woodfrog.slowFrames;
          b.slowAmt = TOWERS.woodfrog.slow;
        }
        f.cooldown = stats.cooldown;
        f.croak = 14;
        effects.push({ kind: "ring", x: f.x, y: f.y, from: 8, to: stats.range, color: "#aee8ff", life: 20, max: 20 });
      }
      continue;
    }

    // Pacman Frog: swallows the toughest regular bug in range whole.
    // If only bosses are in range, it takes a big bite out of one instead.
    if (f.type === "pacman") {
      const stats = towerStats(f);
      const inRange = bugsInRange(f, stats.range);
      const regular = inRange.filter((b) => !BUG_TYPES[b.tier].boss);
      const pool = regular.length ? regular : inRange;
      if (pool.length) {
        const prey = pool.reduce((a, b) => (b.hp > a.hp ? b : a));
        f.angle = Math.atan2(prey.y - f.y, prey.x - f.x);
        if (BUG_TYPES[prey.tier].boss) hurt(prey, stats.damage);
        else hurt(prey, prey.hp + 1); // gulp!
        f.cooldown = stats.cooldown;
        f.croak = 20; // mouth wide open
        f.tongue = { x: prey.x, y: prey.y, life: 8 };
        effects.push({ kind: "ring", x: prey.x, y: prey.y, from: 18, to: 4, color: "#9bc53d", life: 16, max: 16 });
      }
      continue;
    }

    // Flying Frog: one tongue hits a bug, then jumps to the next nearby bug, and the next
    if (f.type === "flyingfrog") {
      const stats = towerStats(f);
      const inRange = bugsInRange(f, stats.range);
      if (inRange.length) {
        let cur = inRange.reduce((a, b) => (b.wp > a.wp ? b : a));
        f.angle = Math.atan2(cur.y - f.y, cur.x - f.x);
        f.tongue = { x: cur.x, y: cur.y, life: 8 };
        const hit = new Set();
        for (let i = 0; i < TOWERS.flyingfrog.chain && cur; i++) {
          hurt(cur, stats.damage);
          hit.add(cur);
          // find the closest bug that hasn't been hit yet
          let next = null, nd = TOWERS.flyingfrog.chainReach;
          for (const b of bugs) {
            if (hit.has(b) || b.hp <= 0 || b.escaped) continue;
            const d = Math.hypot(b.x - cur.x, b.y - cur.y);
            if (d < nd) { nd = d; next = b; }
          }
          if (next) effects.push({ kind: "beam", x: cur.x, y: cur.y, x2: next.x, y2: next.y, color: "#ff6b8a", life: 8, max: 8 });
          cur = next;
        }
        f.cooldown = stats.cooldown;
      }
      continue;
    }

    // Spring Peeper: croak shockwave hits and stuns every bug in range
    if (f.type === "peeper") {
      const stats = towerStats(f);
      const hit = bugsInRange(f, stats.range);
      if (hit.length) {
        for (const b of hit) {
          hurt(b, stats.damage);
          if (!BUG_TYPES[b.tier].stunImmune) b.stun = Math.max(b.stun || 0, STUN_FRAMES);
        }
        f.cooldown = stats.cooldown;
        f.croak = 14;
        effects.push({ kind: "ring", x: f.x, y: f.y, from: 8, to: stats.range, color: "#ffe9a8", life: 18, max: 18 });
      }
      continue;
    }

    const stats = towerStats(f);
    // Most towers target the bug furthest along the path.
    // The Poison Dart Frog snipes the toughest bug in range instead.
    let best = null;
    for (const b of bugsInRange(f, stats.range)) {
      if (f.type === "dartfrog" ? !best || b.hp > best.hp : !best || b.wp > best.wp) best = b;
    }
    if (best) {
      f.angle = Math.atan2(best.y - f.y, best.x - f.x);
      f.cooldown = stats.cooldown;
      const startX = f.x + Math.cos(f.angle) * 10, startY = f.y + Math.sin(f.angle) * 10;
      if (f.type === "tadpole") {
        shots.push({ kind: "water", x: startX, y: startY, target: best, damage: stats.damage, speed: 10 });
      } else if (f.type === "dartfrog") {
        shots.push({ kind: "dart", x: startX, y: startY, target: best, damage: stats.damage, speed: 18, angle: f.angle });
      } else {
        hurt(best, stats.damage);
        f.tongue = { x: best.x, y: best.y, life: 8 };
        if (f.type === "bullfrog") {
          // Big slap with SPLASH: every other bug near the one it hits takes half damage
          const sp = TOWERS.bullfrog.splash;
          for (const b of bugs) {
            if (b !== best && b.hp > 0 && !b.escaped && Math.hypot(b.x - best.x, b.y - best.y) <= sp.radius) {
              hurt(b, stats.damage * sp.share);
            }
          }
          effects.push({ kind: "ring", x: best.x, y: best.y, from: 6, to: sp.radius, color: "#e8d36a", life: 14, max: 14 });
        }
      }
    }
  }

  // Poisoned bugs keep taking damage
  for (const b of bugs) {
    if (b.poisonTime > 0) {
      hurt(b, b.poisonDmg);
      b.poisonTime--;
      if (b.poisonTime === 0) b.poisonDmg = 0;
    }
  }

  // Move water drops and darts toward their bug
  for (const s of shots) {
    const b = s.target;
    if (b.hp <= 0 || b.escaped) { s.done = true; continue; }
    const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy);
    if (d < s.speed) {
      hurt(b, s.damage);
      s.done = true;
      if (s.kind === "dart") {
        // Poison: keep the stronger poison if the bug is already poisoned
        const perFrame = (s.damage * POISON.share) / POISON.frames;
        b.poisonDmg = Math.max(b.poisonDmg || 0, perFrame);
        b.poisonTime = POISON.frames;
      }
      const color = s.kind === "dart" ? "#7cff6b" : "#aee3ff"; // green poison puff or water splash
      effects.push({ kind: "ring", x: b.x, y: b.y, from: 4, to: s.kind === "dart" ? 22 : 14, color, life: 12, max: 12 });
    } else {
      s.angle = Math.atan2(dy, dx);
      s.x += (dx / d) * s.speed;
      s.y += (dy / d) * s.speed;
    }
  }
  shots = shots.filter((s) => !s.done);

  // Remove dead / escaped bugs
  bugs = bugs.filter((b) => {
    if (b.hp <= 0) {
      const reward = rewardFor(b.tier);
      money += reward;
      if (BUG_TYPES[b.tier].boss) showMsg(`🎉 ${BUG_TYPES[b.tier].name} defeated! +${reward}`);
      return false;
    }
    return !b.escaped;
  });

  // Lose check
  if (lives <= 0) {
    lives = 0;
    gameOver = true;
    roundActive = false;
    showMsg(freeplay ? `💀 Game over! You survived to round ${round}. Press Restart to try again.` : "💀 The bugs reached the pond. Game over! Press Restart to try again.");
  }

  // Round complete check
  if (roundActive && spawnQueue.length === 0 && bugs.length === 0) {
    roundActive = false;
    shots = [];
    money += 25 + round * 5; // end-of-round bonus
    // Tomato Frog Harvest: bonus flies at the end of the round
    for (const f of frogs) {
      const bonus = f.type === "tomatofrog" ? HARVEST[f.tiers[2]] : 0;
      if (bonus) {
        money += bonus;
        effects.push({ kind: "text", text: `+${bonus} harvest!`, x: f.x, y: f.y - 20, color: "#ff9a6b", life: 60, max: 60 });
      }
    }
    if (round >= totalRounds()) {
      gameOver = true;
      won = true;
      showMsg(`🏆 You beat ${DIFFICULTIES[difficulty].name}! The frogs are safe! Keep going in Freeplay to see how far you can get.`);
    } else {
      showMsg(`Round ${round} cleared! +${25 + round * 5} bonus`);
    }
  }
  updateUI();
}

// ---------- Drawing ----------
function drawMap() {
  ctx.fillStyle = "#6fae4f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grass details
  for (const d of decorations) {
    if (d.kind === "grass") {
      ctx.strokeStyle = "#5a9940";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(d.x - 3, d.y); ctx.lineTo(d.x - 5, d.y - 7);
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - 9);
      ctx.moveTo(d.x + 3, d.y); ctx.lineTo(d.x + 5, d.y - 7);
      ctx.stroke();
    } else if (d.kind === "flower") {
      ctx.fillStyle = d.hue < 0.5 ? "#fff3a3" : "#f6a5c0";
      ctx.beginPath(); ctx.arc(d.x, d.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e8a317";
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#9a9a8c";
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineWidth = 1;

  // Dirt path: dark edge first, then the lighter dirt on top
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const [color, width] of [["#8a6a3d", TILE + 6], ["#c9a66b", TILE - 4]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(entrance.x, entrance.y);
    for (const w of waypoints) ctx.lineTo(w.x, w.y);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // The pond
  ctx.fillStyle = "#2b6f9e";
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx + 6, POND.ry + 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b8fd6";
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ripples
  const t = performance.now() / 1000;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 3; i++) {
    const grow = (t * 0.4 + i / 3) % 1;
    ctx.globalAlpha = 1 - grow;
    ctx.beginPath();
    ctx.ellipse(POND.x + 40, POND.y - 20, 10 + grow * 40, 5 + grow * 20, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Lily pads (with a notch cut out)
  for (const p of lilyPads) {
    ctx.fillStyle = "#2f9e44";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, p.r, 0.35, Math.PI * 2 - 0.35);
    ctx.closePath();
    ctx.fill();
  }
  const bigPad = lilyPads.reduce((a, b) => (b.r > a.r ? b : a));
  ctx.fillStyle = "#f6a5c0"; // a flower on the biggest pad
  ctx.beginPath(); ctx.arc(bigPad.x, bigPad.y - 4, 5, 0, Math.PI * 2); ctx.fill();

  // Reeds around the edge
  for (const reed of reeds) {
    ctx.strokeStyle = "#4e7d2e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(reed.x, reed.y);
    ctx.lineTo(reed.x + reed.lean * 8, reed.y - 18);
    ctx.stroke();
    ctx.fillStyle = "#6b4423";
    ctx.beginPath();
    ctx.ellipse(reed.x + reed.lean * 8, reed.y - 20, 2.5, 6, reed.lean * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 1;

  if (currentMap.goal === "home") drawHome(waypoints.at(-1));

  // Arrow showing where the bugs come in
  ctx.fillStyle = "#ffffff";
  // (points the way the bugs walk in, from whichever side of the map they enter)
  ctx.save();
  ctx.translate(waypoints[0].x + (entrance.x - waypoints[0].x) * 0.3, waypoints[0].y + (entrance.y - waypoints[0].y) * 0.3);
  ctx.rotate(Math.atan2(waypoints[0].y - entrance.y, waypoints[0].x - entrance.x));
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("➜", 0, 6);
  ctx.restore();

  // Range circle of the tower whose menu is open
  if (picked) {
    ctx.fillStyle = "rgba(255,224,102,0.12)";
    ctx.strokeStyle = "#ffe066";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(picked.x, picked.y, towerStats(picked).range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // Highlight the tower whose ability button is hovered
  if (hoverAbility) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hoverAbility.x, hoverAbility.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(hoverAbility.x, hoverAbility.y, towerStats(hoverAbility).range, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Hover highlight
  if (hoverTile && !gameOver) {
    const { c, r } = hoverTile;
    const frog = frogs.find((f) => f.c === c && f.r === r);
    const ok = frog || (!picked && canPlace(selected, c, r));
    ctx.fillStyle = ok ? "rgba(255,255,255,0.3)" : "rgba(255,0,0,0.25)";
    if (picked && !frog) ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    if (ok && frog !== picked) {
      const range = frog ? towerStats(frog).range : TOWERS[selected].range;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(c * TILE + TILE / 2, r * TILE + TILE / 2, range, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// The frogs' home base: a little mushroom house with a frog flag
function drawHome(p) {
  const x = p.x, y = p.y + 6;
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stem (the walls)
  ctx.fillStyle = "#f3e5c8";
  ctx.fillRect(x - 18, y - 8, 36, 26);
  ctx.strokeStyle = "#c9b48a";
  ctx.strokeRect(x - 18, y - 8, 36, 26);
  // Door and window
  ctx.fillStyle = "#7a4a26";
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 18);
  ctx.lineTo(x - 6, y + 6);
  ctx.arc(x, y + 6, 6, Math.PI, 0);
  ctx.lineTo(x + 6, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffe9a0";
  ctx.fillRect(x + 9, y - 2, 6, 6);
  // Red mushroom roof with white spots
  ctx.fillStyle = "#d63b3b";
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 30, 20, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  for (const [sx, sy, sr] of [[-14, -14, 4], [2, -22, 5], [15, -13, 3.5], [-3, -12, 2.5]]) {
    ctx.beginPath();
    ctx.arc(x + sx, y + sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  // Flag with a little frog face
  ctx.strokeStyle = "#5a3d1e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 20, y - 18);
  ctx.lineTo(x + 20, y - 44);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = "#3fa34d";
  ctx.beginPath();
  ctx.moveTo(x + 20, y - 44);
  ctx.lineTo(x + 38, y - 38);
  ctx.lineTo(x + 20, y - 32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(x + 25, y - 40, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 25, y - 36, 1.8, 0, Math.PI * 2); ctx.fill();
}

// Extra bits drawn on top of every tower: upgrade tiers, ability glow, etc.
function drawTowerExtras(f) {
  const ap = abilityPath(f);

  // Tier 4 towers get a glowing ring in their path's color
  if (ap >= 0) {
    ctx.strokeStyle = PATHS[ap].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    // Star above it when the super attack is ready
    if (f.abilityCd === 0) {
      ctx.fillStyle = "#ffe066";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", f.x, f.y - 20);
    }
  }

  // Frenzy glow
  if (f.frenzy > 0) {
    ctx.fillStyle = `rgba(255,184,77,${0.25 + 0.15 * Math.sin(performance.now() / 60)})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // Upgrade tiers shown as "speed-damage-range", e.g. 2-0-4
  if (f.tiers[0] + f.tiers[1] + f.tiers[2] > 0) {
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(f.x - 15, f.y + 13, 30, 12);
    PATHS.forEach((p, i) => {
      ctx.fillStyle = p.color;
      ctx.fillText(f.tiers[i], f.x - 9 + i * 9, f.y + 23);
    });
  }
}

function towerColor(f) {
  const total = f.tiers[0] + f.tiers[1] + f.tiers[2];
  return TOWERS[f.type].colors[Math.min(2, Math.floor(total / 3))];
}

function drawTadpole(f) {
  const color = towerColor(f);
  const wiggle = Math.sin(performance.now() / (f.frenzy > 0 ? 40 : 120) + f.x) * 0.5;

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);

  // Wiggly tail behind the head
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.quadraticCurveTo(-14, wiggle * 12, -22, -wiggle * 8);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Round head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(2, 0, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  for (const side of [-1, 1]) {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(7, side * 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(8.5, side * 5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrog(f) {
  if (f.type === "tadpole") {
    drawTadpole(f);
    drawTowerExtras(f);
    return;
  }

  const bull = f.type === "bullfrog";

  // Tongue (the bullfrog's is extra thick)
  if (f.tongue) {
    ctx.strokeStyle = "#ff6b8a";
    ctx.lineWidth = bull ? 8 : 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.tongue.x, f.tongue.y);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // Glass Frogs show a soft green glow over the area they boost
  if (f.type === "glassfrog" && f.tiers) {
    ctx.fillStyle = "rgba(170,240,140,0.10)";
    ctx.beginPath();
    ctx.arc(f.x, f.y, towerStats(f).range, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);

  const peep = f.type === "peeper";
  const pac = f.type === "pacman";
  const tomato = f.type === "tomatofrog";

  // Flying frogs have big webbed feet they glide with
  if (f.type === "flyingfrog") {
    ctx.fillStyle = "#f2a33a";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-2, side * 8);
      ctx.lineTo(-14, side * 20);
      ctx.lineTo(4, side * 19);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Spring peepers puff up a big throat bubble when they croak
  if (peep && f.croak > 0) {
    const puff = Math.sin((f.croak / 14) * Math.PI); // grows then shrinks
    ctx.fillStyle = "rgba(255,236,190,0.9)";
    ctx.beginPath();
    ctx.arc(10, 0, 4 + puff * 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body (bullfrogs are bigger with a pale yellow throat, peepers are small)
  ctx.fillStyle = towerColor(f);
  ctx.beginPath();
  const bodyW = bull ? 18 : peep ? 12 : pac ? 19 : tomato ? 16 : 15;
  const bodyH = bull ? 16 : peep ? 10 : pac ? 18 : tomato ? 16 : 13;
  ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
  ctx.fill();
  if (pac) {
    // Huge mouth that opens wide when it gulps
    const open = f.croak > 0 ? 0.6 : 0.15;
    ctx.fillStyle = "#3a1a10";
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.arc(4, 0, 15, -open, open);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(90,60,20,0.35)"; // brown patches
    for (const [sx, sy] of [[-9, -8], [-11, 6], [-3, 11]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (tomato) {
    // Shiny tomato-red frog that puffs up when it makes flies
    const puff = f.croak > 0 ? Math.sin((f.croak / 14) * Math.PI) * 3 : 0;
    ctx.fillStyle = towerColor(f);
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW + puff, bodyH + puff, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.ellipse(-5, -6, 5, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.type === "glassfrog") {
    // See-through belly: you can see its little red heart
    ctx.fillStyle = "#e0405a";
    ctx.beginPath();
    ctx.arc(-2, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(-4, 3, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.type === "woodfrog") {
    // Wood frogs have a dark "robber's mask" through their eyes
    ctx.fillStyle = "#3a2614";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(6, side * 8, 7, 3.5, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (peep) {
    // The dark "X" on a spring peeper's back
    ctx.strokeStyle = "#5a3d1e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -5); ctx.lineTo(1, 5);
    ctx.moveTo(-7, 5); ctx.lineTo(1, -5);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  if (bull) {
    ctx.fillStyle = "#e8d36a";
    ctx.beginPath();
    ctx.ellipse(9, 0, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)"; // darker blotches on the back
    for (const [sx, sy] of [[-8, -6], [-10, 6], [-2, 9]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Poison dart frogs have black spots and a dart tube pointing forward
  if (f.type === "dartfrog") {
    ctx.fillStyle = "#111";
    for (const [sx, sy, sr] of [[-6, -5, 2.6], [-2, 5, 2.2], [-9, 3, 1.8], [2, -2, 1.6], [-4, 0, 1.4]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#6d4c2f";
    ctx.fillRect(12, -2, 12, 4);
  }

  // Eyes (facing the target). Bullfrogs have golden eyes set wider apart.
  const eyeX = bull ? 6 : peep ? 6 : pac ? 2 : 8, eyeY = bull ? 11 : peep ? 6 : pac ? 12 : 8, eyeR = peep ? 3.5 : 5;
  for (const side of [-1, 1]) {
    ctx.fillStyle = bull || f.type === "woodfrog" ? "#e0b030" : "white";
    ctx.beginPath();
    ctx.arc(eyeX, side * eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(eyeX + eyeR * 0.4, side * eyeY, eyeR * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawTowerExtras(f);
}

// The boss: a big stag beetle with huge jaws
function drawStagBeetle(b) {
  const t = BUG_TYPES[b.tier];
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  // Six legs
  ctx.strokeStyle = "#2a170b";
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    const wig = Math.sin(b.wobble * 0.6 + i * 2) * 4;
    ctx.beginPath();
    ctx.moveTo(i * 9, 0);
    ctx.lineTo(i * 9 + wig, -26);
    ctx.moveTo(i * 9, 0);
    ctx.lineTo(i * 9 - wig, 26);
    ctx.stroke();
  }

  // Big curved jaws (mandibles)
  ctx.strokeStyle = "#6b3d1f";
  ctx.lineWidth = 5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(24, side * 6);
    ctx.quadraticCurveTo(42, side * 20, 44, side * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // Body and head
  ctx.fillStyle = t.color;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 22, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2010";
  ctx.beginPath();
  ctx.ellipse(20, 0, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shell line and shine
  ctx.strokeStyle = "#2a170b";
  ctx.beginPath();
  ctx.moveTo(-24, 0); ctx.lineTo(14, 0);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.ellipse(-8, -7, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawBossHealth(b, 36);
}

// Big health bar for bosses
function drawBossHealth(b, above) {
  const w = 60;
  ctx.fillStyle = "#400";
  ctx.fillRect(b.x - w / 2, b.y - above, w, 6);
  ctx.fillStyle = "#e53935";
  ctx.fillRect(b.x - w / 2, b.y - above, w * Math.max(0, b.hp / b.maxHp), 6);
}

// Big striped flying bosses (Yellow Jacket and Asian Giant Hornet).
// body = abdomen color, head = head color, k = how big (1 = Yellow Jacket size)
function drawYellowJacket(b, body = "#ffcc00", head = "#ffcc00", k = 1) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.scale(k, k);

  // Buzzing wings
  const flap = Math.sin(b.wobble * 2.5) * 0.35;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(2, side * 14, 13, 6, side * (0.5 + flap), 0, Math.PI * 2);
    ctx.fill();
  }

  // Stinger
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.lineTo(-33, -3);
  ctx.lineTo(-33, 3);
  ctx.closePath();
  ctx.fill();

  // Striped abdomen
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-10, 0, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  for (const x of [-18, -10, -2]) ctx.fillRect(x, -10, 4, 20);

  // Thorax and head
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(9, 0, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(19, 0, 6, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Big dark eyes
  ctx.fillStyle = "#1a1a1a";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(21, side * 4, 3, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawBossHealth(b, 30 * k);
}

// Boss: a long red centipede whose body segments wiggle behind its head
function drawCentipede(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  const segs = 9;
  for (let i = segs - 1; i >= 0; i--) {
    const sx = 16 - i * 7;
    const sy = Math.sin(b.wobble * 0.5 - i * 0.7) * 4;
    // Legs on every segment
    ctx.strokeStyle = "#e0a060";
    ctx.lineWidth = 2;
    const step = Math.sin(b.wobble + i) * 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + step, sy - 13);
    ctx.moveTo(sx, sy + 5); ctx.lineTo(sx - step, sy + 13);
    ctx.stroke();
    // Segment
    ctx.fillStyle = i === 0 ? "#5a1a10" : i % 2 ? "#8a2b1a" : "#a53a22";
    ctx.beginPath();
    ctx.ellipse(sx, sy, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pincers on the head
  ctx.strokeStyle = "#2a0e08";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(20, side * 3);
    ctx.quadraticCurveTo(28, side * 8, 27, side * 1);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.restore();
  drawBossHealth(b, 26);
}

// Boss: a huge orange moth with patterned wings that flap slowly
function drawAtlasMoth(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.scale(1.5, 1.5);
  const flap = 0.75 + Math.sin(b.wobble * 0.6) * 0.25; // wings open and close
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side * flap);
    // Front wing
    ctx.fillStyle = "#b5651d";
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(20, 18, 8, 30);
    ctx.quadraticCurveTo(-6, 22, 2, 0);
    ctx.fill();
    // Back wing
    ctx.fillStyle = "#8e3b12";
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.quadraticCurveTo(-24, 14, -16, 26);
    ctx.quadraticCurveTo(-4, 22, -2, 0);
    ctx.fill();
    // Wing "windows" and edge
    ctx.fillStyle = "#fbe6b0";
    ctx.beginPath(); ctx.ellipse(8, 16, 3, 4, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-12, 15, 2.5, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#f2d16b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 30); ctx.quadraticCurveTo(-4, 26, -16, 26);
    ctx.stroke();
    ctx.restore();
  }
  // Fuzzy body and feathery antennae
  ctx.fillStyle = "#6b3a1a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6b3a1a";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(12, side * 2);
    ctx.lineTo(20, side * 8);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.restore();
  drawBossHealth(b, 44);
}

// ULTRA BOSS: a huge fuzzy mole cricket with big shovel claws for digging.
// In stage 2 it gets an armored look and angry red eyes.
function drawMoleCricket(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.scale(1.6, 1.6);

  // Back legs
  ctx.strokeStyle = "#4a3220";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    const kick = Math.sin(b.wobble * 0.5 + side) * 3;
    ctx.beginPath();
    ctx.moveTo(-6, side * 6);
    ctx.lineTo(-14 + kick, side * 15);
    ctx.lineTo(-22 + kick, side * 12);
    ctx.stroke();
  }
  // Big digging claws in front, scooping back and forth
  const dig = Math.sin(b.wobble * 0.8) * 0.4;
  ctx.fillStyle = "#3a2616";
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(12, side * 7);
    ctx.rotate(side * (0.5 + dig));
    ctx.beginPath();
    ctx.ellipse(6, 0, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -1; i <= 1; i++) { // claw teeth
      ctx.beginPath();
      ctx.moveTo(11, i * 3);
      ctx.lineTo(16, i * 3.5);
      ctx.lineTo(11, i * 3 + 1.5);
      ctx.fill();
    }
    ctx.restore();
  }
  // Fuzzy body (abdomen and folded wings)
  ctx.fillStyle = b.stage2 ? "#4a3220" : "#6b4a2f";
  ctx.beginPath();
  ctx.ellipse(-8, 0, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,230,190,0.18)";
  ctx.beginPath();
  ctx.ellipse(-8, 0, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Armored head shield (thicker and shinier in stage 2)
  ctx.fillStyle = b.stage2 ? "#2a1c12" : "#57391f";
  ctx.beginPath();
  ctx.ellipse(7, 0, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (b.stage2) {
    ctx.strokeStyle = "#b08850";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(7, 0, 10, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Eyes
  for (const side of [-1, 1]) circle(14, side * 4, 2, b.stage2 ? "#ff3b30" : "#111");
  // Antennae
  ctx.strokeStyle = "#3a2616";
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(15, side * 2);
    ctx.quadraticCurveTo(22, side * 6, 24, side * 12);
    ctx.stroke();
  }
  ctx.restore();

  // Extra-wide health bar with a mark at half health (where stage 2 starts)
  const w = 90, y = b.y - 46;
  ctx.fillStyle = "#400";
  ctx.fillRect(b.x - w / 2, y, w, 8);
  ctx.fillStyle = b.stage2 ? "#ff7a00" : "#e53935";
  ctx.fillRect(b.x - w / 2, y, w * Math.max(0, b.hp / b.maxHp), 8);
  ctx.fillStyle = "#fff";
  ctx.fillRect(b.x - 1, y - 2, 2, 12);
}

// The ultra boss's tunnel: a dark hole with a dirt mound around it
function drawTunnel() {
  if (!tunnel) return;
  const { x, y } = tunnel;
  ctx.fillStyle = "#8b5a2b";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 26, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy, r] of [[-20, 8, 6], [18, 10, 7], [-8, -14, 5], [14, -12, 5]]) circle(x + dx, y + dy, r, "#7a4d22");
  ctx.fillStyle = "#1a0f06";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 16, 11, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A placed lily pad (a big round leaf with a notch, and a darker rim)
function drawPad(x, y, r) {
  ctx.fillStyle = "#1f7a33";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r + 2, 0.3, Math.PI * 2 - 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#34a853";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, 0.3, Math.PI * 2 - 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)"; // leaf veins
  ctx.beginPath();
  for (const a of [1.2, 2.2, 3.2, 4.2, 5.2]) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
  }
  ctx.stroke();
}

// Slowed bugs get an icy blue glow
function drawFrost(b) {
  const s = BUG_TYPES[b.tier].size + 3;
  ctx.fillStyle = "rgba(174,232,255,0.35)";
  ctx.beginPath();
  ctx.arc(b.x, b.y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,245,255,0.8)";
  ctx.beginPath();
  ctx.arc(b.x, b.y, s, 0, Math.PI * 2);
  ctx.stroke();
}

// Little spinning stars over a stunned bug
function drawStun(b) {
  const s = BUG_TYPES[b.tier].size;
  const t = performance.now() / 200;
  ctx.fillStyle = "#ffe066";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < 3; i++) {
    const a = t + (i * Math.PI * 2) / 3;
    ctx.fillText("★", b.x + Math.cos(a) * (s + 4), b.y - s - 4 + Math.sin(a) * 4);
  }
}

// Poisoned look: a green glow with little bubbles floating up
function drawPoison(b) {
  const size = BUG_TYPES[b.tier].size + 4;
  const t = performance.now() / 300;
  ctx.fillStyle = "rgba(124,255,107,0.18)";
  ctx.beginPath();
  ctx.arc(b.x, b.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7cff6b";
  for (let i = 0; i < 3; i++) {
    const rise = (t + i / 3) % 1; // 0 -> 1, then loops
    ctx.globalAlpha = 1 - rise;
    ctx.beginPath();
    ctx.arc(b.x + (i - 1) * 6, b.y - size * 0.3 - rise * 16, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// See-through wings that flap (used by flying bugs)
function drawWings(b, s, color = "rgba(255,255,255,0.6)") {
  ctx.fillStyle = color;
  const flap = Math.sin(b.wobble) * 3;
  ctx.beginPath();
  ctx.ellipse(b.x - 3, b.y - s + flap, s * 0.6, s * 0.35, -0.5, 0, Math.PI * 2);
  ctx.ellipse(b.x + 3, b.y - s - flap, s * 0.6, s * 0.35, 0.5, 0, Math.PI * 2);
  ctx.fill();
}

// Wiggling legs sticking out both sides
function drawLegs(b, s, color, pairs = 3, spread = 6) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < pairs; i++) {
    const off = (i - (pairs - 1) / 2) * spread;
    const wig = Math.sin(b.wobble + i) * 3;
    ctx.beginPath();
    ctx.moveTo(b.x - s - 3, b.y + off + wig);
    ctx.lineTo(b.x + s + 3, b.y + off - wig);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}

function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawBug(b) {
  const t = BUG_TYPES[b.tier];
  // Bosses have their own drawings
  if (b.tier === 4) return drawStagBeetle(b);
  if (b.tier === 5) return drawYellowJacket(b);
  if (b.tier === 13) return drawCentipede(b);
  if (b.tier === 14) return drawAtlasMoth(b);
  if (b.tier === 15) return drawYellowJacket(b, "#e8731c", "#ff9a2e", 1.35);
  if (b.tier === 16) return drawMoleCricket(b);

  const s = t.size;
  let x = b.x, y = b.y;

  switch (t.look) {
    case "cricket": {
      // Hops along: bounces up and down, with long back legs and antennae
      y -= Math.abs(Math.sin(b.wobble * 0.5)) * 5;
      ctx.strokeStyle = "#4e4318";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 2, y); ctx.lineTo(x - 10, y - 7); ctx.lineTo(x - 12, y + 5);
      ctx.moveTo(x + 2, y); ctx.lineTo(x + 10, y - 7); ctx.lineTo(x + 12, y + 5);
      ctx.moveTo(x, y - s); ctx.lineTo(x - 6, y - s - 9);
      ctx.moveTo(x, y - s); ctx.lineTo(x + 6, y - s - 9);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.8, s, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "gnat":
      drawWings(b, s);
      circle(x, y, s, t.color);
      break;
    case "mosquito":
      // Skinny body, long thin legs, a pointy nose
      ctx.strokeStyle = "#3a2e24";
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(x, y + i * 3);
          ctx.lineTo(x + side * 13, y + i * 6 + Math.sin(b.wobble + i) * 2);
          ctx.stroke();
        }
      }
      drawWings(b, s, "rgba(220,235,255,0.6)");
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.45, s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.beginPath();
      ctx.moveTo(x, y + s); ctx.lineTo(x, y + s + 7);
      ctx.stroke();
      break;
    case "beetle":
      drawLegs(b, s, "#3b1d0a");
      circle(x, y, s, t.color);
      break;
    case "ladybug":
      drawLegs(b, s, "#111", 3, 5);
      circle(x, y, s, t.color);
      circle(x, y - s + 3, 5, "#111"); // head
      ctx.strokeStyle = "#111";
      ctx.beginPath(); ctx.moveTo(x, y - s + 4); ctx.lineTo(x, y + s); ctx.stroke();
      for (const [dx, dy] of [[-5, -2], [5, -2], [-4, 5], [4, 5]]) circle(x + dx, y + dy, 2.2, "#111");
      break;
    case "ant":
      // Three body parts in a row, plus legs and antennae
      drawLegs(b, s - 2, "#5a1a08", 3, 5);
      circle(x, y + 7, s * 0.7, t.color);
      circle(x, y, s * 0.45, t.color);
      circle(x, y - 7, s * 0.55, "#8a2408");
      ctx.strokeStyle = "#5a1a08";
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 11); ctx.lineTo(x - 6, y - 17);
      ctx.moveTo(x + 2, y - 11); ctx.lineTo(x + 6, y - 17);
      ctx.stroke();
      break;
    case "hornet":
      drawWings(b, s);
      circle(x, y, s, t.color);
      ctx.fillStyle = "#222";
      ctx.fillRect(x - s + 3, y - 2, (s - 3) * 2, 3);
      ctx.fillRect(x - s + 5, y + 5, (s - 5) * 2, 3);
      break;
    case "mantis": {
      // Long green body, triangle head, and folded grabbing arms
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(x, y + 3, s * 0.4, s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 6, y - s + 2); ctx.lineTo(x + 6, y - s + 2); ctx.lineTo(x, y - s - 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#3d8b3d";
      ctx.lineWidth = 3;
      const grab = Math.sin(b.wobble * 0.7) * 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, y - s + 6);
        ctx.lineTo(x + side * 9, y - s + 2 - grab);
        ctx.lineTo(x + side * 4, y - s - 4);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      circle(x - 3, y - s - 1, 1.6, "#fff");
      circle(x + 3, y - s - 1, 1.6, "#fff");
      break;
    }
    case "wasp":
      // Slim, with a thin waist and a stinger
      drawWings(b, s, "rgba(255,240,200,0.6)");
      circle(x, y - 7, s * 0.5, "#222");
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, s * 0.55, s * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.fillRect(x - 6, y + 1, 12, 2.5);
      ctx.fillRect(x - 5, y + 7, 10, 2.5);
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 4 + s * 0.8); ctx.lineTo(x + 2, y + 4 + s * 0.8); ctx.lineTo(x, y + 4 + s * 0.8 + 6);
      ctx.closePath();
      ctx.fill();
      break;
    case "rhino":
      // Big dark beetle with a curved horn
      drawLegs(b, s, "#1a120c", 3, 8);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, s, s * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + s + 2); ctx.stroke();
      ctx.fillStyle = "#5c4433";
      ctx.beginPath();
      ctx.moveTo(x - 4, y - s + 2);
      ctx.quadraticCurveTo(x - 2, y - s - 14, x + 6, y - s - 12);
      ctx.quadraticCurveTo(x + 1, y - s - 6, x + 4, y - s + 2);
      ctx.closePath();
      ctx.fill();
      circle(x - 6, y - 3, 3, "rgba(255,255,255,0.15)");
      break;
  }

  // Health bar
  const w = 24;
  ctx.fillStyle = "#400";
  ctx.fillRect(b.x - w / 2, b.y - s - 10, w, 4);
  ctx.fillStyle = "#4caf50";
  ctx.fillRect(b.x - w / 2, b.y - s - 10, w * Math.max(0, b.hp / b.maxHp), 4);
}

function drawEffects() {
  for (const e of effects) {
    const k = e.life / e.max; // goes from 1 down to 0
    ctx.globalAlpha = k;
    ctx.strokeStyle = e.color;
    if (e.kind === "ring") {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.to - (e.to - e.from) * k, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.kind === "beam") {
      ctx.lineWidth = e.max <= 8 ? 4 : 10 * k + 2; // short beams (tongue chains) are thin
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    } else if (e.kind === "text") {
      // Floating text that drifts up, like "+6" flies
      ctx.fillStyle = e.color;
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(e.text, e.x, e.y - (1 - k) * 18);
    }
    e.life--;
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  effects = effects.filter((e) => e.life > 0);
}

function draw() {
  drawMap();
  drawTunnel();
  for (const key of pads) {
    const [c, r] = key.split(",").map(Number);
    drawPad(c * TILE + TILE / 2, r * TILE + TILE / 2, 18);
  }
  for (const b of bugs) drawBug(b);
  for (const b of bugs) if (b.poisonTime > 0) drawPoison(b);
  for (const b of bugs) if (b.stun > 0) drawStun(b);
  for (const b of bugs) if (b.slow > 0) drawFrost(b);
  for (const f of frogs) drawFrog(f);

  // Water drops and poison darts
  for (const s of shots) {
    if (s.kind === "dart") {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.strokeStyle = "#6d4c2f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.fillStyle = "#7cff6b"; // poison tip
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(3, -3);
      ctx.lineTo(3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1;
    } else {
      ctx.fillStyle = "#aee3ff";
      ctx.strokeStyle = "#1e6fb8";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawEffects();
}

// Draw the little pictures on the shop buttons
function drawShopIcon(canvasId, type) {
  const icon = document.getElementById(canvasId);
  const saved = ctx;
  ctx = icon.getContext("2d");
  if (type === "lilypad") drawPad(20, 20, 15);
  else drawFrog({ type, x: 20, y: 20, tiers: [0, 0, 0], angle: -Math.PI / 2, tongue: null, abilityCd: 0, frenzy: 0 });
  ctx = saved;
}
drawShopIcon("iconFrog", "frog");
drawShopIcon("iconTadpole", "tadpole");
drawShopIcon("iconDart", "dartfrog");
drawShopIcon("iconBull", "bullfrog");
drawShopIcon("iconPeeper", "peeper");
drawShopIcon("iconPad", "lilypad");
drawShopIcon("iconFlying", "flyingfrog");
drawShopIcon("iconWood", "woodfrog");
drawShopIcon("iconPacman", "pacman");
drawShopIcon("iconGlass", "glassfrog");
drawShopIcon("iconTomato", "tomatofrog");

// Draws a whole map, shrunk down, for the menu cards
function drawMapThumb(map, thumb) {
  loadMap(map);
  const full = document.createElement("canvas");
  full.width = canvas.width;
  full.height = canvas.height;
  const saved = ctx;
  ctx = full.getContext("2d");
  drawMap();
  ctx = saved;
  thumb.getContext("2d").drawImage(full, 0, 0, thumb.width, thumb.height);
}
buildMenu();

// ---------- Main loop ----------
function loop() {
  if (!gameOver && !inMenu) {
    for (let i = 0; i < speed; i++) {
      if (roundActive) step();
      else for (const f of frogs) if (f.tongue && --f.tongue.life <= 0) f.tongue = null;
    }
  }
  draw();
  requestAnimationFrame(loop);
}

updateUI();
loop();
