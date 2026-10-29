// Frog Pond Defense - a simple tower defense game.
// Frogs and tadpoles are the towers, bugs are the enemies. Survive 10 rounds!

const canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");
const TILE = 40;
const COLS = canvas.width / TILE;  // 20
const ROWS = canvas.height / TILE; // 12

// The pond sits in the middle of the map. Bugs want to reach it.
const POND = { x: 400, y: 240, rx: 150, ry: 90 };
function inPond(x, y) {
  const dx = (x - POND.x) / POND.rx, dy = (y - POND.y) / POND.ry;
  return dx * dx + dy * dy <= 1;
}

// The path loops all the way around the pond, then heads into the water.
const PATH_TILES = [
  [0, 2], [16, 2], [16, 10], [3, 10], [3, 6], [6, 6],
];
const waypoints = PATH_TILES.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));

// Mark every tile on the path so towers can't be placed there.
const pathSet = new Set();
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
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const decorations = [];
for (let i = 0; i < 160; i++) {
  const x = rand() * canvas.width, y = rand() * canvas.height;
  const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
  if (pathSet.has(c + "," + r) || inPond(x, y)) continue;
  const roll = rand();
  decorations.push({ x, y, kind: roll < 0.7 ? "grass" : roll < 0.88 ? "flower" : "rock", hue: rand() });
}
const reeds = [];
for (let a = 0; a < Math.PI * 2; a += 0.35) {
  if (Math.abs(a - Math.PI) < 0.4) continue; // leave a gap where the path enters the pond
  reeds.push({ x: POND.x + Math.cos(a) * (POND.rx + 4), y: POND.y + Math.sin(a) * (POND.ry + 4), lean: rand() - 0.5 });
}
const lilyPads = [
  { x: 360, y: 210, r: 16 }, { x: 450, y: 270, r: 20 }, { x: 480, y: 200, r: 13 },
  { x: 320, y: 280, r: 12 }, { x: 410, y: 300, r: 10 },
];

// ---------- Bugs (3 tiers + a boss) ----------
const BUG_TYPES = {
  1: { name: "Gnat",        hp: 30,   speed: 1.4,  reward: 5,   lifeCost: 1,  color: "#333333", size: 8 },
  2: { name: "Beetle",      hp: 110,  speed: 0.8,  reward: 12,  lifeCost: 2,  color: "#8b4513", size: 12 },
  3: { name: "Hornet",      hp: 220,  speed: 1.6,  reward: 25,  lifeCost: 4,  color: "#f2c200", size: 13 },
  4: { name: "Stag Beetle", hp: 1500, speed: 0.4,  reward: 150, lifeCost: 10, color: "#4a2c17", size: 20, boss: true },
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
};

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

// ---------- Game state ----------
let money = 120;
let lives = 20;
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
  $("round").textContent = `${round} / ${ROUNDS.length}`;
  $("lives").textContent = lives;
  $("money").textContent = money;
  startBtn.disabled = roundActive || gameOver;
  startBtn.textContent = round >= ROUNDS.length ? "All rounds done" : `Start Round ${round + 1}`;
  refreshPanel();
  refreshAbilityBar();
}

function showMsg(text) { $("msg").textContent = text; }

startBtn.onclick = () => {
  if (roundActive || gameOver || round >= ROUNDS.length) return;
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
  const bosses = groups.filter(([t]) => BUG_TYPES[t].boss).reduce((n, [, c]) => n + c, 0);
  showMsg(bossRound ? `⚠️ Boss round! ${bosses > 1 ? bosses + " Stag Beetles are" : "A Stag Beetle is"} coming!` : "");
  updateUI();
};

// Restart: start a fresh game from round 0 (asks first if a game is going)
function restartGame() {
  if (round > 0 && !gameOver && typeof confirm === "function" && !confirm("Restart the game from round 1?")) return;
  money = 120;
  lives = 20;
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
  showMsg("New game! Place some frogs.");
  updateUI();
}
$("restartBtn").onclick = restartGame;

speedBtn.onclick = () => {
  speed = speed === 3 ? 1 : speed + 1;
  speedBtn.textContent = `Speed: ${speed}x`;
};

// ---------- Shop ----------
function selectTower(type) {
  selected = type;
  closePanel();
  $("shopFrog").className = "shopItem" + (type === "frog" ? " selected" : "");
  $("shopTadpole").className = "shopItem" + (type === "tadpole" ? " selected" : "");
  showMsg(type === "tadpole" ? "Click the pond to place a tadpole" : "Click the grass to place a frog");
}
$("shopFrog").onclick = () => selectTower("frog");
$("shopTadpole").onclick = () => selectTower("tadpole");
document.addEventListener("keydown", (e) => {
  if (e.key === "1") selectTower("frog");
  if (e.key === "2") selectTower("tadpole");
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
  return bugs.filter((b) => b.hp > 0 && !b.escaped && Math.hypot(b.x - f.x, b.y - f.y) <= range);
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
  if (gameOver) return;
  const { c, r } = tileFromEvent(e);
  const existing = frogs.find((f) => f.c === c && f.r === r);

  // Clicking a tower opens its upgrade menu
  if (existing) return openPanel(existing);
  // Clicking somewhere else while the menu is open just closes it
  if (picked) return closePanel();

  const tower = TOWERS[selected];
  if (!canPlace(selected, c, r)) {
    return showMsg(selected === "tadpole" ? "Tadpoles can only go in the pond!" : "Frogs go on the grass!");
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
  bugs.push({
    tier, x: waypoints[0].x - TILE, y: waypoints[0].y,
    wp: 0, hp: t.hp * scale, maxHp: t.hp * scale,
    speed: t.speed, wobble: Math.random() * 10, angle: 0,
  });
  if (t.boss) showMsg("⚠️ The Stag Beetle has arrived!");
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

  // Move bugs along the path
  for (const b of bugs) {
    const target = waypoints[b.wp];
    const dx = target.x - b.x, dy = target.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) b.angle = Math.atan2(dy, dx);
    if (dist < b.speed) {
      b.x = target.x; b.y = target.y;
      b.wp++;
      if (b.wp >= waypoints.length) {
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
    // Target the bug furthest along the path that is in range
    let best = null;
    for (const b of bugsInRange(f, stats.range)) {
      if (!best || b.wp > best.wp) best = b;
    }
    if (best) {
      f.angle = Math.atan2(best.y - f.y, best.x - f.x);
      f.cooldown = stats.cooldown;
      if (f.type === "tadpole") {
        shots.push({ x: f.x + Math.cos(f.angle) * 10, y: f.y + Math.sin(f.angle) * 10, target: best, damage: stats.damage });
      } else {
        best.hp -= stats.damage;
        f.tongue = { x: best.x, y: best.y, life: 8 };
      }
    }
  }

  // Move water shots toward their bug
  for (const s of shots) {
    const b = s.target;
    if (b.hp <= 0 || b.escaped) { s.done = true; continue; }
    const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy);
    if (d < 10) {
      b.hp -= s.damage;
      s.done = true;
      effects.push({ kind: "ring", x: b.x, y: b.y, from: 4, to: 14, color: "#aee3ff", life: 10, max: 10 });
    } else {
      s.x += (dx / d) * 10;
      s.y += (dy / d) * 10;
    }
  }
  shots = shots.filter((s) => !s.done);

  // Remove dead / escaped bugs
  bugs = bugs.filter((b) => {
    if (b.hp <= 0) {
      money += rewardFor(b.tier);
      if (BUG_TYPES[b.tier].boss) showMsg("🎉 Stag Beetle defeated! +150");
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
    if (round >= ROUNDS.length) {
      gameOver = true;
      showMsg("🏆 You won! The pond is safe!");
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
  ctx.fillStyle = "#f6a5c0"; // a flower on the biggest pad
  ctx.beginPath(); ctx.arc(450, 266, 5, 0, Math.PI * 2); ctx.fill();

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

  // Tongue
  if (f.tongue) {
    ctx.strokeStyle = "#ff6b8a";
    ctx.lineWidth = 4;
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

  // Body
  ctx.fillStyle = towerColor(f);
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (facing the target)
  for (const side of [-1, 1]) {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(8, side * 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(10, side * 8, 2.5, 0, Math.PI * 2);
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

  // Big health bar + label
  const w = 60;
  ctx.fillStyle = "#400";
  ctx.fillRect(b.x - w / 2, b.y - 36, w, 6);
  ctx.fillStyle = "#e53935";
  ctx.fillRect(b.x - w / 2, b.y - 36, w * Math.max(0, b.hp / b.maxHp), 6);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BOSS", b.x, b.y - 40);
}

function drawBug(b) {
  const t = BUG_TYPES[b.tier];
  if (t.boss) return drawStagBeetle(b);
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
  for (const f of frogs) drawFrog(f);

  // Water shots
  ctx.fillStyle = "#aee3ff";
  ctx.strokeStyle = "#1e6fb8";
  for (const s of shots) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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

// ---------- Main loop ----------
function loop() {
  if (!gameOver) {
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
