// Frog Pond Defense - a simple tower defense game.
// Frogs and tadpoles are the towers, bugs are the enemies. Survive 10 rounds!

// Bump this (and data-version + ?v= in index.html) every time the game is updated.
// If index.html and game.js come from different updates, the game shows a warning.
const GAME_VERSION = 44;
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

// More map options:
// extraPaths: more routes from other entrances (bugs take turns using each entrance).
// A path point written [c, r, "tp"] is a PORTAL: bugs reaching the point before it teleport to it.
// slippery: path tiles that cross the pond are a log bridge, and bugs on it slow down by this much.
MAPS.push(
  {
    name: "Two Streams", difficulty: "Medium",
    desc: "GIMMICK: two entrances! Bugs take turns coming from the left and the right, then the two streams join up and head for the pond.",
    pond: { x: 560, y: 360, rx: 120, ry: 70 },
    path: [[0, 2], [6, 2], [6, 5], [9, 5], [9, 7], [3, 7], [3, 10], [12, 10]],
    extraPaths: [[[19, 2], [13, 2], [13, 5], [9, 5], [9, 7], [3, 7], [3, 10], [12, 10]]],
    goal: "pond", reedGap: 2.5, seed: 31,
    lilyPads: [{ x: 580, y: 340, r: 16 }, { x: 630, y: 380, r: 13 }, { x: 540, y: 395, r: 11 }],
  },
  {
    name: "Log Bridge", difficulty: "Medium",
    desc: "GIMMICK: the path crosses the pond on a slippery log. Bugs on the bridge slow to half speed, right next to your Tadpoles!",
    pond: { x: 400, y: 240, rx: 180, ry: 120 },
    path: [[0, 1], [3, 1], [3, 6], [16, 6], [16, 10], [9, 10]],
    goal: "home", reedGap: [Math.PI, 0], seed: 41, slippery: 0.5,
    lilyPads: [{ x: 330, y: 180, r: 16 }, { x: 470, y: 170, r: 14 }, { x: 350, y: 330, r: 15 }, { x: 460, y: 320, r: 18 }],
  },
  {
    name: "Mushroom Portals", difficulty: "Hard",
    desc: "GIMMICK: magic mushroom rings! Bugs that walk into one pop out of its twin somewhere else on the map.",
    pond: { x: 420, y: 250, rx: 120, ry: 80 },
    path: [[0, 1], [5, 1], [5, 5], [18, 1, "tp"], [18, 5], [15, 5], [1, 10, "tp"], [10, 10], [10, 7]],
    goal: "pond", reedGap: Math.PI / 2, seed: 51,
    lilyPads: [{ x: 380, y: 230, r: 15 }, { x: 460, y: 270, r: 16 }, { x: 440, y: 210, r: 11 }],
  },
  {
    name: "Hilltop Home", difficulty: "Medium",
    desc: "The frogs live on a hilltop in the corner! The bugs wind past a pond on their way up, so the pond isn't the end this time.",
    pond: { x: 150, y: 380, rx: 110, ry: 70 },
    path: [[0, 6], [4, 6], [4, 2], [9, 2], [9, 9], [14, 9], [14, 3], [17, 3], [17, 1]],
    goal: "home", reedGap: null, seed: 61,
    lilyPads: [{ x: 120, y: 370, r: 16 }, { x: 190, y: 400, r: 13 }, { x: 150, y: 345, r: 11 }],
  },
);

// ---- Roundabout: 2 entrances, a loop around the pond that bugs run TWICE, then 2 exits ----
// The loop goes clockwise around the pond. Bugs from the left join at the top-left corner,
// bugs from the right join at the bottom-right corner. After 2 laps they branch off to an exit:
// one exit at the top, one at the bottom. Bugs take turns using each entrance and each exit.
{
  const lapFromTopLeft = [[13, 3], [13, 8], [6, 8], [6, 3]];     // one lap, starting and ending top-left
  const lapFromBottomRight = [[6, 8], [6, 3], [13, 3], [13, 8]]; // one lap, starting and ending bottom-right
  const left = [[0, 3], [6, 3], ...lapFromTopLeft, ...lapFromTopLeft];
  const right = [[19, 8], [13, 8], ...lapFromBottomRight, ...lapFromBottomRight];
  const topExit = [[13, 3], [13, -1]];   // leave the map at the top
  const bottomExit = [[6, 8], [6, 12]];  // leave the map at the bottom
  MAPS.push({
    name: "Roundabout", difficulty: "Normal",
    desc: "GIMMICK: 2 entrances and 2 exits! Bugs join a loop around the pond, run around it TWICE, then branch off to the top or bottom exit.",
    pond: { x: 390, y: 230, rx: 100, ry: 55 },
    path: [...left, ...topExit],
    extraPaths: [
      [...right, ...bottomExit],
      [...left, [13, 3], [13, 8], ...bottomExit],
      [...right, [6, 8], [6, 3], ...topExit],
    ],
    goal: "exit", reedGap: null, seed: 71,
    lilyPads: [{ x: 360, y: 220, r: 15 }, { x: 430, y: 245, r: 13 }, { x: 330, y: 250, r: 10 }],
  });
}

// The current map's layout (filled in by loadMap)
let currentMap, POND, PATH_TILES, waypoints, entrance, pathSet, decorations, reeds, lilyPads, mapPadTiles;
let routes = [];          // every route bugs can take: { points, entrance }
let bridgeSet = new Set(); // path tiles that cross the pond (a log bridge)
let portals = [];          // { from, to, color } pairs of mushroom rings

let PONDS = [];            // every pond on the map (the first one is POND)
function inPond(x, y) {
  return PONDS.some((P) => ((x - P.x) / P.rx) ** 2 + ((y - P.y) / P.ry) ** 2 <= 1);
}
// Where the bugs end up on each route (for maps with several homes)
function routeEnds() {
  const seen = new Set();
  return routes.map((r) => r.points.at(-1)).filter((p) => (seen.has(p.x + "," + p.y) ? false : seen.add(p.x + "," + p.y)));
}

// Turns a list of [c, r] (or [c, r, "tp"]) into points bugs walk to
function makeRoute(path) {
  const points = path.map(([c, r, tp]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, tp: tp === "tp" }));
  // Bugs appear one tile outside the map edge, lined up with the first stretch of path
  const dx = points[0].x - points[1].x, dy = points[0].y - points[1].y;
  const len = Math.hypot(dx, dy) || 1;
  return { points, entrance: { x: points[0].x + (dx / len) * TILE, y: points[0].y + (dy / len) * TILE } };
}

function loadMap(map) {
  currentMap = map;
  POND = map.pond;
  PONDS = [map.pond, ...(map.extraPonds || [])];
  PATH_TILES = map.path;
  routes = [map.path, ...(map.extraPaths || [])].map(makeRoute);
  waypoints = routes[0].points;
  entrance = routes[0].entrance;

  // Mark every tile on the paths so towers can't be placed there (portal jumps aren't walked)
  pathSet = new Set();
  portals = [];
  const portalColors = ["#b06ad9", "#4fb3d9", "#e0884f"];
  for (const path of [map.path, ...(map.extraPaths || [])]) {
    for (let i = 0; i < path.length - 1; i++) {
      let [c1, r1] = path[i];
      const [c2, r2, tp] = path[i + 1];
      pathSet.add(c1 + "," + r1);
      if (tp === "tp") {
        portals.push({ from: { c: c1, r: r1 }, to: { c: c2, r: r2 }, color: portalColors[portals.length % 3] });
        continue;
      }
      while (c1 !== c2 || r1 !== r2) {
        c1 += Math.sign(c2 - c1);
        r1 += Math.sign(r2 - r1);
        pathSet.add(c1 + "," + r1);
      }
    }
    pathSet.add(path.at(-1)[0] + "," + path.at(-1)[1]);
  }
  // Path tiles in the water are a bridge
  bridgeSet = new Set([...pathSet].filter((k) => {
    const [c, r] = k.split(",").map(Number);
    return inPond(c * TILE + TILE / 2, r * TILE + TILE / 2);
  }));

  // Random grass, flowers, rocks and reeds (same every time thanks to a fixed seed).
  let seed = map.seed;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  decorations = [];
  for (let i = 0; i < 160; i++) {
    const x = rand() * canvas.width, y = rand() * canvas.height;
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (pathSet.has(c + "," + r) || inPond(x, y)) continue;
    if (map.goal === "home" && routeEnds().some((p) => Math.hypot(x - p.x, y - p.y) < 45)) continue;
    const roll = rand();
    decorations.push({ x, y, kind: roll < 0.7 ? "grass" : roll < 0.88 ? "flower" : "rock", hue: rand() });
  }
  reeds = [];
  PONDS.forEach((P, i) => {
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      // gaps where the path enters the (main) pond
      const gaps = map.reedGap === null || i > 0 ? [] : [].concat(map.reedGap);
      if (gaps.some((g) => Math.abs(a - g) < 0.4 || Math.abs(a - g - Math.PI * 2) < 0.4)) continue;
      const x = P.x + Math.cos(a) * (P.rx + 4), y = P.y + Math.sin(a) * (P.ry + 4);
      if (pathSet.has(Math.floor(x / TILE) + "," + Math.floor(y / TILE))) continue; // no reeds on the path
      reeds.push({ x, y, lean: rand() - 0.5 });
    }
  });
  lilyPads = []; // ponds start empty: only lily pads you place yourself are in the water

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
  // every bug comes out of the tunnel, beetles keep pouring out, and it takes less damage.
  // It's too big to be stunned by Spring Peepers.
  // INVISIBLE bugs: frogs can't see or hit them unless a Glass Frog's glow is reaching them.
  17: { name: "Glasswing Butterfly", hp: 500, speed: 1.4, reward: 40, lifeCost: 6, color: "#3a2a20", size: 12, look: "glasswing", invisible: true, flies: true, cornerCut: 60 },
  18: { name: "Ghost Mantis", hp: 1100, speed: 0.9, reward: 70, lifeCost: 8, color: "#cfc6b4", size: 15, look: "mantis", invisible: true },
  // Stink Bug: when it's squashed, its stink cloud stops nearby frogs attacking for 1.5 seconds
  19: { name: "Stink Bug", hp: 260, speed: 1.1, reward: 28, lifeCost: 4, color: "#6b7a3a", size: 12, look: "stink", stink: 90 },
  // Pill Bug: an armored roly-poly. Its shell blocks 25% of all damage.
  20: { name: "Pill Bug", hp: 400, speed: 0.9, reward: 38, lifeCost: 5, color: "#7d8590", size: 12, look: "pill", armor: 0.25 },
  // Boss: Hercules Beetle. A huge beetle whose armor blocks 30% of all damage.
  // Boss: Wolf Spider. Mother wolf spiders carry their babies on their back,
  // so when she's squashed she splits into 6 Spiderlings that keep running.
  22: { name: "Wolf Spider", hp: 2300, speed: 0.9, reward: 220, lifeCost: 12, color: "#6b5038", size: 20, boss: true, splits: { into: 23, count: 6 } },
  // Spiderling: tiny and fast. Only comes out of a Wolf Spider.
  23: { name: "Spiderling", hp: 80, speed: 1.6, reward: 6, lifeCost: 2, color: "#7a5a3e", size: 7, look: "spiderling" },
  21: { name: "Hercules Beetle", hp: 6000, speed: 0.45, reward: 450, lifeCost: 15, color: "#2a2018", size: 24, boss: true, armor: 0.3 },
  16: { name: "Giant Mole Cricket", hp: 5000, speed: 0.35, reward: 1000, lifeCost: 50, color: "#6b4a2f", size: 26, boss: true, ultra: true, stunImmune: true },
};

// Ultra boss stage 2 settings
const ULTRA = {
  armor: 0.25,            // takes 25% less damage in stage 2
  flowEvery: 30,          // frames between beetles coming out of the tunnel (0.5 seconds)
  flowBugs: [2, 8],       // Beetle, Ladybug (only beetles come out of the tunnel)
  rhinoEvery: 1200,       // plus a Rhino Beetle every 20 seconds
};
let tunnel = null;        // { x, y, wp, route, flowTimer } once the ultra boss digs it
let spawnCount = 0;       // used to take turns between entrances

// Normal bugs from weakest to strongest, with the round each one first shows up (after round 10)
// and how common it is (weight). The Wasp shows up early but stays rare.
const NORMALS = [
  { id: 6, from: 1, weight: 0.5 }, { id: 1, from: 1, weight: 1 }, { id: 7, from: 1, weight: 1 },
  { id: 2, from: 1, weight: 1 }, { id: 8, from: 1, weight: 1 }, { id: 9, from: 1, weight: 1 },
  { id: 3, from: 1, weight: 1.2 }, { id: 10, from: 1, weight: 1 }, { id: 11, from: 9, weight: 0.35 },
  { id: 12, from: 16, weight: 0.7 },
  { id: 19, from: 12, weight: 0.6 }, // Stink Bug
  { id: 20, from: 20, weight: 0.6 }, // Pill Bug
];

// Rounds 1-10 are hand-made: [bug ID, count] groups. (Bosses are added below.)
const ROUNDS = [
  [[6, 8], [1, 6]],
  [[1, 12], [7, 3]],
  [[1, 10], [2, 3], [7, 3]],
  [[2, 6], [8, 2]],
  [[1, 20], [2, 6]],
  [[2, 8], [9, 2], [3, 2]],
  [[1, 20], [7, 6], [3, 4]],
  [[2, 15], [3, 6]],
  [[3, 10], [10, 1], [11, 1]],          // the first (rare) Wasp
  [[1, 30], [2, 15], [3, 15]],
];

// Rounds 11+ are made by a formula. Each round has a "strength budget" that grows
// every round, shared out between all the normal bugs unlocked so far.
function normalBugsFor(r) {
  const budget = (10 + r) * 30 + Math.floor(r * 0.7) * 110 + Math.floor(r * 0.5) * 220;
  const unlocked = NORMALS.filter((n) => r >= n.from);
  const totalWeight = unlocked.reduce((s, n) => s + n.weight, 0);
  // Rare bugs (Wasp, Rhino Beetle) always send at least 1 once they're unlocked
  return unlocked
    .map((n) => {
      const count = Math.round((budget * n.weight) / totalWeight / BUG_TYPES[n.id].hp);
      return [n.id, n.from > 1 ? Math.max(1, count) : count];
    })
    .filter(([, count]) => count > 0);
}
for (let r = 11; r <= 50; r++) ROUNDS.push(normalBugsFor(r));

// ----- Bosses -----
// Each boss DEBUTS once, at the end of its first round.
// 5 rounds later it becomes COMMON: it shows up in the MIDDLE of rounds,
// first every 3rd round, then (10 rounds later) every 2nd round,
// and it brings a friend every 15 rounds (2 at a time, then 3...).
const BOSS_PLAN = [
  { id: 4,  debut: 5 },   // Stag Beetle
  { id: 13, debut: 10 },  // Giant Centipede
  { id: 14, debut: 15 },  // Atlas Moth
  { id: 22, debut: 20 },  // Wolf Spider
  { id: 5,  debut: 25 },  // Yellow Jacket
  { id: 15, debut: 35 },  // Asian Giant Hornet
  { id: 21, debut: 45 },  // Hercules Beetle
];
const ULTRA_ROUND = 50;   // the Giant Mole Cricket only ever comes once

// Bosses for a round: [bug ID, count, "end" or "mid"]
function bossesFor(r) {
  const out = [];
  for (const b of BOSS_PLAN) {
    if (r === b.debut) { out.push([b.id, 1, "end"]); continue; }
    const k = r - (b.debut + 5); // rounds since it became common
    if (k < 0) continue;
    const every = k < 10 ? 3 : 2;
    if (k % every === 0) out.push([b.id, 1 + Math.floor(k / 15), "mid"]);
  }
  if (r === ULTRA_ROUND) out.push([16, 1, "end"]);
  return out;
}

// Invisible bugs work like bosses: one shows up at the end of its first round,
// then they start sneaking into the middle of rounds every few rounds.
const INVISIBLE_PLAN = [
  { id: 17, debut: 30 }, // Glasswing Butterfly
  { id: 18, debut: 40 }, // Ghost Mantis
];
function invisiblesFor(r) {
  const out = [];
  for (const b of INVISIBLE_PLAN) {
    if (r === b.debut) { out.push([b.id, 1, "end"]); continue; }
    const k = r - (b.debut + 1);
    if (k < 0) continue;
    const every = k < 10 ? 3 : 2;
    if (k % every === 0) out.push([b.id, 1 + Math.floor(k / 15), "mid"]);
  }
  return out;
}

// Can frogs see this bug? Invisible bugs only show up inside a Glass Frog's glow.
function canSee(b) { return !b.invisible || b.revealed; }
function updateReveals() {
  const glass = frogs.filter((f) => f.type === "glassfrog");
  for (const b of bugs) {
    if (!b.invisible) continue;
    b.revealed = glass.some((g) => Math.hypot(g.x - b.x, g.y - b.y) - BUG_TYPES[b.tier].size <= towerStats(g).range);
  }
}

// Everything in a round. Rounds after 50 (Freeplay) are made up on the spot and never run out.
// BOSS RUSH: every round is only bosses. It goes through the 7 regular bosses in order,
// and each time round it brings one more of each.
const RUSH_ORDER = [4, 13, 14, 22, 5, 15, 21];
function isBossRush() { return !challenge && DIFFICULTIES[difficulty] && DIFFICULTIES[difficulty].bossRush; }
// Boss Rush bosses are a lot tougher than they'd normally be at that round
function hpRound() { return isBossRush() ? 10 + round * 2 : round; }
function getRound(r) {
  if (isBossRush()) {
    const id = RUSH_ORDER[(r - 1) % RUSH_ORDER.length];
    return [[id, 1 + Math.floor((r - 1) / RUSH_ORDER.length), "rush"]];
  }
  const normals = r <= ROUNDS.length ? ROUNDS[r - 1] : normalBugsFor(r);
  return [...normals, ...bossesFor(r), ...invisiblesFor(r)];
}

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
  const heat = activeWeather.heat ? 1.25 : 1; // Heat Wave: bugs pay more
  const bounty = 1 + perkSum("bugFlies"); // perk tree: bugs pay more
  return Math.max(1, Math.round((BUG_TYPES[tier].reward * heat * bounty) / (1 + (round - 1) * REWARD_DROP)));
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
    name: "Tadpole", cost: 80, damage: 8, range: 170, cooldown: 14, water: true,
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
  chain: 2,         // how many bugs one tongue hits (+1 at Damage tier 2 and tier 4)
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
// ----- 5 more frogs (3 land, 2 water) -----
// Goliath Frog: the biggest frog in the world. Stomps the ground, hitting every bug around it.
TOWERS.goliath = {
  name: "Goliath Frog", cost: 110, damage: 30, range: 70, cooldown: 140,
  colors: ["#6b7a3a", "#56652c", "#434f20"], upgradeCosts: [50, 100, 180, 350],
};
// Leopard Frog: a very fast tongue, and 1 in 4 hits is a critical hit for 2.5x damage.
TOWERS.leopard = {
  name: "Leopard Frog", cost: 85, damage: 7, range: 110, cooldown: 18,
  colors: ["#7cbf4a", "#63a338", "#4d872a"], upgradeCosts: [40, 80, 150, 300],
  crit: { chance: 0.25, mult: 2.5 },
};
// Red-eyed Tree Frog: its startling hit knocks bugs back along the path.
TOWERS.treefrog = {
  name: "Red-eyed Tree Frog", cost: 75, damage: 10, range: 100, cooldown: 45,
  colors: ["#3ccf4e", "#2fb340", "#239433"], upgradeCosts: [35, 70, 130, 280],
  knockback: 30, // pixels (bosses only get pushed a third as far)
};
// African Clawed Frog (WATER): lobs water geysers that splash every bug where they land.
TOWERS.clawedfrog = {
  name: "African Clawed Frog", cost: 120, damage: 35, range: 220, cooldown: 100, water: true,
  colors: ["#8a8f6a", "#757a56", "#5f6444"], upgradeCosts: [55, 110, 200, 380],
  splash: 50, // how wide the geyser splash is
};
// Surinam Toad (WATER): fires water pellets at 3 different bugs at once.
TOWERS.surinam = {
  name: "Surinam Toad", cost: 95, damage: 9, range: 150, cooldown: 40, water: true,
  colors: ["#8a6a48", "#755838", "#5f462a"], upgradeCosts: [45, 90, 160, 320],
  shots: 3,
};

TOWERS.lilypad = { name: "Lily Pad", cost: 40, damage: 0, range: 0, cooldown: 0, isPad: true, isTower: false };

let pads = new Set(); // tiles ("c,r") that have a lily pad

const SHOP_BUTTONS = {
  frog: "shopFrog", tadpole: "shopTadpole", dartfrog: "shopDart", bullfrog: "shopBull", peeper: "shopPeeper",
  lilypad: "shopPad", flyingfrog: "shopFlying", woodfrog: "shopWood", pacman: "shopPacman",
  glassfrog: "shopGlass", tomatofrog: "shopTomato",
  goliath: "shopGoliath", leopard: "shopLeopard", treefrog: "shopTree", clawedfrog: "shopClawed", surinam: "shopSurinam",
};
// Number keys pick from the shop: 1-9 then 0, and - for the last one
const SHOP_KEYS = { 1: "frog", 2: "tadpole", 3: "dartfrog", 4: "bullfrog", 5: "peeper", 6: "lilypad",
  7: "flyingfrog", 8: "woodfrog", 9: "pacman", 0: "glassfrog", "-": "tomatofrog" };

// ---------- Frog classes ----------
// Every frog belongs to a class. Each class has its own buff you level up with Frog Tokens
// in the menu (3 levels). A buff only helps the frogs in its class.
// fx: what ONE level adds (dmg / speed / range = +%, effect = stuns, slows and knockback last/push more)
const CLASSES = {
  sniper: { name: "Sniper", icon: "🎯", color: "#6bc5ff", frogs: ["dartfrog", "clawedfrog"],
    buff: "Steady Aim", per: "+10% damage", fx: { dmg: 0.10 } },
  brawler: { name: "Close Ranger", icon: "👊", color: "#ff7b7b", frogs: ["bullfrog", "pacman", "goliath"],
    buff: "Long Arms", per: "+8% range and +5% damage", fx: { range: 0.08, dmg: 0.05 } },
  rapid: { name: "Rapid Fire", icon: "⚡", color: "#ffb84d", frogs: ["tadpole", "leopard", "surinam"],
    buff: "Quick Tongue", per: "+6% attack speed", fx: { speed: 0.06 } },
  control: { name: "Controller", icon: "🌀", color: "#c09bff", frogs: ["peeper", "woodfrog", "treefrog"],
    buff: "Deep Croak", per: "+15% longer stuns and slows, +15% knockback", fx: { effect: 0.15 } },
  support: { name: "Support", icon: "💚", color: "#7ddc8a", frogs: ["glassfrog", "tomatofrog"],
    buff: "Good Vibes", per: "+10% Glass Frog glow size and +10% Tomato Frog flies", fx: { range: 0.10, dmg: 0.10 } },
  allround: { name: "All-Rounder", icon: "⭐", color: "#ffe066", frogs: ["frog", "flyingfrog"],
    buff: "Jack of All Trades", per: "+4% damage, speed and range", fx: { dmg: 0.04, speed: 0.04, range: 0.04 } },
};
const CLASS_COSTS = [15, 30, 50]; // Frog Tokens for buff level 1, 2, 3
function classOf(type) { return Object.keys(CLASSES).find((k) => CLASSES[k].frogs.includes(type)); }
function classLevel(k) { return (progress && progress.classBuffs && progress.classBuffs[k]) || 0; }
// How much a frog's class buff adds to one stat (0.1 = +10%)
function classFx(type, key) {
  const k = classOf(type);
  return k ? (CLASSES[k].fx[key] || 0) * classLevel(k) : 0;
}
function classTag(type) {
  const k = classOf(type);
  return k ? `<span class="cls-tag" style="color:${CLASSES[k].color};border-color:${CLASSES[k].color}">${CLASSES[k].icon} ${CLASSES[k].name}</span>` : "";
}

// Put each frog's class tag in the shop
for (const [type, id] of Object.entries(SHOP_BUTTONS)) {
  const b = document.getElementById(id) && document.getElementById(id).querySelector("b");
  if (b && classOf(type)) b.insertAdjacentHTML("afterend", " " + classTag(type));
}

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
    // (Frog Power perks: +5% damage, +5% speed, +5% range)
    // (and class buffs: only for frogs in that class)
    damage: base.damage * PATHS[1].mult[f.tiers[1]] * (1 + glass.power) * (1 + perkSum("dmg")) * (1 + classFx(f.type, "dmg")),
    range: base.range * PATHS[2].mult[f.tiers[2]] * weatherRange(f) * (1 + perkSum("range")) * (1 + classFx(f.type, "range")),
    cooldown: Math.max(2, Math.round((base.cooldown * PATHS[0].mult[f.tiers[0]] * frenzy) /
      ((1 + glass.speed) * (1 + perkSum("speed")) * (1 + classFx(f.type, "speed"))))),
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
    const reach = TOWERS.glassfrog.range * PATHS[2].mult[g.tiers[2]] * (1 + classFx("glassfrog", "range"));
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
// (perk tree discounts make frogs and upgrades a bit cheaper, and Pond Market sells for more)
function upgradeCost(f, p) {
  const c = TOWERS[f.type].upgradeCosts[f.tiers[p]];
  return c === undefined ? c : Math.round(c * (1 - perkSum("upgDiscount")));
}
function towerCost(type) { return Math.round(TOWERS[type].cost * (1 - perkSum("frogDiscount"))); }
function sellValue(f) { return Math.floor(f.spent * (0.7 + perkSum("sell"))); }

// Frogs go on grass (or on a lily pad), tadpoles and lily pads go in the pond. Nothing goes on the path.
function canPlace(type, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  const key = c + "," + r;
  if (pathSet.has(key)) return false;
  const wet = inPond(c * TILE + TILE / 2, r * TILE + TILE / 2);
  const pad = hasPad(key);
  if (type === "lilypad") return wet && !pad;
  if (TOWERS[type].water) return wet && !pad;
  return !wet || pad;
}

// Is there a lily pad on this tile? (one you placed, or one that was already in the pond)
function hasPad(key) {
  return pads.has(key) || mapPadTiles.has(key);
}

// Why a tower can't go somewhere (shown as a message)
function placeHint(type) {
  if (TOWERS[type].water) return `${TOWERS[type].name}s can only go in open water!`;
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
  bossrush: { name: "Boss Rush", lives: 50, rounds: Infinity, bossRush: true }, // nothing but bosses!
};
let difficulty = "easy";
let freeplay = false; // true when playing endless rounds (Freeplay, or after winning and keeping going)
let won = false;      // true right after beating the last round (so you can keep going)
function totalRounds() {
  if (challenge) return challenge.target; // a challenge ends when you reach its target round
  return freeplay ? Infinity : DIFFICULTIES[difficulty].rounds;
}

// ---------- Weather ----------
// Pick any mix of these in the menu (challenges choose their own).
const WEATHER = {
  rain:  { name: "Rain",      icon: "🌧️", info: "Bugs move 15% slower. Tadpoles reach 25% farther." },
  fog:   { name: "Fog",       icon: "🌫️", info: "All frogs see 20% less far." },
  heat:  { name: "Heat Wave", icon: "🔥", info: "Bugs move 20% faster, but pay 25% more flies." },
  wind:  { name: "Wind",      icon: "💨", info: "Flying bugs move 35% faster." },
  night: { name: "Night",     icon: "🌙", info: "1 in 10 bugs is invisible! Only a Glass Frog nearby can reveal them." },
};
let weatherChoice = {}; // what's ticked in the menu
let activeWeather = {}; // what's on in the current game

function weatherSpeed(t) {
  let m = 1;
  if (activeWeather.rain) m *= 0.85;
  if (activeWeather.heat) m *= 1.2;
  if (activeWeather.wind && t.flies) m *= 1.35;
  return m;
}
function weatherRange(f) {
  let m = 1;
  if (activeWeather.fog) m *= 0.8;
  if (activeWeather.rain && TOWERS[f.type].water) m *= 1.25; // rain helps all water frogs
  return m;
}
function weatherIcons(w) { return Object.keys(WEATHER).filter((k) => w[k]).map((k) => WEATHER[k].icon).join(""); }

// ---------- Saved progress (tokens, perks, challenges, high scores) ----------
// Stored in the browser, so it's still there next time you open the game.
function loadData(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; }
  catch (e) { return fallback; }
}
function saveData(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked: just don't save */ }
}
// ---------- Accounts ----------
// Sign up / log in with a name and password. Each account has its own tokens, unlocked frogs,
// high scores, challenge and saved game. Accounts are stored in THIS browser only
// (GitHub Pages has no server), so they don't follow you to another computer.
let accounts = loadData("fpd_accounts", {});     // name -> { pass: hashed password }
let currentUser = loadData("fpd_current", null);  // null = playing as a guest
if (currentUser && !accounts[currentUser]) currentUser = null;

// A simple scramble so passwords aren't stored as plain text (this is NOT real security)
function hashPass(name, pass) {
  let h = 5381;
  for (const ch of name.toLowerCase() + ":" + pass) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
// Every account's data lives under its own name
function userKey(key) { return key + "_" + (currentUser || "guest"); }

const NEW_PROGRESS = () => ({ tokens: 0, perks: {}, challengeNum: 0, challenge: null, golden: false, owned: ["frog"], tree: {}, treeV: 2 });
let progress, scores;
function loadProgress() {
  // (guests keep any progress from before accounts existed)
  const old = currentUser ? null : loadData("fpd_progress", null);
  progress = loadData(userKey("fpd_progress"), old || NEW_PROGRESS());
  if (!progress.owned) progress.owned = ["frog"]; // everyone starts with just the basic Frog
  if (!progress.perks) progress.perks = {};
  // stats, achievements, skins and the Bug Book
  progress.stats = Object.assign({ squashed: 0, bosses: 0, games: 0, wins: 0, rounds: 0, damage: 0, bestFrog: 0,
    frames: 0, mostFlies: 0, placed: {} }, progress.stats || {});
  progress.seen = progress.seen || {};
  progress.ach = progress.ach || {};
  progress.skins = progress.skins || {};
  progress.mapWins = progress.mapWins || {};
  progress.flags = progress.flags || {};
  progress.classBuffs = progress.classBuffs || {};
  // The perk tree was rebuilt: refund every token spent on old perks so they can be spent again
  if (progress.treeV !== 2) {
    const OLD = { e1: 10, e2: 15, e3: 25, e4: 40, d1: 10, d2: 15, d3: 30, d4: 40, p1: 15, p2: 20, p3: 25, p4: 40 };
    let refund = 10 * ((progress.perks.flies || 0) + (progress.perks.lives || 0));
    for (const id of Object.keys(progress.tree || {})) refund += OLD[id] || 0;
    progress.tokens += refund;
    progress.tree = progress.golden ? { golden: true } : {};
    progress.perks = {};
    progress.treeV = 2;
  }
  scores = loadData(userKey("fpd_scores"), currentUser ? {} : loadData("fpd_scores", {}));
}
function saveProgress() { saveData(userKey("fpd_progress"), progress); }

// ---------- Perk tree ----------
// It starts from 3 roots and splits into lots of small upgrades. A perk needs ALL the perks
// in its "req" list, so where branches join together you need two perks to get the next one.
// fx: what the perk adds. Every step is small, so even a full tree isn't overpowered.
const PERK_TREE = [
  // --- 3 roots ---
  { id: "f0", name: "Fly Pouch", icon: "🪰", info: "+25 starting flies", cost: 5, fx: { startFlies: 25 } },
  { id: "l0", name: "Lily Pond", icon: "❤️", info: "+5 starting lives", cost: 5, fx: { startLives: 5 } },
  { id: "p0", name: "Strong Legs", icon: "⚡", info: "Frogs deal 3% more damage", cost: 8, fx: { dmg: 0.03 } },
  // --- they split ---
  { id: "f1", name: "Fly Sack", icon: "🪰", info: "+25 starting flies", cost: 8, req: ["f0"], fx: { startFlies: 25 } },
  { id: "golden", name: "Golden Frogs", icon: "✨", info: "Your basic Frogs turn gold! (just for looks)", cost: 20, req: ["f0"], fx: { golden: 1 } },
  { id: "f2", name: "Bug Bounty", icon: "🪰", info: "Bugs pay 4% more flies", cost: 10, req: ["f0"], fx: { bugFlies: 0.04 } },
  { id: "l1", name: "Deep Water", icon: "❤️", info: "+5 starting lives", cost: 8, req: ["l0"], fx: { startLives: 5 } },
  { id: "l2", name: "Round Bonus", icon: "❤️", info: "+8% end-of-round bonus", cost: 10, req: ["l0"], fx: { roundBonus: 0.08 } },
  { id: "p1", name: "Quick Tongue", icon: "⚡", info: "Frogs attack 3% faster", cost: 10, req: ["p0"], fx: { speed: 0.03 } },
  { id: "p2", name: "Keen Eyes", icon: "⚡", info: "Frogs see 3% farther", cost: 10, req: ["p0"], fx: { range: 0.03 } },
  // --- more splits, and the first joins ---
  { id: "f3", name: "Bargain Frogs", icon: "🪰", info: "New frogs cost 4% less", cost: 15, req: ["f1"], fx: { frogDiscount: 0.04 } },
  { id: "f4", name: "Fly Hoard", icon: "🪰", info: "Earn 3% of your flies at the end of each round (up to 25)", cost: 18, req: ["f2"], fx: { interest: 0.03, interestCap: 25 } },
  { id: "m1", name: "Pond Market", icon: "🔗", info: "Sell frogs for 80% instead of 70%", cost: 16, req: ["f2", "l1"], fx: { sell: 0.1 } },
  { id: "l3", name: "Reed Wall", icon: "❤️", info: "+5 starting lives", cost: 12, req: ["l1"], fx: { startLives: 5 } },
  { id: "l4", name: "Harvest Moon", icon: "❤️", info: "+8% end-of-round bonus", cost: 15, req: ["l2"], fx: { roundBonus: 0.08 } },
  { id: "m2", name: "Lily Shield", icon: "🔗", info: "The first bug that gets through each round costs no lives", cost: 25, req: ["l2", "p1"], fx: { leakShield: 1 } },
  { id: "p3", name: "Heavy Tongue", icon: "⚡", info: "Frogs deal 3% more damage", cost: 15, req: ["p1"], fx: { dmg: 0.03 } },
  { id: "p4", name: "Eagle Eyes", icon: "⚡", info: "Frogs see 3% farther", cost: 15, req: ["p2"], fx: { range: 0.03 } },
  // --- deeper ---
  { id: "f5", name: "Cheap Upgrades", icon: "🪰", info: "Upgrades cost 4% less", cost: 22, req: ["f3"], fx: { upgDiscount: 0.04 } },
  { id: "m4", name: "Bulk Discount", icon: "🔗", info: "New frogs cost another 4% less", cost: 24, req: ["f3", "f4"], fx: { frogDiscount: 0.04 } },
  { id: "f6", name: "Big Hoard", icon: "🪰", info: "Fly Hoard can earn up to 50 per round", cost: 25, req: ["f4"], fx: { interestCap: 25 } },
  { id: "l5", name: "Second Chance", icon: "❤️", info: "The first time you would lose, get 10 lives back (once a game)", cost: 25, req: ["l3"], fx: { secondChance: 10 } },
  { id: "l6", name: "Golden Harvest", icon: "❤️", info: "+8% end-of-round bonus", cost: 22, req: ["l4"], fx: { roundBonus: 0.08 } },
  { id: "m3", name: "Super Charge", icon: "🔗", info: "Super attacks recharge 10% faster", cost: 25, req: ["m2", "p3"], fx: { abilityCd: 0.1 } },
  { id: "p5", name: "Sharp Tongues", icon: "⚡", info: "Frogs deal 3% more damage", cost: 22, req: ["p3"], fx: { dmg: 0.03 } },
  { id: "p6", name: "Hawk Eyes", icon: "⚡", info: "Frogs see 3% farther", cost: 22, req: ["p4"], fx: { range: 0.03 } },
  // --- top of the tree ---
  { id: "f7", name: "Fly Tycoon", icon: "🔗", info: "+50 starting flies and bugs pay 4% more", cost: 35, req: ["f5", "f6"], fx: { startFlies: 50, bugFlies: 0.04 } },
  { id: "l7", name: "Second Wind", icon: "❤️", info: "Second Chance gives 20 lives instead of 10", cost: 30, req: ["l5"], fx: { secondChance: 10 } },
  { id: "m5", name: "Pond Spirit", icon: "🔗", info: "Lily Shield blocks 2 bugs per round", cost: 35, req: ["l6", "m3"], fx: { leakShield: 1 } },
  { id: "p7", name: "Frenzy Training", icon: "⚡", info: "Frogs attack 4% faster", cost: 30, req: ["p5"], fx: { speed: 0.04 } },
  { id: "p8", name: "Master Hunter", icon: "🔗", info: "Frogs deal 4% more damage and see 4% farther", cost: 35, req: ["p5", "p6"], fx: { dmg: 0.04, range: 0.04 } },
  // --- capstones: each needs two big perks ---
  { id: "c1", name: "Frog Kingdom", icon: "👑", info: "New frogs cost 5% less and bugs pay 5% more", cost: 50, req: ["f7", "m5"], fx: { frogDiscount: 0.05, bugFlies: 0.05 } },
  { id: "c2", name: "Legendary Pond", icon: "👑", info: "+10 starting lives and super attacks recharge 15% faster", cost: 50, req: ["l7", "p8"], fx: { startLives: 10, abilityCd: 0.15 } },
];
function perk(id) { return !!(progress.tree && progress.tree[id]); }
// Adds up one kind of bonus from every perk you own
function perkSum(key) {
  let total = 0;
  for (const p of PERK_TREE) if (perk(p.id) && p.fx[key]) total += p.fx[key];
  return total;
}
loadProgress();


// ---------- Frog Collection ----------
// Unlock frogs with Frog Tokens. The basic Frog is free.
const UNLOCK_COST = {
  frog: 0, lilypad: 10, tadpole: 15, peeper: 20, bullfrog: 25, woodfrog: 30,
  flyingfrog: 35, dartfrog: 40, glassfrog: 40, tomatofrog: 45, pacman: 60,
  treefrog: 30, leopard: 35, goliath: 45, surinam: 45, clawedfrog: 55,
};
function owns(type) { return progress.owned.includes(type); }

// Tokens for every round you clear in a normal game (Freeplay rounds count too)
const TOKEN_RATE = { easy: 1, medium: 1.5, hard: 2, freeplay: 1.5, bossrush: 2 };
function fmtTokens(t) { return Number.isInteger(t) ? String(t) : t.toFixed(1); }
let challenge = null;                     // the challenge being played right now (or null)

// ---------- Game state ----------
let money = 120;
let lives = DIFFICULTIES[difficulty].lives;
let startLives = lives; // lives at the start of the game (challenges can count how many you lose)
// ---------- 2-player co-op ----------
// Player 1 uses the mouse, Player 2 uses the keyboard. Each has their own flies; lives are shared.
let coop = false;        // is this a 2-player game?
let coopChoice = false;  // the 2 Players switch in the menu
let money2 = 0;          // Player 2's flies
// Online co-op (see ONLINE CO-OP near the end). role: null, "host" or "guest"
var net = { role: null, peer: null, conn: null, code: null, partner: null, status: "", cancelled: false };
const p2 = { c: 10, r: 6, type: "frog" }; // Player 2's cursor and chosen frog
function walletOf(owner) { return owner === 2 ? money2 : money; }
function pay(owner, n) { if (owner === 2) money2 -= n; else money -= n; }
// Flies coming in: to one player, or (no owner) split between both players in co-op
function earn(n, owner) {
  if (owner === 2) money2 += n;
  else if (owner === 1 || !coop) money += n;
  else { money += Math.ceil(n / 2); money2 += Math.floor(n / 2); }
}
let secondChanceUsed = false; // Second Chance perk: used up this game?
let leakedThisGame = false;   // did any bug get through this game? (for the "perfect game" achievement)
let leakShieldUsed = 0;       // Lily Shield perks: bugs blocked so far this round
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
  const mode = (challenge ? `Challenge #${challenge.num}` : DIFFICULTIES[difficulty].name) +
    (freeplay && difficulty !== "freeplay" ? " + Freeplay" : "");
  const sky = weatherIcons(activeWeather);
  $("round").textContent = (isFinite(total) ? `${round} / ${total} (${mode})` : `${round} (${mode})`) + (sky ? " " + sky : "");
  $("lives").textContent = lives;
  $("money").textContent = net.role ? `You ${net.role === "guest" ? money2 : money} · ${partnerName()} ${net.role === "guest" ? money : money2}`
    : coop ? `P1 ${money} · P2 ${money2}` : money;
  if ($("p2Help").style) $("p2Help").style.display = coop && !net.role ? "block" : "none";
  startBtn.disabled = roundActive || (gameOver && !won);
  startBtn.textContent = won ? "Keep going in Freeplay ▶" : `Start Round ${round + 1}` +
    (autoStart && !roundActive && !gameOver ? ` (auto in ${Math.ceil(autoTimer / 60)}s)` : "");
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
  autoTimer = AUTO_DELAY; // the auto-start countdown begins fresh after every round
  leakShieldUsed = 0;
  round++;
  roundActive = true;
  spawnQueue = [];
  const groups = getRound(round);
  const normals = groups.filter(([t, , when]) => !BUG_TYPES[t].boss && !when); // bosses and sneaky bugs are placed below
  if (round <= 10) {
    // Early rounds send bugs group by group
    for (const [tier, count] of normals) {
      for (let i = 0; i < count; i++) spawnQueue.push(tier);
    }
  } else {
    // Later rounds mix the small bugs together
    const left = normals.map(([t, n]) => [t, n]);
    while (left.some(([, n]) => n > 0)) {
      for (const g of left) if (g[1] > 0) { spawnQueue.push(g[0]); g[1]--; }
    }
  }
  // Common bosses are spread through the middle of the round; debuting bosses come at the end
  const mid = [], end = [];
  for (const [t, n, when] of groups) {
    if (!BUG_TYPES[t].boss && !when) continue;
    for (let i = 0; i < n; i++) (when === "mid" ? mid : end).push(t);
  }
  mid.forEach((t, i) => {
    const pos = Math.floor(((i + 1) / (mid.length + 1)) * spawnQueue.length);
    spawnQueue.splice(pos, 0, t);
  });
  spawnQueue.push(...end);
  // The ultra boss leads the way, so its tunnel can open while bugs are still coming
  const ultras = spawnQueue.filter((t) => BUG_TYPES[t].ultra);
  spawnQueue = [...ultras, ...spawnQueue.filter((t) => !BUG_TYPES[t].ultra)];
  tunnel = null;
  spawnTimer = 0;
  const debut = groups.filter(([t, , when]) => BUG_TYPES[t].boss && when === "end");
  const anyBoss = groups.some(([t]) => BUG_TYPES[t].boss);
  const sneaky = groups.filter(([t, , when]) => BUG_TYPES[t].invisible && when === "end");
  if (debut.length) showBossPopup(debut.map(([t]) => t));
  showMsg(debut.length ? `⚠️ NEW BOSS: watch out for ${bossList(debut)}!`
    : sneaky.length ? `👻 Something INVISIBLE is coming at the end of this round... you will need a Glass Frog to see it!`
    : anyBoss ? `Bosses this round: ${bossList(groups)}` : "");
  updateUI();
};

// ---------- Sound effects ----------
// Every sound is made on the spot by the browser (no sound files needed).
let audio = null;
let muted = !!loadData("fpd_mute", false);
const lastSound = {}; // so the same sound doesn't play 100 times at once
function sfx(name) {
  if (muted || typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return;
  const now = performance.now();
  const gap = { hit: 90, splash: 110, squash: 70 }[name] || 0;
  if (lastSound[name] && now - lastSound[name] < gap) return;
  lastSound[name] = now;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    // tone(frequency, end frequency, length, wave, volume, delay)
    const tone = (f1, f2, len, wave = "square", vol = 0.06, delay = 0) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(f1, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + delay + len);
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + len);
      o.connect(g).connect(audio.destination);
      o.start(t + delay);
      o.stop(t + delay + len + 0.02);
    };
    switch (name) {
      case "hit": tone(260, 160, 0.07, "triangle", 0.05); break;               // tongue slap
      case "splash": tone(900, 300, 0.09, "sine", 0.04); break;                // water drop
      case "squash": tone(200, 60, 0.08, "square", 0.035); break;              // bug squashed
      case "place": tone(180, 120, 0.12, "square", 0.06); tone(240, 160, 0.12, "square", 0.05, 0.1); break; // ribbit!
      case "upgrade": tone(440, 660, 0.1, "triangle", 0.07); tone(660, 990, 0.12, "triangle", 0.07, 0.09); break;
      case "ability": tone(300, 1200, 0.35, "sawtooth", 0.06); break;
      case "leak": tone(300, 120, 0.25, "square", 0.07); break;                 // a bug got through
      case "coin": tone(880, 880, 0.07, "square", 0.05); tone(1320, 1320, 0.12, "square", 0.05, 0.07); break;
      case "boss": for (let i = 0; i < 3; i++) tone(520, 380, 0.22, "sawtooth", 0.07, i * 0.25); break;
      case "win": [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, "triangle", 0.08, i * 0.15)); break;
      case "lose": [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.98, 0.25, "triangle", 0.08, i * 0.22)); break;
      case "achieve": [659, 880, 1175].forEach((f, i) => tone(f, f, 0.14, "sine", 0.08, i * 0.1)); break;
    }
  } catch (e) { /* sound not available: play silently */ }
}
function toggleMute() {
  muted = !muted;
  saveData("fpd_mute", muted);
  const b = $("muteBtn");
  if (b) b.textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
}

// ---------- New boss pop-up ----------
// Shown across the map only on the round a boss appears for the very first time.
const BOSS_TIPS = {
  4: "Super tanky and slow.",
  13: "A long, tough centipede.",
  14: "A huge moth that flies and cuts corners.",
  22: "When you squash her, she splits into 6 fast Spiderlings!",
  5: "Fast, and it flies across corners.",
  15: "The strongest flying boss.",
  21: "Armored: it blocks 30% of all damage.",
  16: "ULTRA BOSS! At half health it digs a tunnel...",
};
let bossPopupTimer = null;
function showBossPopup(ids) {
  sfx("boss");
  const box = $("bossPopup");
  if (!box || !box.querySelector) return;
  box.querySelector(".bp-name").textContent = ids.map((t) => BUG_TYPES[t].name).join(" + ");
  box.querySelector(".bp-tip").textContent = ids.map((t) => BOSS_TIPS[t] || "").join(" ");
  box.className = "show";
  clearTimeout(bossPopupTimer);
  bossPopupTimer = setTimeout(() => { box.className = ""; }, 3500);
}

// Asks before throwing away a game that's in progress
// Some browsers (like the in-app browser) block pop-up "Are you sure?" boxes,
// so the game draws its own Yes / No box instead.
function askConfirm(question, onYes) {
  const box = $("confirmBox");
  if (!box || !box.querySelector) { onYes(); return; } // (no page to draw on: just do it)
  box.querySelector(".cf-q").textContent = question;
  box.style.display = "flex";
  box.querySelector(".cf-yes").onclick = () => { box.style.display = "none"; onYes(); };
  box.querySelector(".cf-no").onclick = () => { box.style.display = "none"; };
}
// Only asks when there's a game in progress that would be lost
function askIfPlaying(question, action) {
  if (round > 0 && !gameOver) askConfirm(question, action);
  else action();
}

// Restart: start a fresh game on the same map
function restartGame() {
  askIfPlaying("Restart the game from round 1?", resetGame);
}

function resetGame() {
  // Frog Token perks give you a head start
  // Perk tree head starts
  money = 120 + perkSum("startFlies") + (isBossRush() ? 280 : 0); // Boss Rush starts you with extra flies
  money2 = money; // (Player 2 gets the same in co-op)
  p2.c = 10; p2.r = 6;
  lives = DIFFICULTIES[difficulty].lives + perkSum("startLives");
  secondChanceUsed = false;
  leakedThisGame = false;
  startLives = lives;
  spawnCount = 0;
  freeplay = difficulty === "freeplay" && !challenge;
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

// Opening/closing the menu: the page hides the game screen while the menu is up
function setMenuOpen(open) {
  inMenu = open;
  menuEl.style.display = open ? "flex" : "none";
  if (document.body && document.body.classList) document.body.classList.toggle("in-menu", open);
  if (!open && typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
}
function showMenu() {
  setMenuOpen(true);
  closePanel();
  renderMenuExtras(); // refresh high scores, the challenge, tokens and the Continue button
}
// ch: a challenge to play (or nothing for a normal game)
function startMap(i, ch) {
  coop = coopChoice && !ch; // challenges are 1-player
  progress.stats.games++;
  challenge = ch || null;
  if (challenge) difficulty = challenge.difficulty;
  activeWeather = challenge ? { ...challenge.weather } : { ...weatherChoice };
  loadMap(typeof i === "object" ? i : MAPS[i]); // (a custom map is passed as the map itself)
  resetGame();
  updateShopLocks();
  setMenuOpen(false);
  if (challenge) showMsg(`🏅 Challenge #${challenge.num}: ${challengeText(challenge)}`);
}
$("menuBtn").onclick = () => askIfPlaying("Leave this game and go back to the menu? (Your last finished round is saved.)", showMenu);

// Difficulty buttons in the menu
function toggleCoop() {
  coopChoice = !coopChoice;
  $("coopBtn").textContent = `👥 2 Players: ${coopChoice ? "ON" : "Off"}`;
  $("coopBtn").className = coopChoice ? "on" : "";
}
$("coopBtn").onclick = toggleCoop;
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
      <span class="map-desc">${m.desc}</span>
      <span class="map-best" id="best-${i}"></span>`;
    card.onclick = () => startMap(i);
    list.appendChild(card);
    drawMapThumb(m, card.querySelector("canvas"));
  });
  loadMap(MAPS[0]);
}

// Speed goes 1x, 2x, 3x, 5x
const SPEEDS = [1, 2, 3, 5];
let paused = false;
function togglePause() {
  paused = !paused;
  $("pauseBtn").textContent = paused ? "▶ Resume" : "⏸ Pause";
}
$("pauseBtn").onclick = togglePause;
$("muteBtn").onclick = toggleMute;
$("muteBtn").textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
speedBtn.onclick = () => {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  speedBtn.textContent = `Speed: ${speed}x`;
};

// ---------- Shop ----------
let lastLandFrog = "frog"; // the last frog picked that can sit on a lily pad
function selectTower(type) {
  if (!owns(type)) {
    return showMsg(`🔒 ${TOWERS[type].name} is locked. Unlock it in the menu (Frog Collection) for ${UNLOCK_COST[type]} Frog Tokens.`);
  }
  if (challenge && challenge.allowed && !challenge.allowed.includes(type) && type !== "lilypad") {
    return showMsg(`🚫 ${TOWERS[type].name}s aren't allowed in this challenge.`);
  }
  selected = type;
  if (type !== "lilypad" && !TOWERS[type].water) lastLandFrog = type;
  closePanel();
  for (const [t, id] of Object.entries(SHOP_BUTTONS)) {
    $(id).className = "shopItem" + (t === type ? " selected" : "") + (isLocked(t) ? " locked" : "");
  }
  const name = TOWERS[type].name.toLowerCase();
  showMsg(TOWERS[type].water ? `Click the pond to place a ${name}` : `Click the grass to place a ${name}`);
}
for (const [t, id] of Object.entries(SHOP_BUTTONS)) $(id).onclick = () => selectTower(t);
// Player 2: W A S D move · Z / X pick frog · F place · R T Y upgrade · E super attack · H sell
function p2Frog() { return frogs.find((f) => f.c === p2.c && f.r === p2.r); }
function p2Say(t) { showMsg((net.role ? "" : "🎮 P2: ") + t); }
function p2Key(k) {
  const f = p2Frog();
  if (k === "w") p2.r = Math.max(0, p2.r - 1);
  else if (k === "s") p2.r = Math.min(ROWS - 1, p2.r + 1);
  else if (k === "a") p2.c = Math.max(0, p2.c - 1);
  else if (k === "d") p2.c = Math.min(COLS - 1, p2.c + 1);
  else if (k === "z" || k === "x") {
    const list = Object.keys(SHOP_BUTTONS).filter(owns);
    const i = list.indexOf(p2.type);
    p2.type = list[(i + (k === "x" ? 1 : list.length - 1)) % list.length];
    p2Say(`picked ${TOWERS[p2.type].name} (${towerCost(p2.type)} flies)`);
  } else if (k === "f") {
    const t = p2.type, cost = towerCost(t);
    if (f) return p2Say("there's already a frog there");
    if (!canPlace(t, p2.c, p2.r)) return p2Say(placeHint(t));
    if (money2 < cost) return p2Say(`not enough flies (${TOWERS[t].name} costs ${cost})`);
    money2 -= cost;
    sfx("place");
    if (TOWERS[t].isTower === false) pads.add(p2.c + "," + p2.r);
    else frogs.push({ type: t, c: p2.c, r: p2.r, x: p2.c * TILE + TILE / 2, y: p2.r * TILE + TILE / 2, owner: 2,
      tiers: [0, 0, 0], spent: cost, cooldown: 0, angle: 0, tongue: null, abilityCd: 0, frenzy: 0 });
    p2Say(`placed a ${TOWERS[t].name}`);
  } else if ("rty".includes(k)) {
    if (!f || f.owner !== 2) return p2Say("move onto one of your frogs to upgrade it");
    const p = "rty".indexOf(k);
    if (upgradeBlocked(f, p)) return p2Say(upgradeBlocked(f, p));
    if (money2 < upgradeCost(f, p)) return p2Say(`that upgrade costs ${upgradeCost(f, p)}`);
    buyUpgrade(f, p);
    p2Say(`upgraded ${pathInfo(f, p).name} to tier ${f.tiers[p]}`);
  } else if (k === "e") {
    if (!f || f.owner !== 2 || !abilityOf(f)) return p2Say("move onto your tier 4 frog to use its super attack");
    useAbility(f);
  } else if (k === "h") {
    if (!f || f.owner !== 2) return p2Say("move onto one of your frogs to sell it");
    if (picked === f) closePanel();
    earn(sellValue(f), 2);
    frogs = frogs.filter((x) => x !== f);
    p2Say("sold a frog");
  } else return false;
  updateUI();
  return true;
}
document.addEventListener("keydown", (e) => {
  // In co-op, Player 2's keys come first (so A moves P2 instead of toggling auto start)
  if (coop && !net.role && !inMenu && !e.repeat && p2Key(e.key.toLowerCase())) { e.preventDefault(); return; }
  if (coop && !net.role && !inMenu && /^[wasdzxfrtyeh]$/i.test(e.key)) return;
  if (SHOP_KEYS[e.key]) selectTower(SHOP_KEYS[e.key]);
  if (e.key === "Escape") closePanel();
  if (e.key === "q" || e.key === "Q") useAllAbilities();
  if (e.key === "a" || e.key === "A") toggleAutoStart();
  if (e.key === "p" || e.key === "P") togglePause();
  if (e.key === "m" || e.key === "M") toggleMute();
});

// ---------- Auto start ----------
// When on, the next round starts by itself a few seconds after the last one ends.
// (It never starts Freeplay for you after a win: you choose that yourself.)
const AUTO_DELAY = 150; // frames to wait between rounds (2.5 seconds at 1x speed)
let autoStart = false;
let autoTimer = AUTO_DELAY;

function toggleAutoStart() {
  autoStart = !autoStart;
  autoTimer = AUTO_DELAY;
  $("autoBtn").textContent = `Auto start: ${autoStart ? "ON" : "Off"}`;
  $("autoBtn").style.background = autoStart ? "#2e7d32" : "#3a523c";
  updateUI();
}
$("autoBtn").onclick = toggleAutoStart;

// Called every frame while waiting between rounds
function autoStartTick() {
  if (!autoStart || roundActive || gameOver || inMenu) return;
  autoTimer--;
  if (autoTimer % 30 === 0) updateUI(); // refresh the countdown on the button
  if (autoTimer <= 0) {
    autoTimer = AUTO_DELAY;
    startBtn.onclick();
  }
}

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
    fill.style.width = `${100 - (f.abilityCd / (f.abilityMax || ABILITY_COOLDOWN)) * 100}%`;
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
  towerPanel.className = f.x > canvas.width / 2 ? "left" : ""; // pop up on the other side from the frog

  let html = `<div class="tp-head"><b>${TOWERS[f.type].name} ${classTag(f.type)}</b><button class="tp-close" title="Close">✕</button></div>
    <div class="tp-stats"></div>
    <div class="tp-dealt"></div>`;
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
  if (!NO_TARGETING.includes(f.type)) html += `<button class="tp-target" title="Click to change which bug this frog attacks">🎯 Target: ${TARGET_MODES[targetMode(f)]} ▸</button>`;
  html += `<button class="tp-sell"></button>`;
  towerPanel.innerHTML = html;

  panelRefs = {
    stats: towerPanel.querySelector(".tp-stats"),
    dealt: towerPanel.querySelector(".tp-dealt"),
    buys: [...towerPanel.querySelectorAll(".tp-buy")],
    ability: towerPanel.querySelector(".tp-ability"),
    sell: towerPanel.querySelector(".tp-sell"),
  };
  towerPanel.querySelector(".tp-close").onclick = closePanel;
  panelRefs.buys.forEach((b, i) => (b.onclick = () => buyUpgrade(f, i)));
  if (panelRefs.ability) panelRefs.ability.onclick = () => useAbility(f);
  panelRefs.sell.onclick = () => sellTower(f);
  const tb = towerPanel.querySelector(".tp-target");
  if (tb) tb.onclick = () => cycleTargeting(f);
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
  if (panelRefs.dealt) {
    panelRefs.dealt.textContent = TOWERS[f.type].support ? "" : `💥 Damage dealt this game: ${bigNum(f.dealt || 0)}`;
  }
  panelRefs.buys.forEach((b, i) => { b.disabled = !!upgradeBlocked(f, i) || walletOf(f.owner) < upgradeCost(f, i); });
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
  if (net.role === "guest") { sfx("upgrade"); return netSend({ a: "up", c: f.c, r: f.r, p }); }
  sfx("upgrade");
  if (upgradeBlocked(f, p)) return;
  const cost = upgradeCost(f, p);
  if (walletOf(f.owner) < cost) return showMsg(`That upgrade costs ${cost}`);
  pay(f.owner, cost);
  f.spent += cost;
  f.tiers[p]++;
  const a = abilityOf(f);
  showMsg(f.tiers[p] === 4 && a ? `${a.name} unlocked! Use it from this menu or the Abilities bar.` : `${pathInfo(f, p).name} upgraded!`);
  buildPanel();
  updateUI();
}

function sellTower(f) {
  if (net.role === "guest") { netSend({ a: "sell", c: f.c, r: f.r }); return closePanel(); }
  earn(sellValue(f), f.owner || 1);
  frogs = frogs.filter((x) => x !== f);
  closePanel();
  updateUI();
}

// All damage goes through here, so armor (and the ultra boss's stage change) always applies
// The frog whose attack is happening right now (so its "damage dealt" stat can go up)
let attacker = null;
function bigNum(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : String(Math.round(n)); }
function hurt(b, dmg) {
  // count only the damage that actually landed (not overkill)
  if (attacker && b.hp > 0) {
    const real = Math.min(b.hp, dmg * (b.armor ? 1 - b.armor : 1));
    attacker.dealt = (attacker.dealt || 0) + real;
    progress.stats.damage += real;
  }
  if (b.armor) dmg *= 1 - b.armor;
  b.hp -= dmg;
  if (BUG_TYPES[b.tier].ultra && !b.stage2 && b.hp > 0 && b.hp <= b.maxHp / 2) digTunnel(b);
}

// Ultra boss stage 2: it digs a tunnel right where it stands
function digTunnel(b) {
  b.stage2 = true;
  b.armor = ULTRA.armor;
  tunnel = { x: b.x, y: b.y, wp: b.wp, flowTimer: ULTRA.flowEvery, rhinoTimer: ULTRA.rhinoEvery,
    route: routes.find((r) => r.points === b.route) || routes[0] };
  showMsg(`🕳️ The ${BUG_TYPES[b.tier].name} dug a tunnel! Beetles are pouring out, and it's tougher now!`);
  effects.push({ kind: "ring", x: b.x, y: b.y, from: 10, to: 90, color: "#8b5a2b", life: 40, max: 40 });
}

// ---------- Super attacks (tier 4 abilities) ----------
function bugsInRange(f, range) {
  // A bug counts as in range when any part of its body is inside the range circle
  // (invisible bugs can't be targeted unless a Glass Frog is revealing them)
  return bugs.filter((b) => b.hp > 0 && !b.escaped && canSee(b) && Math.hypot(b.x - f.x, b.y - f.y) - BUG_TYPES[b.tier].size <= range);
}

// ---------- Targeting ----------
// Click a frog to choose which bug it goes after.
const TARGET_MODES = { first: "First", last: "Last", strong: "Strongest", close: "Closest" };
const TARGET_ORDER = ["first", "last", "strong", "close"];
// Frogs that hit everything around them (or don't attack) don't need a target setting
const NO_TARGETING = ["glassfrog", "tomatofrog", "peeper", "woodfrog", "goliath", "pacman"];
function targetMode(f) { return f.targeting || (f.type === "dartfrog" ? "strong" : "first"); }
// How far along the path a bug is (bigger = closer to the goal)
function progressOf(b) {
  const next = (b.route || waypoints)[b.wp] || b;
  return b.wp * 10000 - Math.hypot(next.x - b.x, next.y - b.y);
}
function targetScore(f, b) {
  switch (targetMode(f)) {
    case "last": return -progressOf(b);
    case "strong": return b.hp;
    case "close": return -Math.hypot(b.x - f.x, b.y - f.y);
    default: return progressOf(b); // "first": the bug closest to the goal
  }
}
function pickTarget(f, list) { return list.reduce((a, b) => (targetScore(f, b) > targetScore(f, a) ? b : a)); }
function sortByTarget(f, list) { return [...list].sort((a, b) => targetScore(f, b) - targetScore(f, a)); }
function cycleTargeting(f) {
  if (net.role === "guest") return netSend({ a: "tgt", c: f.c, r: f.r });
  const i = TARGET_ORDER.indexOf(targetMode(f));
  f.targeting = TARGET_ORDER[(i + 1) % TARGET_ORDER.length];
  buildPanel();
}

// Helpers the super attacks are built from
function toughest(list) { return list.reduce((a, b) => (b.hp > a.hp ? b : a)); }
function ring(x, y, to, color, life = 30) { effects.push({ kind: "ring", x, y, from: 8, to, color, life, max: life }); }
function beam(f, b, color) { effects.push({ kind: "beam", x: f.x, y: f.y, x2: b.x, y2: b.y, color, life: 25, max: 25 }); }
function stun(b, frames) { if (!BUG_TYPES[b.tier].stunImmune) b.stun = Math.max(b.stun || 0, frames); }
function poison(b, total, frames) { b.poisonDmg = Math.max(b.poisonDmg || 0, total / frames); b.poisonTime = frames; b.poisonSrc = attacker; }
function isBoss(b) { return !!BUG_TYPES[b.tier].boss; }

// Push a bug backwards along the path (bugs flying straight can't be pushed)
function pushBack(b, px) {
  if (!routes.some((r) => r.points === b.route)) return;
  while (px > 0 && b.wp > 0) {
    if (b.route[b.wp].tp) break; // can't be pushed back through a portal
    const prev = b.route[b.wp - 1];
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
            if (hit.has(b) || b.hp <= 0 || b.escaped || !canSee(b)) continue;
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
  goliath: [
    { name: "Rumble", info: "4x stomp speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Earthquake", info: "A giant stomp: 8x damage to every bug in a big area", reach: 2,
      run(f, s, t) { for (const b of t) hurt(b, s.damage * 8); ring(f.x, f.y, s.range * 2, "#8a6a3d", 45); } },
    { name: "Boulder Toss", info: "Throws a boulder at the toughest bug for 25x damage and stuns it 2 seconds", reach: 3,
      run(f, s, t) { const b = toughest(t); hurt(b, s.damage * 25); stun(b, 120); beam(f, b, "#8a6a3d"); ring(b.x, b.y, 40, "#8a6a3d"); } },
  ],
  leopard: [
    { name: "Pounce Frenzy", info: "5x attack speed for 5 seconds", frenzy: [0.2, 300] },
    { name: "Perfect Strike", info: "Every hit is a critical hit for 8 seconds", frenzy: [1, 480] },
    { name: "Spotted Flurry", info: "Lashes every bug in range for 6x critical damage",
      run(f, s, t) { for (const b of t) hurt(b, s.damage * 6 * TOWERS.leopard.crit.mult); ring(f.x, f.y, s.range, "#7cbf4a", 35); } },
  ],
  treefrog: [
    { name: "Startle Spree", info: "4x attack speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Big Scare", info: "Knocks every bug in range far back along the path", reach: 1.5,
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 3); pushBack(b, isBoss(b) ? 50 : 150); } ring(f.x, f.y, s.range * 1.5, "#e0403a", 40); } },
    { name: "Red Eye Glare", info: "Freezes every bug in a huge area with fear for 2 seconds", reach: 2.5,
      run(f, s, t) { for (const b of t) stun(b, 120); ring(f.x, f.y, s.range * 2.5, "#e0403a", 45); } },
  ],
  clawedfrog: [
    { name: "Geyser Storm", info: "4x geyser speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Mega Geyser", info: "One huge geyser on the toughest bug: 20x splash damage",
      run(f, s, t) { const b = toughest(t); for (const x of bugs) if (canSee(x) && Math.hypot(x.x - b.x, x.y - b.y) < 90) hurt(x, s.damage * 20); ring(b.x, b.y, 90, "#6bc5ff", 40); } },
    { name: "Flood", info: "Every bug in range is washed back and takes 4x damage", reach: 1.2,
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 4); pushBack(b, isBoss(b) ? 40 : 90); } ring(f.x, f.y, s.range * 1.2, "#6bc5ff", 45); } },
  ],
  surinam: [
    { name: "Pellet Rain", info: "4x attack speed for 5 seconds", frenzy: [0.25, 300] },
    { name: "Toadlet Swarm", info: "Fires a pellet at EVERY bug in range for 10x damage",
      run(f, s, t) { for (const b of t) { hurt(b, s.damage * 10); ring(b.x, b.y, 14, "#aee3ff", 15); } } },
    { name: "Bubble Trap", info: "Traps every bug in range in a bubble: they move 70% slower for 4 seconds", reach: 1.3,
      run(f, s, t) { for (const b of t) { b.slow = 240; b.slowAmt = 0.7; } ring(f.x, f.y, s.range * 1.3, "#aee3ff", 45); } },
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
  if (net.role === "guest") return netSend({ a: "ab", c: f.c, r: f.r });
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
    attacker = f;
    a.run(f, s, targets);
    attacker = null;
  }
  sfx("ability");
  f.abilityCd = f.abilityMax = Math.round(ABILITY_COOLDOWN * (1 - perkSum("abilityCd"))); // Super Charge perks
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

  // Clicking a tower opens its upgrade menu (in co-op, only your own frogs)
  const me = net.role === "guest" ? 2 : 1;
  if (existing && coop && (existing.owner || 1) !== me) {
    return showMsg(net.role ? `That's ${partnerName()}'s frog.` : "That's Player 2's frog. Player 2 upgrades it with R / T / Y.");
  }
  if (existing) return openPanel(existing);
  // Clicking somewhere else while the menu is open just closes it
  if (picked) return closePanel();

  const tower = TOWERS[selected];
  if (!canPlace(selected, c, r)) {
    if ((selected === "lilypad" || TOWERS[selected].water) && hasPad(c + "," + r)) {
      return showMsg("That's a lily pad! Pick a land frog in the shop, then click the lily pad to put it there.");
    }
    return showMsg(placeHint(selected));
  }
  const cost = towerCost(selected);
  // Online guest: ask the host to place it
  if (net.role === "guest") {
    if (money2 < cost) return showMsg(`A ${tower.name.toLowerCase()} costs ${cost}`);
    netSend({ a: "place", type: selected, c, r });
    sfx("place");
    progress.stats.placed[selected] = (progress.stats.placed[selected] || 0) + 1;
    if (tower.isTower === false) selectTower(lastLandFrog);
    return;
  }
  if (money < cost) return showMsg(`A ${tower.name.toLowerCase()} costs ${cost}`);
  money -= cost;
  sfx("place");
  progress.stats.placed[selected] = (progress.stats.placed[selected] || 0) + 1;
  if (tower.isTower === false) {
    // Lily pads aren't towers: they just make a spot in the pond for land frogs
    pads.add(c + "," + r);
    // Switch back to the last land frog picked, so the next click on the pad puts it there
    selectTower(lastLandFrog);
    showMsg(`Lily pad placed! Click it to put a ${TOWERS[lastLandFrog].name} on it (or pick a different frog).`);
    return updateUI();
  }
  frogs.push({
    type: selected, c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, owner: 1,
    tiers: [0, 0, 0], spent: cost, cooldown: 0, angle: 0, tongue: null, abilityCd: 0, frenzy: 0,
  });
  showMsg("");
  updateUI();
});

// ---------- Game logic ----------
function spawnBug(tier) {
  const t = BUG_TYPES[tier];
  const scale = hpScale(hpRound()); // bugs get tougher each round
  // Maps with several entrances send bugs from each one in turn
  const from = tunnel ? tunnel.route : routes[spawnCount++ % routes.length];
  // Flyers on some maps skip the path and fly straight at the goal
  const straight = t.flies && currentMap.flyStraight;
  const route = straight ? [from.points.at(-1)] : from.points;
  // Normally bugs start at the entrance. Once the ultra boss digs its tunnel, they come out of it.
  const start = tunnel
    ? { x: tunnel.x, y: tunnel.y, wp: straight ? 0 : tunnel.wp }
    : { x: from.entrance.x, y: from.entrance.y, wp: 0 };
  bugs.push({
    tier, x: start.x, y: start.y, route,
    wp: start.wp, hp: t.hp * scale, maxHp: t.hp * scale,
    speed: t.speed, wobble: Math.random() * 10, angle: 0,
    // Invisible bugs (and, at Night, 1 in 10 regular bugs) need a Glass Frog to be seen
    invisible: !!t.invisible || (!!activeWeather.night && !t.boss && Math.random() < 0.1),
    armor: t.armor || 0, // armored bugs (Pill Bug, Hercules Beetle) take less damage
  });
  progress.seen[tier] = true; // for the Bug Book
  if (t.ultra) showMsg(`💀 ULTRA BOSS: the ${t.name} is here! Get it to half health and watch out...`);
}

// Makes a bug right at a spot on a route (used when a Wolf Spider splits)
function makeBug(tier, x, y, route, wp) {
  const t = BUG_TYPES[tier];
  const scale = hpScale(hpRound());
  return { tier, x, y, route, wp, hp: t.hp * scale, maxHp: t.hp * scale, speed: t.speed,
    wobble: Math.random() * 10, angle: 0, invisible: false, armor: t.armor || 0 };
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
    } else {
      if (--tunnel.flowTimer <= 0) {
        spawnBug(ULTRA.flowBugs[Math.floor(Math.random() * ULTRA.flowBugs.length)]);
        tunnel.flowTimer = ULTRA.flowEvery;
      }
      if (--tunnel.rhinoTimer <= 0) {
        spawnBug(12); // Rhino Beetle
        tunnel.rhinoTimer = ULTRA.rhinoEvery;
      }
    }
  }

  // Move bugs along their route (the path, or a straight line for some flyers)
  for (const b of bugs) {
    // Stunned bugs can't move
    if (b.stun > 0) { b.stun--; continue; }
    // Wood Frog frost slows bugs down for a while
    let spd = b.speed * weatherSpeed(BUG_TYPES[b.tier]);
    if (b.slow > 0) { b.slow--; spd *= 1 - b.slowAmt; }
    // Log bridges are slippery
    if (currentMap.slippery && !BUG_TYPES[b.tier].flies &&
        bridgeSet.has(Math.floor(b.x / TILE) + "," + Math.floor(b.y / TILE))) spd *= 1 - currentMap.slippery;
    const route = b.route || waypoints;
    const target = route[b.wp];
    const dx = target.x - b.x, dy = target.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) b.angle = Math.atan2(dy, dx);
    // Flying bosses cut corners: they turn toward the next corner early (but not into a portal)
    const cut = BUG_TYPES[b.tier].cornerCut || 0;
    if (cut && dist < cut && b.wp < route.length - 1 && !route[b.wp + 1].tp) {
      b.wp++;
    } else if (dist < spd) {
      b.x = target.x; b.y = target.y;
      b.wp++;
      // Walked into a mushroom ring: pop out of its twin!
      if (route[b.wp] && route[b.wp].tp) {
        effects.push({ kind: "ring", x: b.x, y: b.y, from: 4, to: 24, color: "#d9a6ff", life: 18, max: 18 });
        b.x = route[b.wp].x; b.y = route[b.wp].y;
        b.wp++;
        effects.push({ kind: "ring", x: b.x, y: b.y, from: 24, to: 4, color: "#d9a6ff", life: 18, max: 18 });
      }
      if (b.wp >= route.length) {
        b.escaped = true;
        sfx("leak");
        if (leakShieldUsed < perkSum("leakShield")) {
          // Lily Shield perks: the first bug(s) through each round are blocked
          leakShieldUsed++;
          effects.push({ kind: "text", text: "🛡️ Lily Shield!", x: b.x, y: b.y - 20, color: "#9be59f", life: 60, max: 60 });
        } else { lives -= BUG_TYPES[b.tier].lifeCost; leakedThisGame = true; }
      }
    } else {
      b.x += (dx / dist) * spd;
      b.y += (dy / dist) * spd;
    }
    b.wobble += 0.3;
  }

  // Glass Frogs reveal invisible bugs near them
  updateReveals();

  // Frogs attack with their tongues, tadpoles shoot water
  for (const f of frogs) {
    attacker = f; // any damage below counts toward this frog's "damage dealt"
    if (f.abilityCd > 0) f.abilityCd--;
    if (f.frenzy > 0) f.frenzy--;
    if (f.tongue) { f.tongue.life--; if (f.tongue.life <= 0) f.tongue = null; }
    if (f.croak > 0) f.croak--;
    if (f.stinky > 0) { f.stinky--; continue; } // coughing in a stink cloud: can't attack
    if (f.cooldown > 0) { f.cooldown--; continue; }

    // Glass Frog doesn't attack: its boost is worked out in towerStats
    if (f.type === "glassfrog") continue;

    // Tomato Frog: makes flies every few seconds
    if (f.type === "tomatofrog") {
      const stats = towerStats(f);
      const flies = Math.round(stats.damage);
      earn(flies, f.owner || 1);
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
          b.slow = Math.round(TOWERS.woodfrog.slowFrames * (1 + classFx("woodfrog", "effect")));
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
        let cur = pickTarget(f, inRange);
        f.angle = Math.atan2(cur.y - f.y, cur.x - f.x);
        f.tongue = { x: cur.x, y: cur.y, life: 8 };
        const hit = new Set();
        const chainLen = TOWERS.flyingfrog.chain + Math.floor(f.tiers[1] / 2);
        for (let i = 0; i < chainLen && cur; i++) {
          hurt(cur, stats.damage);
          hit.add(cur);
          // find the closest bug that hasn't been hit yet
          let next = null, nd = TOWERS.flyingfrog.chainReach;
          for (const b of bugs) {
            if (hit.has(b) || b.hp <= 0 || b.escaped || !canSee(b)) continue;
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

    // Goliath Frog: stomp hits every bug in range
    if (f.type === "goliath") {
      const stats = towerStats(f);
      const hit = bugsInRange(f, stats.range);
      if (hit.length) {
        for (const b of hit) hurt(b, stats.damage);
        f.cooldown = stats.cooldown;
        f.croak = 14;
        effects.push({ kind: "ring", x: f.x, y: f.y, from: 10, to: stats.range, color: "#8a6a3d", life: 18, max: 18 });
      }
      continue;
    }

    // Surinam Toad: water pellets at up to 3 different bugs
    if (f.type === "surinam") {
      const stats = towerStats(f);
      const targets = sortByTarget(f, bugsInRange(f, stats.range)).slice(0, TOWERS.surinam.shots);
      if (targets.length) {
        for (const b of targets) shots.push({ kind: "water", x: f.x, y: f.y, target: b, damage: stats.damage, speed: 11, src: f });
        f.angle = Math.atan2(targets[0].y - f.y, targets[0].x - f.x);
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
          if (!BUG_TYPES[b.tier].stunImmune) b.stun = Math.max(b.stun || 0, Math.round(STUN_FRAMES * (1 + classFx("peeper", "effect"))));
        }
        f.cooldown = stats.cooldown;
        f.croak = 14;
        effects.push({ kind: "ring", x: f.x, y: f.y, from: 8, to: stats.range, color: "#ffe9a8", life: 18, max: 18 });
      }
      continue;
    }

    const stats = towerStats(f);
    // Each frog picks its target by its targeting setting (First, Last, Strongest or Closest)
    const inReach = bugsInRange(f, stats.range);
    let best = inReach.length ? pickTarget(f, inReach) : null;
    if (best) {
      f.angle = Math.atan2(best.y - f.y, best.x - f.x);
      f.cooldown = stats.cooldown;
      const startX = f.x + Math.cos(f.angle) * 10, startY = f.y + Math.sin(f.angle) * 10;
      if (f.type === "tadpole") {
        shots.push({ kind: "water", x: startX, y: startY, target: best, damage: stats.damage, speed: 10, src: f });
      } else if (f.type === "dartfrog") {
        shots.push({ kind: "dart", x: startX, y: startY, target: best, damage: stats.damage, speed: 18, angle: f.angle, src: f });
      } else if (f.type === "clawedfrog") {
        // a slow, arcing water geyser that splashes where it lands
        shots.push({ kind: "geyser", x: startX, y: startY, target: best, damage: stats.damage, speed: 7, src: f, sx: startX, sy: startY });
      } else {
        let dmg = stats.damage;
        // Leopard Frog: critical hits (Perfect Strike makes every hit a crit)
        if (f.type === "leopard") {
          const c = TOWERS.leopard.crit;
          const allCrit = f.frenzy > 0 && f.frenzyMult === 1;
          if (allCrit || Math.random() < c.chance) {
            dmg *= c.mult;
            effects.push({ kind: "text", text: "CRIT!", x: best.x, y: best.y - 16, color: "#ffe066", life: 25, max: 25 });
          }
        }
        hurt(best, dmg);
        // Red-eyed Tree Frog: startles the bug backwards
        if (f.type === "treefrog") pushBack(best, (isBoss(best) ? TOWERS.treefrog.knockback / 3 : TOWERS.treefrog.knockback) * (1 + classFx("treefrog", "effect")));
        f.tongue = { x: best.x, y: best.y, life: 8 };
        sfx("hit");
        if (f.type === "bullfrog") {
          // Big slap with SPLASH: every other bug near the one it hits takes half damage
          const sp = TOWERS.bullfrog.splash;
          for (const b of bugs) {
            if (b !== best && b.hp > 0 && !b.escaped && canSee(b) && Math.hypot(b.x - best.x, b.y - best.y) <= sp.radius) {
              hurt(b, stats.damage * sp.share);
            }
          }
          effects.push({ kind: "ring", x: best.x, y: best.y, from: 6, to: sp.radius, color: "#e8d36a", life: 14, max: 14 });
        }
      }
    }
  }

  attacker = null;

  // Poisoned bugs keep taking damage
  for (const b of bugs) {
    if (b.poisonTime > 0) {
      attacker = b.poisonSrc || null;
      hurt(b, b.poisonDmg);
      attacker = null;
      b.poisonTime--;
      if (b.poisonTime === 0) b.poisonDmg = 0;
    }
  }

  // Move water drops and darts toward their bug (each one remembers which frog shot it)
  for (const s of shots) {
    const b = s.target;
    if (b.hp <= 0 || b.escaped) { s.done = true; continue; }
    const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy);
    if (d < s.speed) {
      attacker = s.src || null;
      sfx("splash");
      if (s.kind === "geyser") {
        // splash: every bug near the landing spot gets hit
        for (const x of bugs) if (x !== b && x.hp > 0 && canSee(x) && Math.hypot(x.x - b.x, x.y - b.y) <= TOWERS.clawedfrog.splash) hurt(x, s.damage);
        effects.push({ kind: "ring", x: b.x, y: b.y, from: 6, to: TOWERS.clawedfrog.splash, color: "#6bc5ff", life: 16, max: 16 });
      }
      hurt(b, s.damage);
      s.done = true;
      if (s.kind === "dart") {
        // Poison: keep the stronger poison if the bug is already poisoned
        const perFrame = (s.damage * POISON.share) / POISON.frames;
        b.poisonDmg = Math.max(b.poisonDmg || 0, perFrame);
        b.poisonSrc = s.src || null;
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
  const hatched = [];
  bugs = bugs.filter((b) => {
    if (b.hp <= 0) {
      const sp = BUG_TYPES[b.tier].splits;
      if (sp) {
        // Wolf Spider: her babies scatter and keep going along the same path
        for (let i = 0; i < sp.count; i++) {
          const kid = makeBug(sp.into, b.x + (Math.random() - 0.5) * 30, b.y + (Math.random() - 0.5) * 30, b.route, b.wp);
          kid.stun = i * 6; // they scramble off one after another
          hatched.push(kid);
        }
        effects.push({ kind: "ring", x: b.x, y: b.y, from: 6, to: 40, color: "#c9a27a", life: 25, max: 25 });
        showMsg("🕷️ The Wolf Spider split into Spiderlings!");
      }
      if (BUG_TYPES[b.tier].stink) {
        // Stink cloud: frogs close by can't attack for a moment
        for (const f of frogs) if (Math.hypot(f.x - b.x, f.y - b.y) < 70) f.stinky = BUG_TYPES[b.tier].stink;
        effects.push({ kind: "ring", x: b.x, y: b.y, from: 10, to: 70, color: "#9acd32", life: 30, max: 30 });
      }
      sfx("squash");
      progress.stats.squashed++;
      if (BUG_TYPES[b.tier].boss) progress.stats.bosses++;
      if (BUG_TYPES[b.tier].ultra) progress.flags.ultra = true;
      const reward = rewardFor(b.tier);
      earn(reward);
      if (BUG_TYPES[b.tier].boss && !BUG_TYPES[b.tier].splits) showMsg(`🎉 ${BUG_TYPES[b.tier].name} defeated! +${reward}`);
      return false;
    }
    return !b.escaped;
  });

  // Challenges can limit how many lives you're allowed to lose
  let leakFail = false;
  if (challenge && challenge.maxLeaks !== null && !gameOver && startLives - lives > challenge.maxLeaks) { lives = 0; leakFail = true; }

  // Second Chance perk: the first time you would lose, you get 10 lives back
  if (lives <= 0 && !gameOver && !leakFail && perkSum("secondChance") > 0 && !secondChanceUsed) {
    secondChanceUsed = true;
    lives = perkSum("secondChance");
    showMsg(`💚 Second Chance! You got ${lives} lives back. Don't waste them!`);
  }

  bugs.push(...hatched);

  // Lose check
  if (lives <= 0) {
    lives = 0;
    gameOver = true;
    roundActive = false;
    recordScore(round - 1, false);
    sfx("lose");
    saveProgress();
    submitScore(round - 1);
    clearSave();
    if (challenge) showMsg("💀 Challenge failed! Press Restart to try it again (the challenge stays the same).");
    else showMsg(freeplay ? `💀 Game over! You survived to round ${round}. Press Restart to try again.` : "💀 The bugs reached the pond. Game over! Press Restart to try again.");
  }

  // Round complete check
  if (roundActive && spawnQueue.length === 0 && bugs.length === 0) {
    roundActive = false;
    shots = [];
    const roundBonus = Math.round((25 + round * 5) * (1 + perkSum("roundBonus"))); // perk tree: bigger bonus
    earn(roundBonus); // end-of-round bonus
    // Fly Hoard perks: earn a little "interest" on the flies you saved (each player on their own flies)
    for (const owner of coop ? [1, 2] : [1]) {
      const hoard = Math.min(perkSum("interestCap"), Math.floor(walletOf(owner) * perkSum("interest")));
      if (hoard > 0) earn(hoard, owner);
    }
    // Tomato Frog Harvest: bonus flies at the end of the round
    for (const f of frogs) {
      const bonus = f.type === "tomatofrog" ? HARVEST[f.tiers[2]] : 0;
      if (bonus) {
        earn(bonus, f.owner || 1);
        effects.push({ kind: "text", text: `+${bonus} harvest!`, x: f.x, y: f.y - 20, color: "#ff9a6b", life: 60, max: 60 });
      }
    }
    const finished = round >= totalRounds();
    recordScore(round, finished && !challenge);
    // stats for the Stats page
    const st = progress.stats;
    st.rounds++;
    st.mostFlies = Math.max(st.mostFlies, money);
    for (const f of frogs) st.bestFrog = Math.max(st.bestFrog, f.dealt || 0);
    if (finished) {
      st.wins++;
      progress.mapWins[currentMap.name] = true;
      if (!challenge) progress.flags["win_" + difficulty] = true;
      if (!leakedThisGame) progress.flags.perfect = true;
      if (coop) progress.flags.coopWin = true;
      if (!challenge) submitScore(round);
    }
    if (isBossRush() && round >= 10) progress.flags.rush10 = true;
    if (freeplay && round >= 60) progress.flags.free60 = true;
    checkAchievements();
    saveProgress();
    if (finished && challenge) {
      gameOver = true;
      winChallenge();
      sfx("win");
    } else if (finished) {
      gameOver = true;
      won = true;
      sfx("win");
      clearSave();
      showMsg(`🏆 You beat ${DIFFICULTIES[difficulty].name}! The frogs are safe! Keep going in Freeplay to see how far you can get.` + roundTokens());
    } else {
      saveGame(); // the game saves itself after every round
      sfx("coin");
      showMsg(`Round ${round} cleared! +${roundBonus} bonus · game saved` + roundTokens());
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
    for (const route of routes) {
      ctx.beginPath();
      ctx.moveTo(route.entrance.x, route.entrance.y);
      for (const w of route.points) {
        if (w.tp) ctx.moveTo(w.x, w.y); // portal jump: no path in between
        else ctx.lineTo(w.x, w.y);
      }
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1;

  // The pond(s): dark edges first, then the water
  for (const [color, grow] of [["#2b6f9e", 6], ["#3b8fd6", 0]]) {
    ctx.fillStyle = color;
    for (const P of PONDS) {
      ctx.beginPath();
      ctx.ellipse(P.x, P.y, P.rx + grow, P.ry + grow, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ripples
  const t = performance.now() / 1000;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  for (const P of PONDS) {
    const k = Math.min(1, P.rx / 130);
    for (let i = 0; i < 3; i++) {
      const grow = (t * 0.4 + i / 3) % 1;
      ctx.globalAlpha = 1 - grow;
      ctx.beginPath();
      ctx.ellipse(P.x + 40 * k, P.y - 20 * k, (10 + grow * 40) * k, (5 + grow * 20) * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  // Log bridge across the pond
  if (currentMap.slippery) for (const key of bridgeSet) drawBridgeTile(key);

  // Mushroom portal rings
  for (const p of portals) {
    drawPortal(p.from.c * TILE + TILE / 2, p.from.r * TILE + TILE / 2, p.color);
    drawPortal(p.to.c * TILE + TILE / 2, p.to.r * TILE + TILE / 2, p.color);
  }

  if (currentMap.goal === "home") for (const p of routeEnds()) drawHome(p);

  // Exits: red arrows pointing off the map where the bugs escape
  if (currentMap.goal === "exit") {
    const done = new Set();
    for (const route of routes) {
      const end = route.points.at(-1), prev = route.points.at(-2);
      const key = end.x + "," + end.y;
      if (done.has(key)) continue;
      done.add(key);
      // put the arrow just inside the edge of the map
      const ax = Math.max(14, Math.min(canvas.width - 14, end.x)), ay = Math.max(14, Math.min(canvas.height - 14, end.y));
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(end.y - prev.y, end.x - prev.x));
      ctx.fillStyle = "#ff6b6b";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("➜", 0, 7);
      ctx.restore();
    }
  }

  // Arrows showing where the bugs come in
  // (each points the way the bugs walk in, from whichever side of the map they enter)
  ctx.fillStyle = "#ffffff";
  for (const route of routes) {
    const p0 = route.points[0], e = route.entrance;
    ctx.save();
    ctx.translate(p0.x + (e.x - p0.x) * 0.3, p0.y + (e.y - p0.y) * 0.3);
    ctx.rotate(Math.atan2(p0.y - e.y, p0.x - e.x));
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("➜", 0, 6);
    ctx.restore();
  }

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

// One tile of the wooden log bridge (planks run across the way bugs walk)
function drawBridgeTile(key) {
  const [c, r] = key.split(",").map(Number);
  const x = c * TILE, y = r * TILE;
  const across = pathSet.has(c - 1 + "," + r) || pathSet.has(c + 1 + "," + r); // path goes left-right
  ctx.fillStyle = "#8a5a2b";
  if (across) ctx.fillRect(x, y + 3, TILE, TILE - 6);
  else ctx.fillRect(x + 3, y, TILE - 6, TILE);
  ctx.strokeStyle = "#5e3c1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    if (across) { ctx.moveTo(x + i * 10, y + 3); ctx.lineTo(x + i * 10, y + TILE - 3); }
    else { ctx.moveTo(x + 3, y + i * 10); ctx.lineTo(x + TILE - 3, y + i * 10); }
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

// A glowing ring of little mushrooms (portals come in matching colors)
function drawPortal(x, y, color) {
  const t = performance.now() / 400;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2);
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 7; i++) {
    const a = t * 0.3 + (i / 7) * Math.PI * 2;
    const mx = x + Math.cos(a) * 16, my = y + Math.sin(a) * 16;
    ctx.fillStyle = "#f3e5c8";
    ctx.fillRect(mx - 1.5, my - 1, 3, 5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my - 1, 4, Math.PI, 0);
    ctx.fill();
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
  // In co-op, Player 2's frogs get a little blue "2"
  if (coop && f.owner === 2) {
    ctx.fillStyle = "#4fb3ff";
    ctx.beginPath(); ctx.arc(f.x + 13, f.y - 13, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("2", f.x + 13, f.y - 10);
  }
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
  // Golden Frogs (a Frog Token reward) turn the basic Frog gold
  if (f.type === "frog" && progress.golden) return ["#f2c94c", "#e0a92a", "#c48a12"][Math.min(2, Math.floor(total / 3))];
  return TOWERS[f.type].colors[Math.min(2, Math.floor(total / 3))];
}

// ---------- Frog skins ----------
// Little hats and things your frogs wear. Unlock them with achievements or Frog Tokens.
const SKINS = {
  partyhat: { name: "Party Hat", cost: 25 },
  sunglasses: { name: "Sunglasses", cost: 30 },
  bowtie: { name: "Bow Tie", cost: 25 },
  tophat: { name: "Top Hat", cost: 40 },
  flower: { name: "Flower", cost: 15 },
  crown: { name: "Crown", cost: 0, achievement: true },
  halo: { name: "Halo", cost: 0, achievement: true },
  wizard: { name: "Wizard Hat", cost: 0, achievement: true },
  hardhat: { name: "Hard Hat", cost: 0, achievement: true },
};
function drawSkin(f) {
  const id = f.skinPreview || progress.skin;
  if (!id || id === "none") return;
  const x = f.x, y = f.y;
  ctx.save();
  switch (id) {
    case "partyhat":
      ctx.fillStyle = "#e84a8f";
      ctx.beginPath(); ctx.moveTo(x - 7, y - 10); ctx.lineTo(x + 7, y - 10); ctx.lineTo(x, y - 27); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(x, y - 27, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6bc5ff"; ctx.fillRect(x - 4, y - 17, 3, 3); ctx.fillRect(x + 1, y - 22, 3, 3);
      break;
    case "sunglasses":
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.ellipse(x - 6, y - 4, 5, 3.5, 0, 0, Math.PI * 2); ctx.ellipse(x + 6, y - 4, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 2, y - 5, 4, 2);
      break;
    case "bowtie":
      ctx.fillStyle = "#d63b3b";
      ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.lineTo(x - 8, y + 5); ctx.lineTo(x - 8, y + 13); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.lineTo(x + 8, y + 5); ctx.lineTo(x + 8, y + 13); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + 9, 2.5, 0, Math.PI * 2); ctx.fill();
      break;
    case "tophat":
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(x - 10, y - 12, 20, 3); ctx.fillRect(x - 6, y - 26, 12, 14);
      ctx.fillStyle = "#d63b3b"; ctx.fillRect(x - 6, y - 15, 12, 3);
      break;
    case "flower":
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = "#f6a5c0";
        ctx.beginPath(); ctx.arc(x + 9 + Math.cos(a) * 4, y - 12 + Math.sin(a) * 4, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(x + 9, y - 12, 2.5, 0, Math.PI * 2); ctx.fill();
      break;
    case "crown":
      ctx.fillStyle = "#f2c94c";
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 11); ctx.lineTo(x - 9, y - 21); ctx.lineTo(x - 4, y - 15); ctx.lineTo(x, y - 23);
      ctx.lineTo(x + 4, y - 15); ctx.lineTo(x + 9, y - 21); ctx.lineTo(x + 9, y - 11); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d63b3b"; ctx.beginPath(); ctx.arc(x, y - 15, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case "halo":
      ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y - 20, 10, 4, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case "wizard":
      ctx.fillStyle = "#5b3fa0";
      ctx.beginPath(); ctx.moveTo(x - 11, y - 10); ctx.lineTo(x + 11, y - 10); ctx.lineTo(x + 3, y - 32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe066"; ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.fillText("★", x + 1, y - 15);
      break;
    case "hardhat":
      ctx.fillStyle = "#f2b01e";
      ctx.beginPath(); ctx.arc(x, y - 10, 10, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - 13, y - 11, 26, 3);
      break;
  }
  ctx.restore();
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
    drawSkin(f);
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
  const goli = f.type === "goliath";

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
  const bodyW = bull ? 18 : peep ? 12 : pac ? 19 : tomato ? 16 : goli ? 21 : f.type === "surinam" ? 17 : 15;
  const bodyH = bull ? 16 : peep ? 10 : pac ? 18 : tomato ? 16 : goli ? 19 : f.type === "surinam" ? 15 : 13;
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
  if (goli) {
    // big warty bumps
    ctx.fillStyle = "rgba(40,50,20,0.45)";
    for (const [sx, sy, sr] of [[-10, -7, 3], [-12, 6, 3.5], [-3, 10, 2.5], [-2, -11, 2.5], [-15, 0, 2.5]]) {
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (f.type === "leopard") {
    // dark round leopard spots with light rims
    for (const [sx, sy] of [[-7, -6], [-2, 6], [-10, 4], [1, -4]]) {
      ctx.fillStyle = "#c9e7a8"; ctx.beginPath(); ctx.arc(sx, sy, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2f4a1a"; ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (f.type === "treefrog") {
    // blue-and-yellow striped sides and orange feet
    ctx.fillStyle = "#3a6fd8";
    ctx.fillRect(-8, -12, 10, 3); ctx.fillRect(-8, 9, 10, 3);
    ctx.fillStyle = "#ff8c1a";
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(-10, side * 13, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  if (f.type === "clawedfrog") {
    // flat water frog with little claws reaching forward
    ctx.strokeStyle = "#3a3d28"; ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(10, side * 6); ctx.lineTo(18, side * 9); ctx.lineTo(20, side * 6); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
  if (f.type === "surinam") {
    // flat square-ish toad: baby toads ride in little pockets on its back!
    ctx.fillStyle = "rgba(255,230,180,0.45)";
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-8 + (i % 3) * 5, -4 + Math.floor(i / 3) * 8, 1.8, 0, Math.PI * 2); ctx.fill(); }
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
    ctx.fillStyle = f.type === "treefrog" ? "#e0403a" : bull || f.type === "woodfrog" ? "#e0b030" : "white";
    ctx.beginPath();
    ctx.arc(eyeX, side * eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(eyeX + eyeR * 0.4, side * eyeY, eyeR * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawSkin(f);
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

// Boss: Hercules Beetle, a huge beetle with olive wing cases and a giant horn
function drawHercules(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.scale(1.4, 1.4);
  // legs
  ctx.strokeStyle = "#1a120c";
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    const wig = Math.sin(b.wobble * 0.6 + i * 2) * 4;
    ctx.beginPath();
    ctx.moveTo(i * 8, 0); ctx.lineTo(i * 8 + wig, -22);
    ctx.moveTo(i * 8, 0); ctx.lineTo(i * 8 - wig, 22);
    ctx.stroke();
  }
  // olive-khaki wing cases with dark spots
  ctx.fillStyle = "#a89a5a";
  ctx.beginPath();
  ctx.ellipse(-6, 0, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(40,30,15,0.5)";
  for (const [sx, sy] of [[-12, -6], [-4, 7], [-14, 5], [-2, -8]]) { ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = "#5a4e2a";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(10, 0); ctx.stroke();
  // shiny black head and the two big horns
  ctx.fillStyle = b.tier === 21 ? "#1c1610" : "#1c1610";
  ctx.beginPath();
  ctx.ellipse(14, 0, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1c1610";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(16, -3); ctx.quadraticCurveTo(34, -6, 40, 2); ctx.stroke(); // top horn
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(18, 3); ctx.quadraticCurveTo(28, 6, 32, 2); ctx.stroke();  // bottom horn
  ctx.lineWidth = 1;
  ctx.restore();
  drawBossHealth(b, 40);
}

// Boss: a big hairy wolf spider carrying her babies on her back
function drawWolfSpider(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.scale(1.3, 1.3);
  // 8 legs, 4 on each side, scuttling
  ctx.strokeStyle = "#3d2b1c";
  ctx.lineWidth = 2.5;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const wig = Math.sin(b.wobble * 0.9 + i * 1.5) * 3;
      const bx = 8 - i * 5;
      ctx.beginPath();
      ctx.moveTo(bx, side * 4);
      ctx.lineTo(bx + 4 + wig, side * 15);
      ctx.lineTo(bx + (i < 2 ? 10 : -6) + wig, side * 22);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1;
  // big back body with stripes, and the head
  ctx.fillStyle = "#6b5038";
  ctx.beginPath(); ctx.ellipse(-9, 0, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a3624";
  ctx.beginPath(); ctx.ellipse(8, 0, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#c9a27a";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(13, 0); ctx.stroke();
  ctx.lineWidth = 1;
  // babies riding on her back
  ctx.fillStyle = "#a07a55";
  for (const [sx, sy] of [[-14, -5], [-8, 4], [-4, -4], [-15, 3], [-10, -1]]) { ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill(); }
  // shiny eyes
  ctx.fillStyle = "#111";
  for (const [ex, ey] of [[12, -2.5], [12, 2.5], [10, -4.5], [10, 4.5]]) { ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  drawBossHealth(b, 34);
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
  if (b.tier === 21) return drawHercules(b);
  if (b.tier === 22) return drawWolfSpider(b);

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
    case "glasswing": {
      // Glasswing butterfly: see-through wings with dark orange-brown edges
      const flap = 0.6 + Math.abs(Math.sin(b.wobble * 0.7)) * 0.4;
      for (const side of [-1, 1]) {
        ctx.fillStyle = "rgba(230,245,255,0.35)";
        ctx.strokeStyle = "#7a3b12";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x + side * 9 * flap, y - 3, 9 * flap, 7, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + side * 7 * flap, y + 7, 6 * flap, 5, side * -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(x, y, 2.5, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "stink": {
      // shield-shaped stink bug
      drawLegs(b, s - 2, "#3d4520", 3, 6);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s * 0.6);
      ctx.lineTo(x + s, y - s * 0.6);
      ctx.lineTo(x + s * 0.7, y + s * 0.3);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s * 0.7, y + s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e8d36a";
      ctx.beginPath(); ctx.arc(x, y - 2, 2.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "spiderling": {
      // tiny spider: 8 thin legs and a round body
      ctx.strokeStyle = "#3d2b1c";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const wig = Math.sin(b.wobble + i) * 2;
          ctx.beginPath();
          ctx.moveTo(x, y + (i - 1.5) * 2.5);
          ctx.lineTo(x + side * 9, y + (i - 1.5) * 4 + wig);
          ctx.stroke();
        }
      }
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "pill": {
      // grey roly-poly with shell bands
      drawLegs(b, s - 3, "#3a3f46", 4, 4);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.85, s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4b525b";
      ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.8, y + i * 4);
        ctx.lineTo(x + s * 0.8, y + i * 4);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      break;
    }
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
  for (const b of bugs) {
    // Invisible bugs are just a faint shimmer, unless a Glass Frog is revealing them
    if (b.invisible) ctx.globalAlpha = b.revealed ? 0.75 : 0.12;
    drawBug(b);
    if (b.invisible && b.revealed) {
      ctx.strokeStyle = "#c9a8ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BUG_TYPES[b.tier].size + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.globalAlpha = 1;
  }
  for (const b of bugs) if (b.poisonTime > 0) drawPoison(b);
  for (const b of bugs) if (b.stun > 0) drawStun(b);
  for (const b of bugs) if (b.slow > 0) drawFrost(b);
  for (const f of frogs) drawFrog(f);
  // green stink fumes over frogs that are stuck coughing
  for (const f of frogs) {
    if (!(f.stinky > 0)) continue;
    const t = performance.now() / 250;
    ctx.fillStyle = "rgba(154,205,50,0.45)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(t + i * 2) * 10, f.y - 14 - ((t * 6 + i * 5) % 12), 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Water drops and poison darts
  for (const s of shots) {
    if (s.kind === "geyser") {
      // arcs up and down between the frog and the bug
      const total = Math.hypot(s.target.x - s.sx, s.target.y - s.sy) || 1;
      const left = Math.hypot(s.target.x - s.x, s.target.y - s.y);
      const lift = Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - left / total))) * 30;
      ctx.fillStyle = "#6bc5ff";
      ctx.strokeStyle = "#1e6fb8";
      ctx.beginPath();
      ctx.arc(s.x, s.y - lift, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }
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
  drawWeather();
  if (coop && !net.role && !inMenu) {
    // Player 2's cursor
    const x = p2.c * TILE, y = p2.r * TILE;
    ctx.strokeStyle = "#4fb3ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(20,40,70,0.85)";
    const label = `P2: ${TOWERS[p2.type].name} (${towerCost(p2.type)})`;
    ctx.font = "bold 11px sans-serif";
    const w = ctx.measureText ? ctx.measureText(label).width + 10 : 120;
    const lx = Math.min(canvas.width - w - 2, Math.max(2, x + TILE / 2 - w / 2)), ly = y > 24 ? y - 18 : y + TILE + 2;
    ctx.fillRect(lx, ly, w, 16);
    ctx.fillStyle = "#cfe9ff";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 5, ly + 12);
  }
  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⏸ PAUSED", canvas.width / 2, canvas.height / 2);
    ctx.font = "16px sans-serif";
    ctx.fillText("Press P or the Resume button to keep playing", canvas.width / 2, canvas.height / 2 + 30);
  }
}

// Draw the little pictures on the shop buttons
function drawShopIcon(canvasOrId, type) {
  const icon = typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
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
for (const [id, type] of [["iconGoliath", "goliath"], ["iconLeopard", "leopard"], ["iconTree", "treefrog"], ["iconClawed", "clawedfrog"], ["iconSurinam", "surinam"]]) drawShopIcon(id, type);

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
// =====================================================================
// SAVE GAME, HIGH SCORES, CHALLENGES, FROG TOKENS and the WEATHER picker
// =====================================================================

// ---------- Save game ----------
// The game saves itself after every round (one save slot). Continue it from the menu.
function saveGame() {
  saveData(userKey("fpd_save"), {
    map: MAPS.indexOf(currentMap), mapObj: currentMap.custom ? currentMap : null, difficulty, freeplay, round, money, lives, startLives,
    weather: activeWeather, challenge,
    frogs: frogs.map((f) => ({ type: f.type, c: f.c, r: f.r, tiers: f.tiers, spent: f.spent, dealt: f.dealt || 0, targeting: f.targeting, owner: f.owner })),
    coop, money2,
    pads: [...pads],
  });
}
function clearSave() { try { localStorage.removeItem(userKey("fpd_save")); } catch (e) { /* ignore */ } }
function loadGame() {
  const s = loadData(userKey("fpd_save"), null);
  if (!s) return;
  difficulty = s.difficulty;
  pickDifficulty(difficulty);
  challenge = s.challenge || null;
  activeWeather = s.weather || {};
  loadMap(s.mapObj || MAPS[s.map]);
  resetGame();
  freeplay = s.freeplay;
  round = s.round;
  money = s.money;
  lives = s.lives;
  startLives = s.startLives;
  coop = !!s.coop;
  money2 = s.money2 || 0;
  pads = new Set(s.pads);
  frogs = s.frogs.map((f) => ({
    ...f, x: f.c * TILE + TILE / 2, y: f.r * TILE + TILE / 2,
    cooldown: 0, angle: 0, tongue: null, abilityCd: 0, frenzy: 0,
  }));
  updateShopLocks();
  setMenuOpen(false);
  showMsg(`Welcome back! Continuing ${currentMap.name} from round ${round}.`);
  updateUI();
}

// ---------- High scores ----------
// Best round cleared on every map + difficulty (Freeplay rounds after a win count too).
function recordScore(roundsCleared, beat) {
  if (challenge) return; // challenges don't count for high scores
  const key = (currentMap.custom ? "c-" + currentMap.id : MAPS.indexOf(currentMap)) + "-" + difficulty;
  const s = scores[key] || { best: 0, won: false };
  s.best = Math.max(s.best, roundsCleared);
  s.won = s.won || beat;
  scores[key] = s;
  saveData(userKey("fpd_scores"), scores);
}
function scoreLine(mapIndex) {
  const parts = [];
  for (const [key, d] of Object.entries(DIFFICULTIES)) {
    const s = scores[mapIndex + "-" + key];
    if (s && s.best > 0) parts.push(`${d.name} ${s.won ? "✔ " : ""}${s.best}`);
  }
  return parts.length ? "🏆 Best: " + parts.join(" · ") : "🏆 No high score yet";
}

// ---------- Challenges ----------
// Beat a challenge to earn Frog Tokens. A new (a bit harder) one appears as soon as you beat it.
const ATTACKERS = ["frog", "tadpole", "dartfrog", "bullfrog", "peeper", "flyingfrog", "woodfrog", "pacman",
  "goliath", "leopard", "treefrog", "clawedfrog", "surinam"];
const SUPPORT = ["glassfrog", "tomatofrog"];
function shuffle(list) { return list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v); }

function newChallenge() {
  const num = progress.challengeNum + 1;
  const ch = {
    num,
    map: Math.floor(Math.random() * MAPS.length),
    difficulty: num < 4 ? "easy" : Math.random() < 0.5 ? "easy" : "medium",
    target: Math.min(35, 8 + num * 2 + Math.floor(Math.random() * 4)),
    allowed: null, weather: {}, maxLeaks: null,
  };
  const rules = shuffle(["towers", "weather", "leaks"]).slice(0, num < 3 ? 1 : 2);
  if (rules.includes("towers")) {
    // Always include the basic Frog so there's something to build on grass
    // Only frogs you own (always including the basic Frog)
    ch.allowed = ["frog", ...shuffle(ATTACKERS.filter((t) => t !== "frog" && owns(t))).slice(0, 2),
      ...shuffle(SUPPORT.filter(owns)).slice(0, 1)];
    if (ch.allowed.length === 1) ch.allowed = null; // only the Frog is owned: no tower rule
  }
  if (rules.includes("weather")) {
    for (const w of shuffle(Object.keys(WEATHER)).slice(0, 1 + (num > 5 ? 1 : 0))) ch.weather[w] = true;
  }
  if (rules.includes("leaks")) ch.maxLeaks = Math.max(5, 25 - num * 2);
  ch.reward = 5 + Math.round(ch.target / 2) + rules.length * 4 + (ch.difficulty === "medium" ? 5 : 0);
  return ch;
}
function challengeText(ch) {
  const parts = [`Survive to round ${ch.target} on ${MAPS[ch.map].name} (${DIFFICULTIES[ch.difficulty].name})`];
  if (ch.allowed) parts.push("using only " + ch.allowed.map((t) => TOWERS[t].name + "s").join(", "));
  const w = Object.keys(ch.weather).filter((k) => ch.weather[k]);
  if (w.length) parts.push("in " + w.map((k) => WEATHER[k].icon + " " + WEATHER[k].name).join(" + "));
  if (ch.maxLeaks !== null) parts.push(`losing no more than ${ch.maxLeaks} lives`);
  return parts.join(", ") + ".";
}
function ensureChallenge() {
  if (!progress.challenge) {
    progress.challenge = newChallenge();
    saveProgress();
  }
}
ensureChallenge();
function winChallenge() {
  progress.tokens += challenge.reward;
  progress.challengeNum = challenge.num;
  progress.challenge = newChallenge();
  saveProgress();
  clearSave();
  showMsg(`🏅 Challenge #${challenge.num} complete! +${challenge.reward} Frog Tokens (you have ${fmtTokens(progress.tokens)}). A new challenge is waiting in the menu!`);
}

// Towers a challenge doesn't allow are greyed out in the shop
function isLocked(type) {
  if (!owns(type)) return true; // not unlocked yet
  return !!(challenge && challenge.allowed && !challenge.allowed.includes(type) && type !== "lilypad");
}

// Tokens for clearing a round of a normal game: Easy 1, Medium 1.5, Hard 2 (Freeplay counts too)
function roundTokens() {
  if (challenge) return "";
  const rate = TOKEN_RATE[difficulty] || 1;
  progress.tokens += rate;
  saveProgress();
  return ` · +${fmtTokens(rate)} 🐸 (${fmtTokens(progress.tokens)} tokens)`;
}
function updateShopLocks() {
  for (const [t, id] of Object.entries(SHOP_BUTTONS)) {
    $(id).className = "shopItem" + (t === selected ? " selected" : "") + (isLocked(t) ? " locked" : "");
  }
  if (isLocked(selected)) selected = challenge && challenge.allowed ? challenge.allowed[0] : "frog";
}

// ---------- Perk tree shop ----------
// A perk can be bought once every perk it needs (its "req" list) is owned.
function perkState(p) {
  if (perk(p.id)) return "owned";
  if ((p.req || []).some((r) => !perk(r))) return "locked";
  return progress.tokens >= p.cost ? "ready" : "poor";
}
function buyPerk(id) {
  const p = PERK_TREE.find((x) => x.id === id);
  if (!p || perkState(p) !== "ready") return;
  progress.tokens -= p.cost;
  progress.tree[id] = true;
  if (p.fx.golden) progress.golden = true;
  saveProgress();
  renderMenuExtras();
  drawShopIcon("iconFrog", "frog");
}

// Lays the perks out in rows: each perk sits one row below the deepest perk it needs,
// in the order of the perks above it, then draws lines from each perk to the ones it unlocks.
function renderPerkTree() {
  const box = $("perkList");
  box.innerHTML = "";
  const depth = {};
  const getDepth = (p) => {
    if (depth[p.id] !== undefined) return depth[p.id];
    const reqs = (p.req || []).map((r) => PERK_TREE.find((x) => x.id === r));
    return (depth[p.id] = reqs.length ? 1 + Math.max(...reqs.map(getDepth)) : 0);
  };
  PERK_TREE.forEach(getDepth);
  const rows = [];
  for (const p of PERK_TREE) (rows[depth[p.id]] = rows[depth[p.id]] || []).push(p);
  // keep children under their parents
  const order = {};
  rows.forEach((row, d) => {
    if (d > 0) row.sort((x, y) => avg(x) - avg(y));
    row.forEach((p, i) => (order[p.id] = i / Math.max(1, row.length - 1)));
  });
  function avg(p) { return p.req.reduce((t, r) => t + order[r], 0) / p.req.length; }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "perk-lines");
  box.appendChild(svg);
  const nodes = {};
  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "perk-row";
    for (const p of row) {
      const st = perkState(p);
      const btn = document.createElement("button");
      btn.className = "perk-node " + st + (p.req && p.req.length > 1 ? " join" : "");
      btn.disabled = st !== "ready";
      const needs = (p.req || []).map((r) => PERK_TREE.find((x) => x.id === r).name).join(" + ");
      btn.title = p.info + (needs ? "\nNeeds: " + needs : "");
      const label = st === "owned" ? "✔" : st === "locked" ? "🔒" : p.cost + " 🐸";
      btn.innerHTML = `<b>${p.icon} ${p.name}</b><small>${p.info}</small><i>${label}</i>`;
      btn.onclick = () => buyPerk(p.id);
      rowEl.appendChild(btn);
      nodes[p.id] = btn;
    }
    box.appendChild(rowEl);
  }
  // Draw the connecting lines once the browser has laid out the buttons
  requestAnimationFrame(() => {
    const base = box.getBoundingClientRect();
    svg.setAttribute("width", box.scrollWidth);
    svg.setAttribute("height", box.scrollHeight);
    let lines = "";
    for (const p of PERK_TREE) {
      for (const r of p.req || []) {
        const from = nodes[r].getBoundingClientRect(), to = nodes[p.id].getBoundingClientRect();
        const x1 = from.left + from.width / 2 - base.left + box.scrollLeft, y1 = from.bottom - base.top;
        const x2 = to.left + to.width / 2 - base.left + box.scrollLeft, y2 = to.top - base.top;
        const lit = perk(r) ? "lit" : "";
        lines += `<path class="${lit}" d="M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}"/>`;
      }
    }
    svg.innerHTML = lines;
  });
}

// ---------- Menu extras ----------
function toggleWeather(key) {
  weatherChoice[key] = !weatherChoice[key];
  renderMenuExtras();
}
function renderMenuExtras() {
  // Continue saved game
  const save = loadData(userKey("fpd_save"), null);
  const cont = $("continueBtn");
  if (save) {
    cont.style.display = "block";
    cont.textContent = `▶ Continue: ${(save.mapObj || MAPS[save.map]).name}, ${save.challenge ? "Challenge #" + save.challenge.num : DIFFICULTIES[save.difficulty].name}, round ${save.round}`;
  } else cont.style.display = "none";

  // Challenge card
  const ch = progress.challenge;
  $("challengeText").textContent = `#${ch.num}: ${challengeText(ch)}`;
  $("challengeReward").textContent = `Reward: ${ch.reward} 🐸 Frog Tokens`;

  // Weather toggles
  $("weatherList").innerHTML = "";
  for (const [key, w] of Object.entries(WEATHER)) {
    const btn = document.createElement("button");
    btn.className = "weather-btn" + (weatherChoice[key] ? " on" : "");
    btn.title = w.info;
    btn.innerHTML = `${w.icon} ${w.name}<small>${w.info}</small>`;
    btn.onclick = () => toggleWeather(key);
    $("weatherList").appendChild(btn);
  }

  // Frog Tokens and the token shop
  $("tokenCount").textContent = `🐸 Frog Tokens: ${fmtTokens(progress.tokens)}`;
  renderAccount();
  renderCollection();
  renderClassBuffs();
  renderPerkTree();

  // High scores on the map cards
  MAPS.forEach((m, i) => { const el = $("best-" + i); if (el) el.textContent = scoreLine(i); });
}
// ---------- Achievements ----------
// Earn Frog Tokens (and sometimes a skin) by doing cool things.
const ACHIEVEMENTS = [
  { id: "first", name: "First Steps", info: "Clear your first round", reward: 5, done: () => progress.stats.rounds >= 1 },
  { id: "sq100", name: "Bug Squasher", info: "Squash 100 bugs", reward: 10, done: () => progress.stats.squashed >= 100 },
  { id: "sq1k", name: "Bug Smasher", info: "Squash 1,000 bugs", reward: 25, done: () => progress.stats.squashed >= 1000 },
  { id: "sq10k", name: "Bug Destroyer", info: "Squash 10,000 bugs", reward: 60, skin: "crown", done: () => progress.stats.squashed >= 10000 },
  { id: "boss1", name: "Boss Buster", info: "Defeat your first boss", reward: 10, done: () => progress.stats.bosses >= 1 },
  { id: "boss50", name: "Boss Hunter", info: "Defeat 50 bosses", reward: 40, done: () => progress.stats.bosses >= 50 },
  { id: "easy", name: "Pond Keeper", info: "Beat Easy", reward: 15, done: () => progress.flags.win_easy },
  { id: "medium", name: "Pond Guardian", info: "Beat Medium", reward: 25, done: () => progress.flags.win_medium },
  { id: "hard", name: "Pond Legend", info: "Beat Hard", reward: 50, skin: "wizard", done: () => progress.flags.win_hard },
  { id: "perfect", name: "Perfect Pond", info: "Win a game without losing a single life", reward: 40, skin: "halo", done: () => progress.flags.perfect },
  { id: "ultra", name: "Mole Masher", info: "Defeat the Giant Mole Cricket", reward: 40, done: () => progress.flags.ultra },
  { id: "free60", name: "Endless Frog", info: "Reach round 60 in Freeplay", reward: 40, done: () => progress.flags.free60 },
  { id: "rush10", name: "Boss Rusher", info: "Reach round 10 in Boss Rush", reward: 30, done: () => progress.flags.rush10 },
  { id: "collect", name: "Frog Collector", info: "Unlock 10 frogs", reward: 20, done: () => progress.owned.length >= 10 },
  { id: "maps5", name: "Explorer", info: "Win on 5 different maps", reward: 40, done: () => Object.keys(progress.mapWins).length >= 5 },
  { id: "chal5", name: "Challenger", info: "Beat 5 challenges", reward: 25, done: () => progress.challengeNum >= 5 },
  { id: "rich", name: "Fly Millionaire", info: "Have 3,000 flies at the end of a round", reward: 15, done: () => progress.stats.mostFlies >= 3000 },
  { id: "maker", name: "Map Maker", info: "Make your own map", reward: 10, skin: "hardhat", done: () => progress.flags.madeMap },
  { id: "coop", name: "Best Buddies", info: "Win a game in 2-player mode", reward: 25, done: () => progress.flags.coopWin },
];
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (progress.ach[a.id] || !a.done()) continue;
    progress.ach[a.id] = true;
    progress.tokens += a.reward;
    if (a.skin) progress.skins[a.skin] = true;
    showToast(`🏆 Achievement: ${a.name}`, `+${a.reward} 🐸 tokens` + (a.skin ? ` and the ${SKINS[a.skin].name} skin!` : "!"));
    sfx("achieve");
  }
  saveProgress();
}
let toastTimer = null;
function showToast(title, text) {
  const t = $("toast");
  if (!t || !t.querySelector) return;
  t.querySelector(".to-title").textContent = title;
  t.querySelector(".to-text").textContent = text;
  t.className = "show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ""; }, 4000);
}

// ---------- Bug Book ----------
// Every bug you've met, with its stats and a real fact. Bugs you haven't seen yet show as "???".
const BUG_FACTS = {
  6: "Crickets 'sing' by rubbing their wings together.", 1: "Some gnats beat their wings 1,000 times a second!",
  7: "Only female mosquitoes bite.", 2: "There are more kinds of beetles than any other animal.",
  8: "A ladybug can eat 5,000 aphids in its life.", 9: "Fire ants can link together into a raft to float on water.",
  3: "Hornets are the biggest wasps in Europe.", 10: "A praying mantis can turn its head 180 degrees.",
  11: "Wasps chew wood to make paper for their nests.", 12: "Rhino beetles can lift 850 times their own weight.",
  19: "Stink bugs let out a smelly spray when they're scared.", 20: "Pill bugs aren't insects: they're related to crabs!",
  23: "Baby spiders ride on their mother's back for about a week.", 17: "Glasswing butterflies have see-through wings.",
  18: "Ghost mantises look just like dried, dead leaves.", 4: "Male stag beetles use their giant jaws to wrestle.",
  13: "Giant centipedes can grow as long as your forearm.", 14: "Atlas moths have no mouth and never eat as adults.",
  22: "Wolf spiders hunt by chasing, not with webs.", 5: "Yellow jackets can sting again and again.",
  15: "Asian giant hornets are the biggest hornets in the world.", 21: "Hercules beetles are one of the longest beetles on Earth.",
  16: "Mole crickets dig tunnels with front legs shaped like shovels.",
};
function renderBugBook() {
  const box = $("tabBody");
  box.innerHTML = `<p class="tab-note">Bugs you've met: ${Object.keys(progress.seen).length} / ${Object.keys(BUG_TYPES).length}</p><div class="book-grid"></div>`;
  const grid = box.querySelector(".book-grid");
  const ids = Object.keys(BUG_TYPES).map(Number).sort((a, b) => (BUG_TYPES[a].boss ? 1 : 0) - (BUG_TYPES[b].boss ? 1 : 0) || BUG_TYPES[a].hp - BUG_TYPES[b].hp);
  for (const id of ids) {
    const t = BUG_TYPES[id], seen = progress.seen[id];
    const card = document.createElement("div");
    card.className = "book-card" + (seen ? "" : " unseen");
    card.innerHTML = `<canvas width="64" height="64"></canvas><b>${seen ? t.name : "???"}</b>` +
      (seen ? `<small>❤️ ${t.hp} HP · 💨 ${t.speed} speed${t.boss ? " · 👑 boss" : ""}${t.armor ? " · 🛡️ armored" : ""}${t.invisible ? " · 👻 invisible" : ""}</small><i>${BUG_FACTS[id] || ""}</i>` : "<small>Not met yet</small>");
    grid.appendChild(card);
    if (seen) drawBugIcon(card.querySelector("canvas"), id);
  }
}
function drawBugIcon(canvasEl, id) {
  const saved = ctx;
  ctx = canvasEl.getContext("2d");
  const t = BUG_TYPES[id];
  ctx.save();
  ctx.translate(32, 36);
  const k = t.boss ? 0.45 : 1.1;
  ctx.scale(k, k);
  drawBug({ tier: id, x: 0, y: 0, wobble: 1, angle: -Math.PI / 2, hp: 1, maxHp: 1, route: [], wp: 0 });
  ctx.restore();
  ctx = saved;
}

// ---------- Stats page ----------
function renderStats() {
  const st = progress.stats;
  const fav = Object.entries(st.placed).sort((a, b) => b[1] - a[1])[0];
  const mins = Math.round(st.frames / 3600);
  const rows = [
    ["🐞 Bugs squashed", st.squashed.toLocaleString()],
    ["👑 Bosses defeated", st.bosses.toLocaleString()],
    ["🎮 Games played", st.games],
    ["🏆 Games won", st.wins],
    ["🔁 Rounds cleared", st.rounds.toLocaleString()],
    ["💥 Total damage", bigNum(st.damage)],
    ["⭐ Most damage by one frog", bigNum(st.bestFrog)],
    ["🪰 Most flies at once", st.mostFlies.toLocaleString()],
    ["🐸 Favorite frog", fav ? `${TOWERS[fav[0]].name} (placed ${fav[1]} times)` : "-"],
    ["⏱️ Time played", mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`],
    ["🏅 Achievements", `${Object.keys(progress.ach).length} / ${ACHIEVEMENTS.length}`],
    ["🗺️ Maps won on", Object.keys(progress.mapWins).length],
  ];
  $("tabBody").innerHTML = `<div class="stats-grid">${rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join("")}</div>`;
}

// ---------- Achievements tab ----------
function renderAchievements() {
  const got = Object.keys(progress.ach).length;
  $("tabBody").innerHTML = `<p class="tab-note">${got} / ${ACHIEVEMENTS.length} unlocked</p><div class="ach-grid">` +
    ACHIEVEMENTS.map((a) => `<div class="ach-card ${progress.ach[a.id] ? "got" : ""}"><b>${progress.ach[a.id] ? "🏆" : "🔒"} ${a.name}</b>
      <small>${a.info}</small><i>+${a.reward} 🐸${a.skin ? " + " + SKINS[a.skin].name + " skin" : ""}</i></div>`).join("") + "</div>";
}

// ---------- Skins tab ----------
function renderSkins() {
  const box = $("tabBody");
  box.innerHTML = `<p class="tab-note">Your frogs wear the skin you pick. Some are bought with tokens, some come from achievements.</p><div class="skin-grid"></div>`;
  const grid = box.querySelector(".skin-grid");
  const options = [["", { name: "No skin", cost: 0 }], ...Object.entries(SKINS)];
  for (const [id, sk] of options) {
    const have = !id || progress.skins[id];
    const on = (progress.skin || "") === id;
    const card = document.createElement("button");
    card.className = "skin-card" + (on ? " on" : "");
    card.innerHTML = `<canvas width="60" height="60"></canvas><b>${sk.name}</b><small>${on ? "✔ Wearing" : have ? "Click to wear" : sk.achievement ? "🏆 From an achievement" : `🔒 ${sk.cost} tokens`}</small>`;
    card.disabled = !have && (sk.achievement || progress.tokens < sk.cost);
    card.onclick = () => {
      if (!have) { progress.tokens -= sk.cost; progress.skins[id] = true; }
      progress.skin = id || null;
      saveProgress();
      renderSkins();
      $("tokenCount").textContent = `🐸 Frog Tokens: ${fmtTokens(progress.tokens)}`;
    };
    grid.appendChild(card);
    const saved = ctx;
    ctx = card.querySelector("canvas").getContext("2d");
    drawFrog({ type: "frog", x: 30, y: 36, tiers: [0, 0, 0], angle: -Math.PI / 2, tongue: null, abilityCd: 0, frenzy: 0, skinPreview: id || "none" });
    ctx = saved;
  }
}

// ---------- Menu tabs ----------
let openTab = null;
const TABS = { ach: renderAchievements, skins: renderSkins, book: renderBugBook, stats: renderStats,
  help: () => { $("tabBody").innerHTML = `<div class="help-box">${$("info").innerHTML}</div>`; } };
function showTab(name) {
  openTab = openTab === name ? null : name; // clicking the open tab closes it
  for (const b of document.querySelectorAll ? document.querySelectorAll(".tab-btn") : []) b.classList.toggle("on", b.dataset.tab === openTab);
  if (!openTab) { $("tabBody").innerHTML = ""; return; }
  TABS[openTab]();
}
if (document.querySelectorAll) for (const b of document.querySelectorAll(".tab-btn")) b.onclick = () => showTab(b.dataset.tab);

// ---------- Account box (top of the menu) ----------
let accountMode = null; // null, "signup" or "login": which form is open
function switchUser(name) {
  currentUser = name;
  saveData("fpd_current", name);
  loadProgress();
  ensureChallenge();
  checkAchievements();
  renderMenuExtras();
  updateShopLocks();
  drawShopIcon("iconFrog", "frog");
}
// ---------- Google sign-in ----------
// To turn on "Sign in with Google", paste your Google OAuth Client ID here (see the steps Claude gave you).
// Until then the Google button just explains that it isn't set up yet.
const GOOGLE_CLIENT_ID = "410059858954-tgimiavl6o68m0peltffng3trv94k8t9.apps.googleusercontent.com";
let googleReady = false;
function setupGoogle() {
  if (!GOOGLE_CLIENT_ID || googleReady || typeof document.createElement !== "function") return;
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.onload = () => {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleSignIn });
    googleReady = true;
    renderAccount();
  };
  document.head.appendChild(script);
}
// Google sends back a signed token; the middle part holds the player's email and name
function onGoogleSignIn(response) {
  try {
    const part = response.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const info = JSON.parse(decodeURIComponent(escape(atob(part))));
    if (!info.email) return;
    const id = info.email.toLowerCase();
    if (!accounts[id]) accounts[id] = { email: info.email, name: info.given_name || info.name || info.email, google: true };
    saveData("fpd_accounts", accounts);
    accountMode = null;
    switchUser(id);
  } catch (e) {
    showMsg("Google sign-in didn't work. Try again, or sign up with your email.");
  }
}

// ---------- Account box ----------
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function displayName(id) { const acc = accounts[id] || {}; return acc.name || id; }

function renderAccount() {
  const box = $("accountBox");
  if (accountMode) {
    const signup = accountMode === "signup";
    box.innerHTML = `<b>${signup ? "Sign up" : "Log in"}</b>
      <input id="accEmail" type="email" placeholder="Email address" maxlength="80">
      ${signup ? '<input id="accName" placeholder="Name (shown in game)" maxlength="20">' : ""}
      <input id="accPass" type="password" placeholder="Password" maxlength="40">
      <button id="accGo">${signup ? "Create account" : "Log in"}</button>
      <button id="accCancel" class="acc-small">Cancel</button>
      <span id="accErr" class="acc-err"></span>`;
    $("accGo").onclick = submitAccount;
    $("accCancel").onclick = () => { accountMode = null; renderAccount(); };
    return;
  }
  if (currentUser) {
    const acc = accounts[currentUser] || {};
    if (!acc.email) {
      // Older accounts made before emails were needed: ask for one
      box.innerHTML = `<span>👤 <b>${displayName(currentUser)}</b>: please add your email address to keep this account</span>
        <input id="accAddEmail" type="email" placeholder="Email address" maxlength="80">
        <button id="accSaveEmail" class="acc-small">Save email</button>
        <button id="accOut" class="acc-small">Sign out</button>
        <span id="accErr" class="acc-err"></span>`;
      $("accSaveEmail").onclick = () => {
        const email = $("accAddEmail").value.trim();
        if (!EMAIL_OK.test(email)) { $("accErr").textContent = "That doesn't look like an email address."; return; }
        if (Object.entries(accounts).some(([id, a]) => id !== currentUser && (a.email || "").toLowerCase() === email.toLowerCase())) {
          $("accErr").textContent = "Another account already uses that email.";
          return;
        }
        acc.email = email;
        saveData("fpd_accounts", accounts);
        renderAccount();
      };
    } else {
      box.innerHTML = `<span>👤 Signed in as <b>${displayName(currentUser)}</b> <small>(${acc.email}${acc.google ? ", Google" : ""})</small></span>
        <button id="accOut" class="acc-small">Sign out</button>`;
    }
    $("accOut").onclick = () => {
      if (acc.google && googleReady) google.accounts.id.disableAutoSelect();
      switchUser(null);
    };
  } else {
    box.innerHTML = `<span>👤 Playing as a guest</span>
      <button id="accSignup" class="acc-small">Sign up</button><button id="accLogin" class="acc-small">Log in</button>
      <span id="googleBtn"></span><span id="googleHint" class="acc-err"></span>`;
    $("accSignup").onclick = () => { accountMode = "signup"; renderAccount(); };
    $("accLogin").onclick = () => { accountMode = "login"; renderAccount(); };
    if (googleReady) {
      google.accounts.id.renderButton($("googleBtn"), { theme: "outline", size: "medium", text: "signin_with" });
    } else {
      const g = document.createElement("button");
      g.className = "acc-small google-off";
      g.textContent = "G  Sign in with Google";
      g.title = GOOGLE_CLIENT_ID ? "Loading Google..." : "Google sign-in isn't set up yet: it needs a Google Client ID added to game.js.";
      g.onclick = () => { $("googleHint").textContent = g.title; };
      $("googleBtn").appendChild(g);
    }
  }
}

function submitAccount() {
  const email = $("accEmail").value.trim(), pass = $("accPass").value;
  const err = (t) => { $("accErr").textContent = t; };
  if (accountMode === "signup") {
    const name = $("accName").value.trim();
    if (!EMAIL_OK.test(email)) return err("Please enter a real email address.");
    if (!/^[A-Za-z0-9_ -]{2,20}$/.test(name)) return err("Name: 2-20 letters or numbers.");
    if (pass.length < 6) return err("Password: at least 6 characters.");
    const id = email.toLowerCase();
    if (accounts[id] || Object.values(accounts).some((a) => (a.email || "").toLowerCase() === id)) {
      return err("There's already an account with that email. Try logging in.");
    }
    accounts[id] = { email, name, pass: hashPass(id, pass) };
    saveData("fpd_accounts", accounts);
    accountMode = null;
    switchUser(id);
  } else {
    // Log in with your email (older accounts can still use their name)
    const typed = email.toLowerCase();
    const id = Object.keys(accounts).find((k) => k.toLowerCase() === typed || (accounts[k].email || "").toLowerCase() === typed);
    if (!id) return err("No account with that email on this computer.");
    if (accounts[id].google && !accounts[id].pass) return err("That account uses Google. Use the Google button.");
    if (accounts[id].pass !== hashPass(id, pass)) return err("Wrong email or password.");
    accountMode = null;
    switchUser(id);
  }
}
setupGoogle();

// ---------- Frog Collection (unlock frogs with tokens) ----------
function unlockFrog(type) {
  const cost = UNLOCK_COST[type];
  if (owns(type) || progress.tokens < cost) return;
  progress.tokens -= cost;
  progress.owned.push(type);
  saveProgress();
  renderMenuExtras();
  updateShopLocks();
}
// Short base stats for a frog card, e.g. "💥 12 dmg · 🎯 100 · ⚡ 1.5/s"
function frogStatLine(type) {
  const t = TOWERS[type];
  if (type === "lilypad") return "Lets land frogs sit in the pond";
  if (type === "glassfrog") return "Support: +30% speed nearby";
  if (type === "tomatofrog") return `Makes ${t.damage} flies every ${(t.cooldown / 60).toFixed(0)}s`;
  const dmg = type === "pacman" ? "eats bugs" : `💥 ${t.damage} dmg`;
  return `${dmg} · 🎯 ${t.range} · ⚡ ${(60 / t.cooldown).toFixed(1)}/s`;
}
// ---------- Class Buffs (level up a whole class with tokens) ----------
function buyClassBuff(k) {
  const lv = classLevel(k), cost = CLASS_COSTS[lv];
  if (lv >= CLASS_COSTS.length || progress.tokens < cost) return;
  progress.tokens -= cost;
  progress.classBuffs[k] = lv + 1;
  saveProgress();
  renderMenuExtras();
}
function renderClassBuffs() {
  const box = $("classList");
  box.innerHTML = "";
  for (const [k, c] of Object.entries(CLASSES)) {
    const lv = classLevel(k), max = lv >= CLASS_COSTS.length, cost = CLASS_COSTS[lv];
    const card = document.createElement("div");
    card.className = "class-card";
    card.style.borderColor = c.color;
    const now = Object.entries(c.fx).map(([key, v]) => Math.round(v * lv * 100) + "%").join(" / ");
    card.innerHTML = `<b style="color:${c.color}">${c.icon} ${c.name}</b>
      <small class="cls-frogs">${c.frogs.map((t) => TOWERS[t].name).join(", ")}</small>
      <span><b>${c.buff}</b>: ${c.per} per level</span>
      <span class="cls-pips">${"★".repeat(lv)}${"☆".repeat(CLASS_COSTS.length - lv)} ${lv ? "(now +" + now + ")" : ""}</span>
      <button ${max || progress.tokens < cost ? "disabled" : ""}>${max ? "MAX" : `Level ${lv + 1} – ${cost} 🐸`}</button>`;
    card.querySelector("button").onclick = () => buyClassBuff(k);
    box.appendChild(card);
  }
}
function renderCollection() {
  const list = $("collectionList");
  list.innerHTML = "";
  for (const [type, cost] of Object.entries(UNLOCK_COST).sort((a, b) => a[1] - b[1])) {
    const btn = document.createElement("button");
    const have = owns(type);
    btn.className = "frog-card" + (have ? " owned" : "");
    btn.disabled = have || progress.tokens < cost;
    btn.innerHTML = `<canvas width="40" height="40"></canvas><span>${TOWERS[type].name} ${classTag(type)}<small>${have ? "✔ Unlocked" : `🔒 ${cost} tokens`}</small><em>${frogStatLine(type)}</em></span>`;
    btn.onclick = () => unlockFrog(type);
    list.appendChild(btn);
    drawShopIcon(btn.querySelector("canvas"), type);
  }
}

$("continueBtn").onclick = loadGame;
$("challengeBtn").onclick = () => startMap(progress.challenge.map, progress.challenge);

// ---------- Weather on screen ----------
let raindrops = [];
function drawWeather() {
  const w = activeWeather;
  if (w.night) { ctx.fillStyle = "rgba(10,20,60,0.35)"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (w.heat) { ctx.fillStyle = "rgba(255,140,40,0.10)"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (w.fog) {
    const t = performance.now() / 4000;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = "rgba(235,240,245,0.10)";
      ctx.beginPath();
      ctx.ellipse(((i * 210 + t * 60) % 1000) - 100, 80 + i * 85, 220, 70, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (w.rain) {
    if (raindrops.length < 90) for (let i = 0; i < 90; i++) raindrops.push({ x: Math.random() * 800, y: Math.random() * 480 });
    ctx.strokeStyle = "rgba(200,225,255,0.5)";
    ctx.beginPath();
    for (const d of raindrops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 3, d.y + 10);
      d.y += 9; d.x -= 2.5;
      if (d.y > 480) { d.y = -10; d.x = Math.random() * 840; }
    }
    ctx.stroke();
  }
  if (w.wind) {
    const t = performance.now() / 300;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 137 + t * 40) % 900) - 50, y = 40 + i * 62;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 30, y - 8, x + 60, y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
}

// =====================================================================
// MAP MAKER, MAP PLACE and ONLINE (leaderboard + shared maps)
// =====================================================================

// ---------- Online (Firebase) ----------
// To turn on the online leaderboard and sharing maps with everyone, paste your Firebase
// project ID and Web API key here (see the steps Claude gave you). Until then everything
// works on this computer only.
const FIREBASE = { projectId: "frog-pond-defense-b651e", apiKey: "AIzaSyBcE5evwoayoD-ojhyyoRMFr_Jk7HTP0GY" };
function online() { return !!(FIREBASE.projectId && FIREBASE.apiKey && typeof fetch === "function"); }
const FS_URL = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
// Firestore stores values in a special format: these convert to and from it
function toFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === "boolean") f[k] = { booleanValue: v };
    else f[k] = { stringValue: String(v) };
  }
  return { fields: f };
}
function fromFields(doc) {
  const o = { _id: doc.name.split("/").pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) {
    o[k] = "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue : v.stringValue;
  }
  return o;
}
async function fsList(col) {
  const r = await fetch(`${FS_URL()}/${col}?pageSize=300&key=${FIREBASE.apiKey}`);
  if (!r.ok) throw new Error("load failed (" + r.status + ")");
  const j = await r.json();
  return (j.documents || []).map(fromFields);
}
async function fsAdd(col, obj) {
  const r = await fetch(`${FS_URL()}/${col}?key=${FIREBASE.apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toFields(obj)),
  });
  if (!r.ok) throw new Error("save failed (" + r.status + ")");
}

// ---------- Online leaderboard ----------
function playerName() { return currentUser ? displayName(currentUser) : "Guest"; }
function modeKey() { return isBossRush() ? "bossrush" : freeplay ? (difficulty === "freeplay" ? "freeplay" : difficulty + "+free") : difficulty; }
function submitScore(roundsCleared) {
  if (!online() || challenge || roundsCleared < 1) return;
  fsAdd("scores", { name: playerName(), map: currentMap.name, mode: modeKey(), round: roundsCleared, coop: !!coop, date: Date.now() })
    .catch(() => { /* offline: skip */ });
}
async function renderLeaderboard() {
  const box = $("tabBody");
  if (!online()) {
    box.innerHTML = '<p class="tab-note">🌍 The online leaderboard isn\'t switched on yet. It needs a free Firebase project (ask Claude for the steps). Your own best rounds are on each map card.</p>';
    return;
  }
  const mapOpts = MAPS.map((m) => `<option>${m.name}</option>`).join("");
  const modeOpts = ["easy", "medium", "hard", "freeplay", "bossrush"].map((m) => `<option value="${m}">${(DIFFICULTIES[m] || {}).name || m}</option>`).join("");
  box.innerHTML = `<div class="lb-controls"><select id="lbMap">${mapOpts}</select><select id="lbMode">${modeOpts}</select></div><div id="lbList" class="tab-note">Loading...</div>`;
  const draw = async () => {
    $("lbList").textContent = "Loading...";
    try {
      const all = await fsList("scores");
      const rows = all.filter((x) => x.map === $("lbMap").value && String(x.mode).startsWith($("lbMode").value))
        .sort((a, b) => b.round - a.round).slice(0, 20);
      $("lbList").innerHTML = rows.length ? '<table class="lb-table"><tr><th>#</th><th>Player</th><th>Round</th></tr>' +
        rows.map((x, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(x.name)}${x.coop ? " 👥" : ""}</td><td>${x.round}</td></tr>`).join("") + "</table>"
        : "No scores yet: be the first!";
    } catch (e) { $("lbList").textContent = "Couldn't load the leaderboard: " + e.message; }
  };
  $("lbMap").onchange = draw;
  $("lbMode").onchange = draw;
  draw();
}
function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- Custom map difficulty rating ----------
// Worked out the moment a map is made: shorter paths are harder, more corners give your frogs more chances.
function pathLength(path) {
  let L = 0;
  for (let i = 1; i < path.length; i++) if (path[i][2] !== "tp") L += Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
  return L;
}
function rateMap(path) {
  const L = pathLength(path), corners = Math.max(0, path.length - 2);
  return Math.max(1, Math.min(10, Math.round(10 - (L - 20) / 5 - corners * 0.15)));
}
// Several tracks: as hard as the hardest one, plus 1 for every extra entrance
function rateTracks(tracks) {
  const starts = new Set(tracks.map((t) => t[0][0] + "," + t[0][1]));
  return Math.max(1, Math.min(10, Math.max(...tracks.map(rateMap)) + starts.size - 1));
}
function ratingLabel(n) { return n <= 2 ? "Easy" : n <= 4 ? "Normal" : n <= 6 ? "Medium" : n <= 8 ? "Hard" : "Extreme"; }

// ---------- Map Maker ----------
// Maps can have up to 5 tracks (each one its own entrance) and up to 5 ponds,
// plus gimmicks: mushroom portals, slippery log bridges and flyers that fly straight.
const POND_SIZES = { small: [90, 60], medium: [130, 85], large: [170, 110] };
const MAX_TRACKS = 5, MAX_PONDS = 5;
const TRACK_COLORS = ["#ffe066", "#7fd3ff", "#ff9ff3", "#b9f18c", "#ffb36b"];
const ed = {
  tracks: [[]], cur: 0,                                // the tracks, and which one you're drawing
  ponds: [{ x: 400, y: 240, size: "medium" }], pondSel: 0,
  size: "medium", goal: "pond", tool: "path", name: "",
  bridge: false, flyStraight: false,                   // gimmicks
};
// ed.path = the track you're drawing right now
Object.defineProperty(ed, "path", { get() { return ed.tracks[ed.cur]; }, set(v) { ed.tracks[ed.cur] = v; } });
function edTile(e, cv) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
  return { x, y, c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}
function onEdge(c, r) { return c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1; }
function edPondObj(p) { const [rx, ry] = POND_SIZES[p.size]; return { x: Math.round(p.x), y: Math.round(p.y), rx, ry }; }
function edPonds() { return ed.ponds.map(edPondObj); }
function edPondAt(x, y) {
  return ed.ponds.findIndex((p) => { const P = edPondObj(p); return ((x - P.x) / P.rx) ** 2 + ((y - P.y) / P.ry) ** 2 <= 1; });
}
function edTracks() { return ed.tracks.filter((t) => t.length); }
function edRating() { const t = edTracks().filter((x) => x.length >= 2); return t.length ? rateTracks(t) : null; }
// Turns the editor drawing into a real map (or a list of problems to fix)
function buildCustomMap() {
  const errs = [];
  const tracks = edTracks();
  const ponds = edPonds();
  const wet = (c, r) => ponds.some((P) => ((c * TILE + 20 - P.x) / P.rx) ** 2 + ((r * TILE + 20 - P.y) / P.ry) ** 2 <= 1);
  if (!tracks.length) errs.push("Draw a track: click tiles to add corners.");
  tracks.forEach((p, i) => {
    const name = tracks.length > 1 ? `Track ${ed.tracks.indexOf(p) + 1}: ` : "";
    if (p.length < 2) return errs.push(name + "needs at least 2 corners.");
    if (!onEdge(p[0][0], p[0][1])) errs.push(name + "must START at the edge of the map (where bugs come in).");
    if (p[1][2] === "tp") errs.push(name + "walk at least one stretch before the first portal.");
    const [lc, lr, ltp] = p.at(-1);
    if (ltp === "tp") errs.push(name + "can't END on a portal: walk somewhere after it.");
    if (ed.goal === "pond" && !wet(lc, lr)) errs.push(name + "goal is a pond, so it must END inside a pond.");
    if (ed.goal === "exit" && !onEdge(lc, lr)) errs.push(name + "goal is an exit, so it must END at the edge of the map.");
    if (ed.goal === "home" && wet(lc, lr)) errs.push(name + "goal is a home, so it must end on land, not in a pond.");
  });
  if (!ed.name.trim()) errs.push("Give your map a name.");
  if (errs.length) return { errs };
  const paths = tracks.map((p) => {
    const path = p.map(([c, r, tp]) => (tp ? [c, r, "tp"] : [c, r]));
    if (ed.goal === "exit") {
      const [c, r] = path.at(-1);
      path.push(c === 0 ? [-1, r] : c === COLS - 1 ? [COLS, r] : r === 0 ? [c, -1] : [c, ROWS]); // walk off the map
    }
    return path;
  });
  const rating = rateTracks(paths);
  const extras = [];
  if (paths.length > 1) extras.push(paths.length + " tracks");
  if (ponds.length > 1) extras.push(ponds.length + " ponds");
  if (paths.some((p) => p.some((x) => x[2] === "tp"))) extras.push("portals");
  if (ed.bridge) extras.push("log bridges");
  if (ed.flyStraight) extras.push("straight-flying bugs");
  const map = {
    name: ed.name.trim().slice(0, 30), difficulty: ratingLabel(rating), rating,
    desc: `A custom map by ${playerName()}. Difficulty ${rating}/10.` + (extras.length ? " Has " + extras.join(", ") + "." : ""),
    pond: ponds[0], path: paths[0], goal: ed.goal, reedGap: null, seed: 7 + paths[0].length, lilyPads: [],
    custom: true, id: "m" + Date.now().toString(36), author: playerName(), created: Date.now(),
  };
  if (paths.length > 1) map.extraPaths = paths.slice(1);
  if (ponds.length > 1) map.extraPonds = ponds.slice(1);
  if (ed.bridge) map.slippery = 0.5;
  if (ed.flyStraight) map.flyStraight = true;
  return { map };
}
function drawEditor(cv) {
  const g = cv.getContext("2d");
  const saved = ctx;
  ctx = g;
  // reuse the real map drawing for the background (grass + ponds + tracks so far)
  const drawn = ed.tracks.filter((t) => t.length >= 2);
  const ponds = edPonds();
  const fake = { pond: ponds[0], extraPonds: ponds.slice(1), path: drawn[0] || [[-5, -5], [-4, -5]], extraPaths: drawn.slice(1),
    goal: ed.goal === "home" && drawn.length ? "home" : "pond", reedGap: null, seed: 3, lilyPads: [], slippery: ed.bridge ? 0.5 : 0 };
  const prevMap = currentMap;
  loadMap(fake);
  const prevPicked = picked, prevHover = hoverTile;
  picked = null; hoverTile = null;
  drawMap();
  picked = prevPicked; hoverTile = prevHover;
  // grid
  g.strokeStyle = "rgba(255,255,255,0.08)";
  for (let c = 0; c <= COLS; c++) { g.beginPath(); g.moveTo(c * TILE, 0); g.lineTo(c * TILE, ROWS * TILE); g.stroke(); }
  for (let r = 0; r <= ROWS; r++) { g.beginPath(); g.moveTo(0, r * TILE); g.lineTo(COLS * TILE, r * TILE); g.stroke(); }
  // the pond you'd move or resize
  if (ed.tool === "pond" && ponds[ed.pondSel]) {
    const P = ponds[ed.pondSel];
    g.setLineDash([6, 5]); g.strokeStyle = "#ffe066"; g.lineWidth = 2;
    g.beginPath(); g.ellipse(P.x, P.y, P.rx + 10, P.ry + 10, 0, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.lineWidth = 1;
  }
  // corner dots: each track has its own colour, the one you're drawing is bigger
  ed.tracks.forEach((track, ti) => {
    const mine = ti === ed.cur;
    track.forEach(([c, r, tp], i) => {
      const x = c * TILE + 20, y = r * TILE + 20;
      g.fillStyle = i === 0 ? "#4caf50" : i === track.length - 1 ? "#e53935" : tp ? "#b06ad9" : TRACK_COLORS[ti % TRACK_COLORS.length];
      g.beginPath(); g.arc(x, y, mine ? 10 : 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = TRACK_COLORS[ti % TRACK_COLORS.length]; g.lineWidth = mine ? 3 : 2;
      g.stroke(); g.lineWidth = 1;
      g.fillStyle = "#1a1a1a"; g.font = `bold ${mine ? 10 : 8}px sans-serif`; g.textAlign = "center";
      g.fillText(tp ? "🍄" : i + 1, x, y + (mine ? 4 : 3));
    });
    if (track.length) {
      // the track's number by its entrance
      const [c, r] = track[0];
      g.fillStyle = TRACK_COLORS[ti % TRACK_COLORS.length]; g.font = "bold 12px sans-serif"; g.textAlign = "center";
      g.fillText("T" + (ti + 1), c * TILE + 20, r * TILE + (r === 0 ? 46 : 2));
    }
  });
  ctx = saved;
  loadMap(prevMap);
}
function renderMaker() {
  const box = $("tabBody");
  box.innerHTML = `<div class="maker">
    <div class="maker-tools">
      <button data-tool="path" title="Click tiles to add corners to the track you're drawing">✏️ Draw track</button>
      <select id="edTrack" title="Which track you're drawing"></select>
      <button id="edNewTrack" title="Start another track with its own entrance">➕ New track</button>
      <button data-tool="portal" title="Your next click makes the bugs jump there through a mushroom ring">🍄 Portal</button>
      <span class="sep"></span>
      <button data-tool="addPond">💧 Add pond</button>
      <button data-tool="pond" title="Click a pond to pick it, then click somewhere to move it">✋ Move pond</button>
      <button data-tool="delPond">❌ Remove pond</button>
      <select id="edSize"><option value="small">Small pond</option><option value="medium">Medium pond</option><option value="large">Large pond</option></select>
    </div>
    <div class="maker-tools">
      <select id="edGoal"><option value="pond">Goal: a pond</option><option value="home">Goal: frog home</option><option value="exit">Goal: an exit</option></select>
      <label title="Track tiles in a pond become a log bridge: bugs on it slow to half speed"><input type="checkbox" id="edBridge"> 🪵 Log bridges</label>
      <label title="Flying bugs skip the track and fly straight at the goal"><input type="checkbox" id="edFly"> 🦋 Flyers fly straight</label>
      <span class="sep"></span>
      <button id="edUndo">↩️ Undo</button><button id="edClear">🗑️ Clear tracks</button>
    </div>
    <canvas id="edCanvas" width="800" height="480"></canvas>
    <small id="edHint"></small>
    <div class="maker-tools">
      <input id="edName" placeholder="Map name" maxlength="30">
      <span id="edRating" class="maker-rating"></span>
      <button id="edTest">▶ Test play</button><button id="edSave">💾 Save to Map Place</button>
    </div>
    <span id="edErr" class="acc-err"></span>
  </div>`;
  const cv = $("edCanvas");
  const say = (t) => { $("edErr").textContent = t; };
  const HINTS = {
    path: "Click tiles to add corners: start at the EDGE of the map (green dot), end at the goal (red dot). Corners line up automatically. ➕ New track adds another entrance.",
    portal: "🍄 Click where the bugs should pop out. They jump there from the last corner through a pair of mushroom rings.",
    addPond: "💧 Click to put a new pond there (it uses the pond size picked on the right).",
    pond: "✋ Click a pond to pick it (yellow ring), then click anywhere to move it there. The size box changes the picked pond.",
    delPond: "❌ Click a pond to remove it. A map always keeps at least 1 pond.",
  };
  const refresh = () => {
    for (const b of box.querySelectorAll("[data-tool]")) b.classList.toggle("on", b.dataset.tool === ed.tool);
    $("edTrack").innerHTML = ed.tracks.map((t, i) => `<option value="${i}">Track ${i + 1}${t.length ? "" : " (empty)"}</option>`).join("");
    $("edTrack").value = String(ed.cur);
    $("edSize").value = ed.tool === "pond" && ed.ponds[ed.pondSel] ? ed.ponds[ed.pondSel].size : ed.size;
    $("edGoal").value = ed.goal;
    $("edName").value = ed.name;
    $("edBridge").checked = ed.bridge;
    $("edFly").checked = ed.flyStraight;
    $("edHint").textContent = HINTS[ed.tool];
    const rating = edRating();
    $("edRating").textContent = rating ? `Difficulty: ${rating}/10 (${ratingLabel(rating)})` : "";
    drawEditor(cv);
  };
  for (const b of box.querySelectorAll("[data-tool]")) b.onclick = () => {
    if (b.dataset.tool === "portal" && ed.path.length < 2) return say("Draw at least one stretch of this track before adding a portal.");
    ed.tool = b.dataset.tool; say(""); refresh();
  };
  $("edTrack").onchange = (e) => { ed.cur = Number(e.target.value); ed.tool = "path"; refresh(); };
  $("edNewTrack").onclick = () => {
    if (ed.path.length < 2) return say("Finish this track first (at least 2 corners).");
    if (ed.tracks.length >= MAX_TRACKS) return say(`A map can have up to ${MAX_TRACKS} tracks.`);
    ed.tracks.push([]); ed.cur = ed.tracks.length - 1; ed.tool = "path";
    say(`Track ${ed.cur + 1}: click a tile on the edge of the map to start it.`);
    refresh();
  };
  $("edSize").onchange = (e) => {
    ed.size = e.target.value;
    if (ed.tool === "pond" && ed.ponds[ed.pondSel]) ed.ponds[ed.pondSel].size = ed.size;
    refresh();
  };
  $("edGoal").onchange = (e) => { ed.goal = e.target.value; refresh(); };
  $("edBridge").onchange = (e) => { ed.bridge = e.target.checked; refresh(); };
  $("edFly").onchange = (e) => { ed.flyStraight = e.target.checked; refresh(); };
  $("edName").oninput = (e) => { ed.name = e.target.value; };
  $("edUndo").onclick = () => {
    if (ed.path.length) ed.path.pop();
    else if (ed.tracks.length > 1) { ed.tracks.splice(ed.cur, 1); ed.cur = ed.tracks.length - 1; }
    if (ed.tool === "portal" && ed.path.length < 2) ed.tool = "path";
    refresh();
  };
  $("edClear").onclick = () => { ed.tracks = [[]]; ed.cur = 0; ed.tool = "path"; refresh(); };
  cv.onclick = (e) => {
    const t = edTile(e, cv);
    say("");
    if (ed.tool === "addPond") {
      if (ed.ponds.length >= MAX_PONDS) return say(`A map can have up to ${MAX_PONDS} ponds.`);
      ed.ponds.push({ x: t.x, y: t.y, size: ed.size });
      ed.pondSel = ed.ponds.length - 1;
      return refresh();
    }
    if (ed.tool === "pond") {
      const hit = edPondAt(t.x, t.y);
      if (hit >= 0 && hit !== ed.pondSel) ed.pondSel = hit; // pick a different pond
      else if (ed.ponds[ed.pondSel]) { ed.ponds[ed.pondSel].x = t.x; ed.ponds[ed.pondSel].y = t.y; }
      return refresh();
    }
    if (ed.tool === "delPond") {
      const hit = edPondAt(t.x, t.y);
      if (hit < 0) return say("Click on a pond to remove it.");
      if (ed.ponds.length === 1) return say("A map needs at least 1 pond.");
      ed.ponds.splice(hit, 1);
      ed.pondSel = 0;
      return refresh();
    }
    if (t.c < 0 || t.r < 0 || t.c >= COLS || t.r >= ROWS) return;
    if (ed.tool === "portal") {
      const [lc, lr] = ed.path.at(-1);
      if (lc === t.c && lr === t.r) return say("Put the portal's exit somewhere else.");
      ed.path.push([t.c, t.r, "tp"]);
      ed.tool = "path"; // keep drawing from where the bugs pop out
      return refresh();
    }
    if (!ed.path.length) {
      if (!onEdge(t.c, t.r)) return say("Start the track at the edge of the map.");
      ed.path.push([t.c, t.r]);
    } else {
      const [lc, lr] = ed.path.at(-1);
      if (lc === t.c && lr === t.r) return;
      if (lc !== t.c && lr !== t.r) ed.path.push([t.c, lr]); // add a corner so the track stays straight
      ed.path.push([t.c, t.r]);
    }
    refresh();
  };
  const built = () => {
    const res = buildCustomMap();
    if (res.errs) { say(res.errs.join(" ")); return null; }
    return res.map;
  };
  $("edTest").onclick = () => { const m = built(); if (m) startMap(m); };
  $("edSave").onclick = () => {
    const m = built();
    if (!m) return;
    const list = loadData("fpd_custom_maps", []);
    list.push(m);
    saveData("fpd_custom_maps", list);
    progress.flags.madeMap = true;
    checkAchievements();
    say(`✔ Saved "${m.name}" (difficulty ${m.rating}/10, ${m.difficulty}). Find it in the Map Place!`);
  };
  refresh();
}

// ---------- Map Place ----------
// Every custom map in one place (yours, and everyone's once online is switched on), sortable.
let placeSort = "hard";
let onlineMaps = null;
async function renderPlace() {
  const box = $("tabBody");
  box.innerHTML = `<div class="lb-controls">
      <label>Sort: <select id="plSort">
        <option value="hard">Hardest first</option><option value="easy">Easiest first</option>
        <option value="az">A – Z</option><option value="za">Z – A</option><option value="new">Newest</option>
      </select></label>
      ${online() ? "" : '<span class="tab-note">(only maps made on this computer: sharing online needs Firebase switched on)</span>'}
    </div><div id="plList" class="place-grid"></div>`;
  $("plSort").value = placeSort;
  $("plSort").onchange = (e) => { placeSort = e.target.value; drawList(); };
  const local = loadData("fpd_custom_maps", []).map((m) => ({ ...m, local: true }));
  if (online() && onlineMaps === null) {
    try { onlineMaps = (await fsList("maps")).map((x) => { try { return { ...JSON.parse(x.data), online: true }; } catch (e) { return null; } }).filter(Boolean); }
    catch (e) { onlineMaps = []; }
  }
  function drawList() {
    const ids = new Set();
    const all = [...(onlineMaps || []), ...local].filter((m) => (ids.has(m.id) ? false : ids.add(m.id)));
    const sorters = {
      hard: (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
      easy: (a, b) => a.rating - b.rating || a.name.localeCompare(b.name),
      az: (a, b) => a.name.localeCompare(b.name),
      za: (a, b) => b.name.localeCompare(a.name),
      new: (a, b) => (b.created || 0) - (a.created || 0),
    };
    all.sort(sorters[placeSort]);
    const list = $("plList");
    list.innerHTML = all.length ? "" : '<p class="tab-note">No custom maps yet. Make one in the 🛠️ Map Maker tab!</p>';
    const prevMap = currentMap;
    for (const m of all) {
      const card = document.createElement("div");
      card.className = "place-card";
      card.innerHTML = `<canvas width="200" height="120"></canvas>
        <b>${escapeHtml(m.name)} <span class="map-diff ${(m.difficulty || "").toLowerCase()}">${m.rating}/10 ${m.difficulty}</span></b>
        <small>by ${escapeHtml(m.author || "?")}${m.online ? " · 🌍 online" : " · 💾 this computer"}</small>
        <div class="place-btns"><button class="pl-play">▶ Play</button>${m.local && online() && !m.posted ? '<button class="pl-post">🌍 Post online</button>' : ""}${m.local ? '<button class="pl-del">🗑️</button>' : ""}</div>`;
      card.querySelector(".pl-play").onclick = () => startMap(m);
      const post = card.querySelector(".pl-post");
      if (post) post.onclick = async () => {
        post.disabled = true; post.textContent = "Posting...";
        try {
          const clean = { ...m }; delete clean.local; delete clean.online;
          await fsAdd("maps", { name: m.name, author: m.author, rating: m.rating, data: JSON.stringify(clean), created: m.created });
          const mine = loadData("fpd_custom_maps", []);
          for (const x of mine) if (x.id === m.id) x.posted = true;
          saveData("fpd_custom_maps", mine);
          onlineMaps = null;
          renderPlace();
        } catch (e) { post.textContent = "Couldn't post: " + e.message; }
      };
      const del = card.querySelector(".pl-del");
      if (del) del.onclick = () => askConfirm(`Delete "${m.name}" from this computer?`, () => {
        saveData("fpd_custom_maps", loadData("fpd_custom_maps", []).filter((x) => x.id !== m.id));
        renderPlace();
      });
      list.appendChild(card);
      drawMapThumb(m, card.querySelector("canvas"));
    }
    loadMap(prevMap);
  }
  drawList();
}

TABS.maker = renderMaker;
TABS.place = renderPlace;
TABS.lb = renderLeaderboard;

buildMenu();
renderMenuExtras();
checkAchievements(); // award anything already earned (like owning lots of frogs)

// =====================================================================
// ONLINE CO-OP
// Two players on different computers. The HOST's game runs everything; it sends the game to the
// GUEST about 20 times a second, and the guest's clicks are sent back to the host to do as Player 2.
// The two browsers talk directly using PeerJS (its free public server only helps them find each other).
// Ways to play: get a code/link to send to a friend, type a friend's code, or find a random player.
// =====================================================================
const NET_PREFIX = "frogpond-defense-v1-";
const NET_SLOTS = 8; // random matching: waiting rooms "mm-0" to "mm-7"
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function netLoadLib() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
    s.onload = res;
    s.onerror = () => rej(new Error("Couldn't load the online library. Check your internet."));
    document.head.appendChild(s);
  });
}
function netLive() { return !!(net.conn && net.conn.open); }
function netSend(m) { if (netLive()) try { net.conn.send(m); } catch (e) {} }
function partnerName() { return net.partner || "your partner"; }

// ---- menu status box ----
function netStatus(html) {
  net.status = html;
  const box = $("olStatus");
  if (box) box.innerHTML = html;
  const leave = $("olLeave");
  if (leave) leave.style.display = net.peer ? "block" : "none";
  for (const id of ["olRandom", "olHost", "olJoin"]) if ($(id)) $(id).disabled = !!net.peer;
}
// A peer with a chosen id (or a random one)
function netMakePeer(id) {
  return new Promise((res, rej) => {
    const p = id ? new Peer(id) : new Peer();
    let done = false;
    p.on("open", () => { done = true; res(p); });
    p.on("error", (e) => { if (!done) { done = true; try { p.destroy(); } catch (x) {} rej(e); } });
  });
}
async function netStart() {
  await netLoadLib();
  net.cancelled = false;
}

// ---- HOST: get a code / link ----
async function netHostCode() {
  try {
    netStatus("Getting a code...");
    await netStart();
    for (let tries = 0; tries < 5 && !net.peer; tries++) {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
      try { net.peer = await netMakePeer(NET_PREFIX + code); net.code = code; }
      catch (e) { if (e.type !== "unavailable-id") throw e; }
    }
    if (!net.peer) throw new Error("Couldn't get a code. Try again.");
    netBecomeHost();
    netShowCode();
  } catch (e) { netFail(e); }
}
function netLink() { return location.origin + location.pathname + "?join=" + net.code; }
function netShowCode() {
  netStatus(`Send this to a friend:<div class="ol-code">${net.code}</div>
    <div class="ol-link"><input readonly value="${netLink()}"><button id="olCopy">📋 Copy link</button></div>
    <small>Waiting for them to join...</small>`);
  $("olCopy").onclick = () => {
    const done = () => { $("olCopy").textContent = "✔ Copied!"; };
    if (navigator.clipboard) navigator.clipboard.writeText(netLink()).then(done, () => {});
    else { const i = $("olStatus").querySelector("input"); i.select(); document.execCommand("copy"); done(); }
  };
}
function netBecomeHost() {
  net.role = "host";
  net.peer.on("connection", netAccept);
  net.peer.on("disconnected", () => { try { net.peer.reconnect(); } catch (e) {} });
}
function netAccept(conn) {
  // Already playing with someone: tell the new player this room is busy
  if (net.conn) {
    conn.on("open", () => { conn.send({ t: "busy" }); setTimeout(() => conn.close(), 500); });
    return;
  }
  net.conn = conn;
  conn.on("open", () => conn.send({ t: "welcome", name: playerName(), v: GAME_VERSION }));
  conn.on("data", (m) => { if (net.conn === conn) netOnData(m); });
  conn.on("close", () => { if (net.conn === conn) netLost(); });
}

// ---- GUEST: join with a code ----
async function netJoinCode(code) {
  code = String(code || "").trim().toUpperCase();
  if (code.length !== 5) return netStatus("Type the 5-letter code your friend sent you.");
  try {
    netStatus(`Joining ${code}...`);
    await netStart();
    net.peer = await netMakePeer();
    const r = await netTryJoin(NET_PREFIX + code);
    if (r === "busy") throw new Error("That game already has 2 players.");
    if (r === "none") throw new Error(`No game found with the code ${code}. Check it and try again.`);
  } catch (e) { netFail(e); }
}
// Try to join whoever has that id: resolves "ok", "busy" or "none"
function netTryJoin(id) {
  return new Promise((res) => {
    const conn = net.peer.connect(id, { reliable: true });
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      net.peer.off("error", onErr);
      if (r !== "ok") try { conn.close(); } catch (e) {}
      res(r);
    };
    const onErr = (e) => { if (e.type === "peer-unavailable") finish("none"); };
    net.peer.on("error", onErr);
    const timer = setTimeout(() => finish("none"), 8000);
    conn.on("data", (m) => {
      if (net.conn === conn) return netOnData(m);
      if (m.t === "welcome") {
        net.conn = conn;
        net.role = "guest";
        net.partner = m.name;
        conn.send({ t: "hi", name: playerName() });
        conn.on("close", () => { if (net.conn === conn) netLost(); });
        finish("ok");
        if (m.v !== GAME_VERSION) showToast("⚠️ Different versions", "You and your partner have different game versions. Refresh the page if things look wrong.");
        netConnected();
      } else if (m.t === "busy") finish("busy");
    });
  });
}

// ---- RANDOM: find someone else who's searching ----
// Each waiting room can hold one waiting player. Searching tries to join a waiting player first;
// if a room is empty, you wait in it until someone else searches.
async function netFindRandom() {
  try {
    netStatus("🔀 Looking for a random player...");
    await netStart();
    net.peer = await netMakePeer();
    for (let n = 0, grabs = 0; n < NET_SLOTS; n++) {
      if (net.cancelled) return;
      const id = NET_PREFIX + "mm-" + n;
      netStatus(`🔀 Looking for a random player... (room ${n + 1} of ${NET_SLOTS})`);
      const r = await netTryJoin(id);
      if (net.cancelled) return;
      if (r === "ok") return;
      if (r === "none") {
        // Nobody waiting here: wait here ourselves
        try {
          const host = await netMakePeer(id);
          net.peer.destroy();
          net.peer = host;
          net.code = null;
          netBecomeHost();
          netStatus("🔀 Waiting for another player to search... <small>(this can take a while: you can also send a friend a code)</small>");
          return;
        } catch (e) {
          if (e.type !== "unavailable-id" || ++grabs > 3) throw e;
          n--; // someone grabbed the room just now: try joining them instead
        }
      }
    }
    throw new Error("Every room is busy right now. Try again in a minute!");
  } catch (e) { netFail(e); }
}

// ---- connected / lost / leave ----
function netConnected() {
  sfx("coin");
  showToast("🌐 Online Co-op", `Connected with ${partnerName()}!`);
  if (net.role === "host") {
    netStatus(`✅ Playing with <b>${escapeHtml(partnerName())}</b>! Pick a difficulty and a map to start. <small>(Challenges are 1-player.)</small>`);
    if (!inMenu) { coop = true; money2 = Math.max(money2, 120); netSendStart(); updateUI(); }
  } else {
    netStatus(`✅ Playing with <b>${escapeHtml(partnerName())}</b>! Waiting for them to pick a map...`);
  }
}
function netLost() {
  const was = net.role;
  netReset();
  showToast("🌐 Online Co-op", `${partnerName()} left the online game.`);
  netStatus("The online game ended.");
  if (was === "host") {
    // Your partner's frogs stay and keep fighting: they're yours now
    for (const f of frogs) f.owner = 1;
    money += money2;
    money2 = 0;
    coop = false;
    if (!inMenu) showMsg("🌐 Your partner left. Their frogs (and flies) are yours now!");
    updateUI();
  } else if (!inMenu) {
    resetGame();
    showMenu();
  }
}
function netReset() {
  const peer = net.peer, conn = net.conn;
  Object.assign(net, { role: null, peer: null, conn: null, code: null, cancelled: true });
  try { if (conn) conn.close(); } catch (e) {}
  try { if (peer) peer.destroy(); } catch (e) {}
  coop = false;
}
function netLeave() {
  const wasGuest = net.role === "guest";
  netReset();
  net.partner = null;
  netStatus("");
  if (wasGuest && !inMenu) { resetGame(); showMenu(); }
}
function netFail(e) {
  netReset();
  const why = e.type === "network" || e.type === "server-error" || e.type === "socket-error"
    ? "Couldn't reach the online server. Check your internet and try again." : e.message || String(e);
  netStatus("❌ " + escapeHtml(why));
}

// ---- messages ----
function netOnData(m) {
  if (typeof m === "string") m = JSON.parse(m);
  if (net.role === "host") {
    if (m.t === "hi") {
      net.partner = String(m.name || "Player 2").slice(0, 30);
      netConnected();
    } else if (m.a) netHostAction(m);
  } else {
    if (m.t === "start") netGuestStart(m);
    else if (m.t === "snap") netApplySnap(m);
    else if (m.t === "msg") { showMsg(m.text); }
    else if (m.t === "lobby") {
      if (!inMenu) { closePanel(); showMenu(); }
      netStatus(`✅ Playing with <b>${escapeHtml(partnerName())}</b>! Waiting for them to pick a map...`);
    }
  }
}
// HOST: what the guest asked for, done as Player 2 (messages go back to the guest)
function netHostAction(m) {
  if (inMenu) return;
  const keep = showMsg;
  showMsg = (text) => netSend({ t: "msg", text });
  try {
    p2.c = m.c; p2.r = m.r;
    const f = frogs.find((x) => x.c === m.c && x.r === m.r);
    if (m.a === "place") { if (TOWERS[m.type]) { p2.type = m.type; p2Key("f"); } }
    else if (m.a === "up") p2Key("rty"[m.p]);
    else if (m.a === "sell") p2Key("h");
    else if (m.a === "ab") { if (f && f.owner === 2) useAbility(f); }
    else if (m.a === "tgt") { if (f && f.owner === 2) f.targeting = TARGET_ORDER[(TARGET_ORDER.indexOf(targetMode(f)) + 1) % TARGET_ORDER.length]; }
    else if (m.a === "start") { showMsg = keep; startBtn.onclick(); }
    else if (m.a === "pause") togglePause();
    else if (m.a === "speed") speedBtn.onclick();
  } finally { showMsg = keep; }
  updateUI();
}
function netSendStart() {
  netSend({ t: "start", map: currentMap.custom ? currentMap : MAPS.indexOf(currentMap), difficulty, weather: activeWeather });
}
// The game, made safe to send: no links between objects, and shorter numbers
function netClean(key, v) {
  if (key === "route" || key === "src" || key === "poisonSrc") return undefined;
  if (key === "target" && v && typeof v === "object") return { x: Math.round(v.x), y: Math.round(v.y) };
  if (typeof v === "number" && !Number.isInteger(v)) return Math.round(v * 100) / 100;
  return v;
}
let netFrame = 0, netLastMsg = "";
function netTick() {
  if (net.role !== "host" || !netLive() || inMenu) return;
  const msg = $("msg").textContent;
  if (msg !== netLastMsg) { netLastMsg = msg; netSend({ t: "msg", text: msg }); }
  if (++netFrame % 3) return;
  netSend(JSON.stringify({
    t: "snap", round, lives, money, money2, ra: roundActive, go: gameOver, won, fp: freeplay, speed, paused,
    frogs, bugs, shots, effects, pads: [...pads], tunnel: tunnel && { x: tunnel.x, y: tunnel.y },
  }, netClean));
}

// ---- GUEST side ----
function netGuestStart(m) {
  difficulty = m.difficulty;
  challenge = null;
  activeWeather = m.weather || {};
  loadMap(typeof m.map === "object" ? m.map : MAPS[m.map] || MAPS[0]);
  resetGame();
  coop = true;
  progress.stats.games++;
  updateShopLocks();
  setMenuOpen(false);
  showMsg(`🌐 Online co-op with ${partnerName()}! You have your own flies, and the lives are shared.`);
  updateUI();
}
function netApplySnap(s) {
  const wasActive = roundActive, oldRound = round;
  ({ round, lives, money, money2, won, speed, paused } = s);
  roundActive = s.ra; gameOver = s.go; freeplay = s.fp;
  frogs = s.frogs; bugs = s.bugs; effects = s.effects;
  shots = s.shots; pads = new Set(s.pads); tunnel = s.tunnel;
  for (const b of bugs) progress.seen[b.tier] = true;
  // keep your open upgrade menu on the same frog
  if (picked) {
    const same = frogs.find((f) => f.c === picked.c && f.r === picked.r);
    const changed = !same || same.tiers.join() !== picked.tiers.join() || same.targeting !== picked.targeting;
    picked = same || null;
    if (changed) buildPanel();
  }
  $("pauseBtn").textContent = paused ? "▶ Resume" : "⏸ Pause";
  speedBtn.textContent = `Speed: ${speed}x`;
  // a new round: warn about new bosses
  if (round > oldRound && roundActive) {
    const debut = getRound(round).filter(([t, , when]) => BUG_TYPES[t].boss && when === "end");
    if (debut.length) showBossPopup(debut.map(([t]) => t));
  }
  // a round cleared: you earn your own tokens too
  if (wasActive && !roundActive && (won || !gameOver)) {
    progress.stats.rounds++;
    if (won) { progress.stats.wins++; progress.flags.coopWin = true; checkAchievements(); }
    showMsg(`Round ${round} cleared!` + roundTokens());
  }
  updateUI();
}

// ---- hooking the online game into the rest of the game ----
{
  const hostStart = startBtn.onclick;
  startBtn.onclick = () => {
    if (net.role === "guest") return netSend({ a: "start" });
    hostStart();
  };
  $("pauseBtn").onclick = () => (net.role === "guest" ? netSend({ a: "pause" }) : togglePause());
  const speedClick = speedBtn.onclick;
  speedBtn.onclick = () => (net.role === "guest" ? netSend({ a: "speed" }) : speedClick());
  $("restartBtn").onclick = () => (net.role === "guest" ? showMsg("Only the host can restart the game.") : restartGame());
  $("menuBtn").onclick = () => (net.role === "guest"
    ? askConfirm(`Leave the online game with ${partnerName()}?`, netLeave)
    : askIfPlaying("Leave this game and go back to the menu? (Your last finished round is saved.)", showMenu));
  const contClick = $("continueBtn").onclick;
  $("continueBtn").onclick = () => (net.role === "guest" ? showToast("🌐 Online Co-op", "Your partner (the host) picks the game.") : contClick());
  // the guest can't start games; the host can't play challenges online
  const realStartMap = startMap;
  startMap = function (i, ch) {
    if (net.role === "guest") return showToast("🌐 Online Co-op", "Your partner (the host) picks the map.");
    if (ch && netLive()) return showToast("🌐 Online Co-op", "Challenges are 1-player. Leave online co-op first.");
    realStartMap(i, ch);
  };
  // when the host starts a game, the guest's game starts too (and goes back to the menu with them)
  const realMenuOpen = setMenuOpen;
  setMenuOpen = function (open) {
    realMenuOpen(open);
    if (net.role !== "host" || !netLive()) return;
    if (open) netSend({ t: "lobby" });
    else { coop = true; netSendStart(); updateUI(); }
  };
  $("onlineBtn").onclick = () => {
    const box = $("onlineBox");
    box.style.display = box.style.display === "none" ? "flex" : "none";
  };
  $("olRandom").onclick = netFindRandom;
  $("olHost").onclick = netHostCode;
  $("olJoin").onclick = () => netJoinCode($("olCode").value);
  $("olCode").onkeydown = (e) => { if (e.key === "Enter") netJoinCode($("olCode").value); };
  $("olLeave").onclick = () => (net.role === "guest" && !inMenu ? askConfirm("Leave the online game?", netLeave) : netLeave());
  // Opened from a friend's link: join their game straight away
  const joinCode = typeof location !== "undefined" && location.search && new URLSearchParams(location.search).get("join");
  if (joinCode) {
    $("onlineBox").style.display = "flex";
    $("olCode").value = joinCode.toUpperCase();
    if (history.replaceState) history.replaceState(null, "", location.pathname);
    netJoinCode(joinCode);
  }
}

// ---------- Main loop ----------
function loop() {
  if (net.role === "guest") { draw(); requestAnimationFrame(loop); return; } // the host runs the game
  if (!inMenu && !paused && !gameOver) progress.stats.frames++;
  if (!gameOver && !inMenu && !paused) {
    for (let i = 0; i < speed; i++) {
      if (roundActive) step();
      else {
        for (const f of frogs) if (f.tongue && --f.tongue.life <= 0) f.tongue = null;
        autoStartTick();
      }
    }
  }
  netTick();
  draw();
  requestAnimationFrame(loop);
}

updateUI();
loop();
