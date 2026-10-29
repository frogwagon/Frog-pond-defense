// Frog Pond Defense - a simple tower defense game.
// Frogs and tadpoles are the towers, bugs are the enemies. Survive 10 rounds!

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
    name: "Frog Home", difficulty: "Hard",
    desc: "Bugs march around a big pond to reach the frogs' home. Yellow Jackets fly straight across the water!",
    pond: { x: 360, y: 250, rx: 200, ry: 135 },
    path: [[0, 10], [1, 10], [1, 1], [18, 1], [18, 6], [16, 6]],
    goal: "home", flyStraight: true, reedGap: null, seed: 21,
    lilyPads: [
      { x: 290, y: 200, r: 18 }, { x: 420, y: 300, r: 22 }, { x: 470, y: 190, r: 14 },
      { x: 250, y: 310, r: 13 }, { x: 360, y: 250, r: 11 }, { x: 510, y: 270, r: 12 },
    ],
  },
];

// The current map's layout (filled in by loadMap)
let currentMap, POND, PATH_TILES, waypoints, pathSet, decorations, reeds, lilyPads;

function inPond(x, y) {
  const dx = (x - POND.x) / POND.rx, dy = (y - POND.y) / POND.ry;
  return dx * dx + dy * dy <= 1;
}

function loadMap(map) {
  currentMap = map;
  POND = map.pond;
  PATH_TILES = map.path;
  waypoints = PATH_TILES.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));

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
}
loadMap(MAPS[0]);

// ---------- Bugs (3 tiers + 2 bosses) ----------
const BUG_TYPES = {
  1: { name: "Gnat",        hp: 30,   speed: 1.4,  reward: 5,   lifeCost: 1,  color: "#333333", size: 8 },
  2: { name: "Beetle",      hp: 110,  speed: 0.8,  reward: 12,  lifeCost: 2,  color: "#8b4513", size: 12 },
  3: { name: "Hornet",      hp: 220,  speed: 1.6,  reward: 25,  lifeCost: 4,  color: "#f2c200", size: 13 },
  4: { name: "Stag Beetle", hp: 1500, speed: 0.4,  reward: 150, lifeCost: 10, color: "#4a2c17", size: 20, boss: true },
  // Tier 2 boss: fast and tanky, and it flies across the corners (cornerCut = how early it turns, in pixels)
  5: { name: "Yellow Jacket", hp: 2500, speed: 1.8, reward: 250, lifeCost: 12, color: "#ffcc00", size: 16, boss: true, cornerCut: 130, flies: true },
};

// What spawns each round: [tier, count] groups. Tier 4 = Stag Beetle boss.
const ROUNDS = [
  [[1, 10]],
  [[1, 15]],
  [[1, 12], [2, 3]],
  [[2, 8]],
  [[1, 20], [2, 6], [4, 1]],          // first boss!
  [[2, 10], [3, 2]],
  [[1, 25], [3, 4]],
  [[2, 15], [3, 6], [4, 1]],
  [[3, 12]],
  [[1, 30], [2, 15], [3, 15], [4, 2]], // two bosses
];

// Rounds 11-50 are made by a formula: more bugs each round, tougher mixes,
// and Stag Beetle bosses every 5 rounds (more of them later on).
for (let r = 11; r <= 50; r++) {
  const groups = [
    [1, 10 + r],                // gnats
    [2, Math.floor(r * 0.7)],   // beetles
    [3, Math.floor(r * 0.5)],   // hornets
  ];
  if (r % 5 === 0) groups.push([4, Math.floor(r / 10) + (r === 50 ? 3 : 0)]); // round 50 is the final boss wave
  ROUNDS.push(groups);
}

// Round 15: the Yellow Jacket boss arrives with a swarm of hornets
ROUNDS[14] = [[3, 20], [5, 1]];

// Boss names for messages, e.g. "A Yellow Jacket" or "2 Stag Beetles"
function bossList(groups) {
  return groups
    .filter(([t]) => BUG_TYPES[t].boss)
    .map(([t, n]) => (n > 1 ? `${n} ${BUG_TYPES[t].name}s` : `a ${BUG_TYPES[t].name}`))
    .join(" and ");
}

// Flies you get for squashing a bug. Later rounds have lots of bugs, so each one pays a bit less.
function rewardFor(tier) {
  const late = Math.max(0, round - 10);
  return Math.max(1, Math.round(BUG_TYPES[tier].reward / (1 + late * REWARD_DROP)));
}
const REWARD_DROP = 0.04;
const LATE_HP = 0.008;

// How much tougher bugs are in a given round
function hpScale(r) {
  const late = Math.max(0, r - 10);
  return 1 + (r - 1) * 0.1 + late * late * LATE_HP; // grows much faster after round 10
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
    name: "Tadpole", cost: 80, damage: 6, range: 170, cooldown: 14,
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
};
const SHOP_BUTTONS = { frog: "shopFrog", tadpole: "shopTadpole", dartfrog: "shopDart", bullfrog: "shopBull" };

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
  return {
    damage: base.damage * PATHS[1].mult[f.tiers[1]],
    range: base.range * PATHS[2].mult[f.tiers[2]],
    cooldown: Math.max(2, Math.round(base.cooldown * PATHS[0].mult[f.tiers[0]] * (f.frenzy > 0 ? 0.25 : 1))),
  };
}

// Which path is at tier 4 (that path's ability is unlocked). -1 if none.
function abilityPath(f) { return f.tiers.indexOf(4); }

// Upgrade rule: max tier 4, and only one path can go past tier 2.
function upgradeBlocked(f, p) {
  if (f.tiers[p] >= 4) return "Maxed!";
  if (f.tiers[p] >= 2 && f.tiers.some((t, i) => i !== p && t > 2)) return "Locked (another path is past tier 2)";
  return null;
}
function upgradeCost(f, p) { return TOWERS[f.type].upgradeCosts[f.tiers[p]]; }
function sellValue(f) { return Math.floor(f.spent * 0.7); }

// Frogs go on grass, tadpoles go in the pond. Nothing goes on the path.
function canPlace(type, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  if (pathSet.has(c + "," + r)) return false;
  const wet = inPond(c * TILE + TILE / 2, r * TILE + TILE / 2);
  return type === "tadpole" ? wet : !wet;
}

// ---------- Difficulties ----------
// Picked in the start menu: how many lives you start with and how many rounds you must survive.
const DIFFICULTIES = {
  easy:   { name: "Easy",   lives: 50, rounds: 25 },
  medium: { name: "Medium", lives: 60, rounds: 40 },
  hard:   { name: "Hard",   lives: 30, rounds: 50 },
};
let difficulty = "easy";
function totalRounds() { return DIFFICULTIES[difficulty].rounds; }

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
  $("round").textContent = `${round} / ${totalRounds()} (${DIFFICULTIES[difficulty].name})`;
  $("lives").textContent = lives;
  $("money").textContent = money;
  startBtn.disabled = roundActive || gameOver;
  startBtn.textContent = round >= totalRounds() ? "All rounds done" : `Start Round ${round + 1}`;
  refreshPanel();
  refreshAbilityBar();
}

function showMsg(text) { $("msg").textContent = text; }

startBtn.onclick = () => {
  if (inMenu || roundActive || gameOver || round >= totalRounds()) return;
  round++;
  roundActive = true;
  spawnQueue = [];
  const groups = ROUNDS[round - 1];
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
  spawnTimer = 0;
  const bossRound = ROUNDS[round - 1].some(([tier]) => BUG_TYPES[tier].boss);
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
  round = 0;
  roundActive = false;
  gameOver = false;
  frogs = [];
  bugs = [];
  spawnQueue = [];
  spawnTimer = 0;
  shots = [];
  effects = [];
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
    btn.innerHTML = `<b>${d.name}</b><small>${d.lives} lives · ${d.rounds} rounds</small>`;
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
function selectTower(type) {
  selected = type;
  closePanel();
  for (const [t, id] of Object.entries(SHOP_BUTTONS)) {
    $(id).className = "shopItem" + (t === type ? " selected" : "");
  }
  const name = TOWERS[type].name.toLowerCase();
  showMsg(type === "tadpole" ? "Click the pond to place a tadpole" : `Click the grass to place a ${name}`);
}
for (const [t, id] of Object.entries(SHOP_BUTTONS)) $(id).onclick = () => selectTower(t);
document.addEventListener("keydown", (e) => {
  if (e.key === "1") selectTower("frog");
  if (e.key === "2") selectTower("tadpole");
  if (e.key === "3") selectTower("dartfrog");
  if (e.key === "4") selectTower("bullfrog");
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
      const p = PATHS[abilityPath(f)];
      const btn = document.createElement("button");
      btn.className = "ab-btn";
      btn.style.borderColor = p.color;
      btn.innerHTML = `<span class="ab-name">${p.icon} ${p.ability}</span>
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
    if (abilityPath(f) >= 0 && f.abilityCd === 0 && bugsInRange(f, towerStats(f).range).length) useAbility(f);
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
  PATHS.forEach((p, i) => {
    const t = f.tiers[i];
    const pips = "●".repeat(t) + "○".repeat(4 - t);
    const blocked = upgradeBlocked(f, i);
    const label = blocked || `Tier ${t + 1}: ${p.tiers[t]} – ${upgradeCost(f, i)}`;
    const tip = t === 3 ? `Unlocks ${p.ability}: ${p.abilityInfo}` : "";
    html += `<div class="tp-path">
      <div class="tp-name" style="color:${p.color}"><span>${p.icon} ${p.name}</span><span>${pips}</span></div>
      <button class="tp-buy" title="${tip}">${label}</button>
    </div>`;
  });
  const ap = abilityPath(f);
  if (ap >= 0) html += `<button class="tp-ability" title="${PATHS[ap].abilityInfo}"></button>`;
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
  panelRefs.stats.textContent =
    `Damage ${Math.round(s.damage)} · Range ${Math.round(s.range)} · ${(60 / s.cooldown).toFixed(1)} attacks/sec`;
  panelRefs.buys.forEach((b, i) => { b.disabled = !!upgradeBlocked(f, i) || money < upgradeCost(f, i); });
  if (panelRefs.ability) {
    const p = PATHS[abilityPath(f)];
    panelRefs.ability.disabled = f.abilityCd > 0;
    panelRefs.ability.textContent = f.abilityCd > 0
      ? `${p.ability} recharging (${Math.ceil(f.abilityCd / 60)}s)`
      : `★ USE ${p.ability.toUpperCase()}!`;
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
  showMsg(f.tiers[p] === 4 ? `${PATHS[p].ability} unlocked! Use it from this menu.` : `${PATHS[p].name} upgraded!`);
  buildPanel();
  updateUI();
}

function sellTower(f) {
  money += sellValue(f);
  frogs = frogs.filter((x) => x !== f);
  closePanel();
  updateUI();
}

// ---------- Super attacks (tier 4 abilities) ----------
function bugsInRange(f, range) {
  // A bug counts as in range when any part of its body is inside the range circle
  return bugs.filter((b) => b.hp > 0 && !b.escaped && Math.hypot(b.x - f.x, b.y - f.y) - BUG_TYPES[b.tier].size <= range);
}

function useAbility(f) {
  const p = abilityPath(f);
  if (p < 0 || f.abilityCd > 0) return;
  const s = towerStats(f);
  const targets = bugsInRange(f, s.range);

  if (p === 0) {
    // Frenzy: attack super fast for a while
    f.frenzy = FRENZY_TIME;
    effects.push({ kind: "ring", x: f.x, y: f.y, from: 10, to: 60, color: PATHS[0].color, life: 30, max: 30 });
  } else {
    if (targets.length === 0) return showMsg("No bugs in range!");
    if (p === 1) {
      // Mega Strike: one huge hit on the toughest bug
      const big = targets.reduce((a, b) => (b.hp > a.hp ? b : a));
      big.hp -= s.damage * 25;
      effects.push({ kind: "beam", x: f.x, y: f.y, x2: big.x, y2: big.y, color: PATHS[1].color, life: 25, max: 25 });
      effects.push({ kind: "ring", x: big.x, y: big.y, from: 5, to: 50, color: PATHS[1].color, life: 25, max: 25 });
    } else {
      // Shockwave: hit every bug in range
      for (const b of targets) b.hp -= s.damage * 6;
      effects.push({ kind: "ring", x: f.x, y: f.y, from: 10, to: s.range, color: PATHS[2].color, life: 35, max: 35 });
    }
  }
  f.abilityCd = ABILITY_COOLDOWN;
  showMsg(`${PATHS[p].ability}!`);
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
    return showMsg(selected === "tadpole" ? "Tadpoles can only go in the pond!" : `${tower.name}s go on the grass!`);
  }
  if (money < tower.cost) return showMsg(`A ${tower.name.toLowerCase()} costs ${tower.cost}`);
  money -= tower.cost;
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
  const route = t.flies && currentMap.flyStraight ? [waypoints.at(-1)] : waypoints;
  bugs.push({
    tier, x: waypoints[0].x - TILE, y: waypoints[0].y, route,
    wp: 0, hp: t.hp * scale, maxHp: t.hp * scale,
    speed: t.speed, wobble: Math.random() * 10, angle: 0,
  });
  if (t.boss) showMsg(`⚠️ The ${t.name} has arrived!`);
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

  // Move bugs along their route (the path, or a straight line for some flyers)
  for (const b of bugs) {
    const route = b.route || waypoints;
    const target = route[b.wp];
    const dx = target.x - b.x, dy = target.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) b.angle = Math.atan2(dy, dx);
    // Flying bosses cut corners: they turn toward the next corner early
    const cut = BUG_TYPES[b.tier].cornerCut || 0;
    if (cut && dist < cut && b.wp < route.length - 1) {
      b.wp++;
    } else if (dist < b.speed) {
      b.x = target.x; b.y = target.y;
      b.wp++;
      if (b.wp >= route.length) {
        b.escaped = true;
        lives -= BUG_TYPES[b.tier].lifeCost;
      }
    } else {
      b.x += (dx / dist) * b.speed;
      b.y += (dy / dist) * b.speed;
    }
    b.wobble += 0.3;
  }

  // Frogs attack with their tongues, tadpoles shoot water
  for (const f of frogs) {
    if (f.abilityCd > 0) f.abilityCd--;
    if (f.frenzy > 0) f.frenzy--;
    if (f.tongue) { f.tongue.life--; if (f.tongue.life <= 0) f.tongue = null; }
    if (f.cooldown > 0) { f.cooldown--; continue; }

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
        best.hp -= stats.damage;
        f.tongue = { x: best.x, y: best.y, life: 8 };
        if (f.type === "bullfrog") {
          // Big slap: a thump ring where it lands
          effects.push({ kind: "ring", x: best.x, y: best.y, from: 6, to: 26, color: "#e8d36a", life: 14, max: 14 });
        }
      }
    }
  }

  // Poisoned bugs keep taking damage
  for (const b of bugs) {
    if (b.poisonTime > 0) {
      b.hp -= b.poisonDmg;
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
      b.hp -= s.damage;
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
    showMsg("💀 The bugs reached the pond. Game over! Press Restart to try again.");
  }

  // Round complete check
  if (roundActive && spawnQueue.length === 0 && bugs.length === 0) {
    roundActive = false;
    shots = [];
    money += 25 + round * 5; // end-of-round bonus
    if (round >= totalRounds()) {
      gameOver = true;
      showMsg(`🏆 You beat ${DIFFICULTIES[difficulty].name}! The frogs are safe!`);
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
    ctx.moveTo(waypoints[0].x - TILE, waypoints[0].y);
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
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("➜", 4, waypoints[0].y + 6);

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

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);

  // Body (bullfrogs are bigger, with a pale yellow throat)
  ctx.fillStyle = towerColor(f);
  ctx.beginPath();
  ctx.ellipse(0, 0, bull ? 18 : 15, bull ? 16 : 13, 0, 0, Math.PI * 2);
  ctx.fill();
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
  const eyeX = bull ? 6 : 8, eyeY = bull ? 11 : 8;
  for (const side of [-1, 1]) {
    ctx.fillStyle = bull ? "#e0b030" : "white";
    ctx.beginPath();
    ctx.arc(eyeX, side * eyeY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(eyeX + 2, side * eyeY, 2.5, 0, Math.PI * 2);
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

// The tier 2 boss: a big, fast yellow jacket with striped body and buzzing wings
function drawYellowJacket(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

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
  ctx.fillStyle = "#ffcc00";
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
  ctx.fillStyle = "#ffcc00";
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

  drawBossHealth(b, 30);
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

function drawBug(b) {
  const t = BUG_TYPES[b.tier];
  if (b.tier === 4) return drawStagBeetle(b);
  if (b.tier === 5) return drawYellowJacket(b);
  const s = t.size;

  // Wings for hornets and gnats
  if (b.tier !== 2) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    const flap = Math.sin(b.wobble) * 3;
    ctx.beginPath();
    ctx.ellipse(b.x - 3, b.y - s + flap, s * 0.6, s * 0.35, -0.5, 0, Math.PI * 2);
    ctx.ellipse(b.x + 3, b.y - s - flap, s * 0.6, s * 0.35, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legs for beetles
  if (b.tier === 2) {
    ctx.strokeStyle = "#3b1d0a";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      const wig = Math.sin(b.wobble + i) * 3;
      ctx.beginPath();
      ctx.moveTo(b.x - s - 3, b.y + i * 6 + wig);
      ctx.lineTo(b.x + s + 3, b.y + i * 6 - wig);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // Body
  ctx.fillStyle = t.color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, s, 0, Math.PI * 2);
  ctx.fill();

  // Hornet stripes
  if (b.tier === 3) {
    ctx.fillStyle = "#222";
    ctx.fillRect(b.x - s + 3, b.y - 2, (s - 3) * 2, 3);
    ctx.fillRect(b.x - s + 5, b.y + 5, (s - 5) * 2, 3);
  }

  // Health bar
  const w = 24;
  ctx.fillStyle = "#400";
  ctx.fillRect(b.x - w / 2, b.y - s - 8, w, 4);
  ctx.fillStyle = "#4caf50";
  ctx.fillRect(b.x - w / 2, b.y - s - 8, w * Math.max(0, b.hp / b.maxHp), 4);
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
      ctx.lineWidth = 10 * k + 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    }
    e.life--;
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  effects = effects.filter((e) => e.life > 0);
}

function draw() {
  drawMap();
  for (const b of bugs) drawBug(b);
  for (const b of bugs) if (b.poisonTime > 0) drawPoison(b);
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
  drawFrog({ type, x: 20, y: 20, tiers: [0, 0, 0], angle: -Math.PI / 2, tongue: null, abilityCd: 0, frenzy: 0 });
  ctx = saved;
}
drawShopIcon("iconFrog", "frog");
drawShopIcon("iconTadpole", "tadpole");
drawShopIcon("iconDart", "dartfrog");
drawShopIcon("iconBull", "bullfrog");

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
