(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const hud = document.querySelector(".hud");
  const massValue = document.getElementById("massValue");
  const lengthValue = document.getElementById("lengthValue");
  const rankValue = document.getElementById("rankValue");
  const mergeMeter = document.querySelector(".merge-meter");
  const mergeFill = document.getElementById("mergeFill");
  const lengthenFill = document.getElementById("lengthenFill");
  const shortenFill = document.getElementById("shortenFill");
  const pauseButton = document.getElementById("pauseButton");
  const restartButton = document.getElementById("restartButton");
  const playAgainButton = document.getElementById("playAgainButton");
  const gameOverLobbyButton = document.getElementById("gameOverLobbyButton");
  const gameOverPanel = document.getElementById("gameOver");
  const finalScore = document.getElementById("finalScore");
  const exitPromptPanel = document.getElementById("exitPrompt");
  const stayInGameButton = document.getElementById("stayInGameButton");
  const confirmLobbyButton = document.getElementById("confirmLobbyButton");
  const startScreen = document.getElementById("startScreen");
  const startPlayButton = document.getElementById("startPlayButton");
  const playerNameInput = document.getElementById("playerNameInput");
  const createRoomButton = document.getElementById("createRoomButton");
  const quickMatchButton = document.getElementById("quickMatchButton");
  const roomCodeInput = document.getElementById("roomCodeInput");
  const joinRoomButton = document.getElementById("joinRoomButton");
  const onlineStatus = document.getElementById("onlineStatus");
  const skinGrid = document.getElementById("skinGrid");
  const skinPreview = document.getElementById("skinPreview");
  const tutorialOpenButton = document.getElementById("tutorialOpenButton");
  const tutorialPanel = document.getElementById("tutorialPanel");
  const tutorialCloseButton = document.getElementById("tutorialCloseButton");
  const tutorialImage = document.getElementById("tutorialImage");
  const tutorialPageValue = document.getElementById("tutorialPageValue");
  const tutorialNextButton = document.getElementById("tutorialNextButton");
  const toast = document.getElementById("toast");

  const TAU = Math.PI * 2;
  const WORLD_SIZE = 3900;
  const WORLD_MIN = -WORLD_SIZE / 2;
  const WORLD_MAX = WORLD_SIZE / 2;
  const FOOD_TARGET = 500;
  const DROPPED_FOOD_LIMIT = 360;
  const SPIKE_TARGET = 14;
  const AI_TARGET = 10;
  const MAX_DT = 0.033;
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
  const LENGTH_ADJUST_STEP = 1;
  const MIN_CHUBBY_UNIT_MASS = 12.5;
  const ONLINE_INPUT_INTERVAL = 0.05;
  const ONLINE_STATE_INTERVAL = 0.08;

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

  const aiNames = [
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
    "Rift",
  ];

  const skinNames = ["Nova", "Blaze", "Citrus", "Mint", "Violet", "Ember", "Candy", "Tide"];
  const PROFILE_STORAGE_KEY = "snakeball.profile";

  let width = 1;
  let height = 1;
  let dpr = 1;
  let toastTimer = 0;
  let tutorialPageIndex = 0;
  let onlineSocket = null;
  let onlineRoom = null;
  let onlineSelfId = null;
  let onlineConnecting = false;

  const onlineGame = {
    active: false,
    hosting: false,
    roomCode: null,
    hostId: null,
    pendingLaunch: null,
    inputs: new Map(),
    lastInputSent: 0,
    lastStateSent: 0,
    snapshotAge: 0,
  };

  const keys = new Set();
  const pointer = {
    screenX: window.innerWidth / 2,
    screenY: window.innerHeight / 2,
    worldX: 0,
    worldY: 0,
    active: false,
    leftDown: false,
  };

  const game = {
    snakes: [],
    foods: [],
    shots: [],
    spikes: [],
    particles: [],
    texts: [],
    player: null,
    camera: { x: 0, y: 0, zoom: 0.9 },
    paused: false,
    gameOver: false,
    menuOpen: true,
    exitPromptOpen: false,
    pauseBeforeExitPrompt: false,
    demoMode: true,
    lastTime: 0,
    elapsed: 0,
    respawnClock: 0,
  };

  const profile = {
    name: "Guest",
    skinIndex: 0,
  };

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

  function normalizePlayerName(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 16) || "Guest";
  }

  function loadProfile() {
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.name === "string" && saved.name.trim()) {
        profile.name = normalizePlayerName(saved.name);
      }
      if (Number.isInteger(saved.skinIndex)) {
        profile.skinIndex = clamp(saved.skinIndex, 0, palettes.length - 1);
      }
    } catch {}
  }

  function saveProfile() {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {}
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

  function segmentTravelProgress(snake, index) {
    const stage = segmentAbsorbStage(snake, index);
    return Math.pow(stage, 2.25);
  }

  function normalSegmentRadius(snake) {
    return radiusFromMass(unitMass(snake)) * (snake.spikeScale ?? 1);
  }

  function segmentRadius(snake, index) {
    const segment = snake.segments[index];
    if (!segment) return 0;

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

  function desiredGap(snake, index) {
    const previous = normalSegmentRadius(snake);
    const current = normalSegmentRadius(snake);
    const chainScale = 0.74;
    return Math.max(4, (previous + current) * chainScale);
  }

  function worldRand() {
    return randomRange(WORLD_MIN + 120, WORLD_MAX - 120);
  }

  function currentPlayerPalette() {
    return palettes[clamp(profile.skinIndex, 0, palettes.length - 1)];
  }

  function syncDemoPlayerProfile() {
    if (!game.menuOpen || !game.player) return;
    game.player.name = profile.name;
    game.player.color = currentPlayerPalette();
  }

  function syncProfileFromInput() {
    profile.name = normalizePlayerName(playerNameInput.value);
    saveProfile();
    syncDemoPlayerProfile();
  }

  function makeSegment(x, y, mass) {
    return {
      x,
      y,
      mass,
      wobble: Math.random() * TAU,
    };
  }

  function createSnake(id, x, y, color, isPlayer = false, options = {}) {
    const angle = Math.random() * TAU;
    const segmentCount = isPlayer ? MIN_SEGMENTS : randomInt(7, 12);
    const segments = [];
    const startMass = randomRange(isPlayer ? 15.5 : 13.5, isPlayer ? 17.5 : 18.5);

    for (let index = 0; index < segmentCount; index += 1) {
      segments.push(makeSegment(x - Math.cos(angle) * index * 18, y - Math.sin(angle) * index * 18, startMass));
    }

    return {
      id,
      name: options.name || (isPlayer ? "You" : aiNames[id % aiNames.length]),
      color,
      skinIndex: options.skinIndex ?? 0,
      isPlayer,
      isHuman: Boolean(options.isHuman ?? isPlayer),
      demoBot: Boolean(options.demoBot),
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
      invulnerable: options.invulnerable ?? (isPlayer ? 0.75 : 1.2),
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

  function updateSkinPreview() {
    const palette = currentPlayerPalette();
    const dots = skinPreview.querySelectorAll("span");
    dots.forEach((dot, index) => {
      dot.style.background = palette.main;
      dot.style.boxShadow =
        index === 0
          ? `0 0 0 2px rgba(255,255,255,0.98), 0 0 18px ${palette.main}`
          : `0 0 0 2px rgba(255,255,255,0.98), 0 0 12px ${palette.main}`;
    });
  }

  function drawTutorialRoundRect(target, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    target.beginPath();
    target.moveTo(x + radius, y);
    target.arcTo(x + w, y, x + w, y + h, radius);
    target.arcTo(x + w, y + h, x, y + h, radius);
    target.arcTo(x, y + h, x, y, radius);
    target.arcTo(x, y, x + w, y, radius);
    target.closePath();
  }

  function fillTutorialRoundRect(target, x, y, w, h, r, fill, stroke = null) {
    drawTutorialRoundRect(target, x, y, w, h, r);
    target.fillStyle = fill;
    target.fill();
    if (stroke) {
      target.strokeStyle = stroke;
      target.stroke();
    }
  }

  function wrapTutorialText(target, text, x, y, maxWidth, lineHeight) {
    let line = "";
    let cursorY = y;

    for (const char of text) {
      const next = line + char;
      if (target.measureText(next).width > maxWidth && line) {
        target.fillText(line, x, cursorY);
        line = char.trimStart();
        cursorY += lineHeight;
      } else {
        line = next;
      }
    }

    if (line) target.fillText(line, x, cursorY);
    return cursorY + lineHeight;
  }

  function drawTutorialGrid(target, w, h) {
    target.fillStyle = "#080b12";
    target.fillRect(0, 0, w, h);

    target.strokeStyle = "rgba(255,255,255,0.065)";
    target.lineWidth = 1;
    for (let x = 0; x <= w; x += 42) {
      target.beginPath();
      target.moveTo(x, 0);
      target.lineTo(x, h);
      target.stroke();
    }
    for (let y = 0; y <= h; y += 42) {
      target.beginPath();
      target.moveTo(0, y);
      target.lineTo(w, y);
      target.stroke();
    }
  }

  function drawTutorialSnake(target, x, y, angle, count, palette, options = {}) {
    const radius = options.radius || 24;
    const gap = radius * 0.88;
    const scale = options.scale || 1;
    const positions = [];

    for (let index = count - 1; index >= 0; index -= 1) {
      const px = x - Math.cos(angle) * index * gap;
      const py = y - Math.sin(angle) * index * gap;
      positions.push({ x: px, y: py, index });
    }

    for (const segment of positions) {
      const head = segment.index === 0;
      const r = (head ? radius * 1.16 : radius) * scale;
      const grad = target.createRadialGradient(segment.x - r * 0.28, segment.y - r * 0.34, r * 0.18, segment.x, segment.y, r);
      grad.addColorStop(0, palette.light);
      grad.addColorStop(0.52, palette.main);
      grad.addColorStop(1, palette.dark);
      target.shadowColor = palette.main;
      target.shadowBlur = head ? 18 : 12;
      target.fillStyle = grad;
      target.beginPath();
      target.arc(segment.x, segment.y, r, 0, TAU);
      target.fill();
      target.shadowBlur = 0;
      target.strokeStyle = palette.ring;
      target.lineWidth = 3;
      target.stroke();

      if (head) {
        const frontX = Math.cos(angle);
        const frontY = Math.sin(angle);
        const sideX = Math.cos(angle + Math.PI / 2);
        const sideY = Math.sin(angle + Math.PI / 2);
        const eyeForward = r * 0.42;
        const eyeSide = r * 0.28;

        for (const side of [-1, 1]) {
          const ex = segment.x + frontX * eyeForward + sideX * eyeSide * side;
          const ey = segment.y + frontY * eyeForward + sideY * eyeSide * side;
          target.fillStyle = "#ffffff";
          target.beginPath();
          target.arc(ex, ey, r * 0.17, 0, TAU);
          target.fill();
          target.fillStyle = "#071018";
          target.beginPath();
          target.arc(ex + frontX * r * 0.045, ey + frontY * r * 0.045, r * 0.075, 0, TAU);
          target.fill();
        }
      }
    }
  }

  function drawTutorialSpike(target, x, y, r) {
    target.save();
    target.translate(x, y);
    target.shadowColor = "#75f0a4";
    target.shadowBlur = 14;
    target.fillStyle = "#75f0a4";
    target.strokeStyle = "#e8fff0";
    target.lineWidth = 3;
    target.beginPath();
    for (let index = 0; index < 22; index += 1) {
      const angle = (index / 22) * TAU;
      const radius = index % 2 === 0 ? r * 1.14 : r * 0.7;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (index === 0) target.moveTo(px, py);
      else target.lineTo(px, py);
    }
    target.closePath();
    target.fill();
    target.stroke();
    target.shadowBlur = 0;
    target.fillStyle = "#208b48";
    target.beginPath();
    target.arc(0, 0, r * 0.34, 0, TAU);
    target.fill();
    target.restore();
  }

  function drawTutorialKey(target, x, y, label, active = false) {
    fillTutorialRoundRect(target, x, y, 44, 34, 7, active ? "rgba(77,224,255,0.9)" : "rgba(255,255,255,0.14)", "rgba(255,255,255,0.34)");
    target.fillStyle = active ? "#071018" : "#f7fbff";
    target.font = "800 15px Inter, Microsoft YaHei, sans-serif";
    target.textAlign = "center";
    target.textBaseline = "middle";
    target.fillText(label, x + 22, y + 17);
  }

  function drawTutorialArrow(target, x1, y1, x2, y2, color = "#4de0ff") {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    target.strokeStyle = color;
    target.fillStyle = color;
    target.lineWidth = 5;
    target.lineCap = "round";
    target.beginPath();
    target.moveTo(x1, y1);
    target.lineTo(x2, y2);
    target.stroke();
    target.beginPath();
    target.moveTo(x2, y2);
    target.lineTo(x2 - Math.cos(angle - 0.54) * 18, y2 - Math.sin(angle - 0.54) * 18);
    target.lineTo(x2 - Math.cos(angle + 0.54) * 18, y2 - Math.sin(angle + 0.54) * 18);
    target.closePath();
    target.fill();
  }

  function drawTutorialMouse(target, x, y) {
    target.fillStyle = "#ffffff";
    target.strokeStyle = "#111827";
    target.lineWidth = 2;
    target.beginPath();
    target.moveTo(x, y);
    target.lineTo(x + 22, y + 50);
    target.lineTo(x + 34, y + 31);
    target.lineTo(x + 55, y + 31);
    target.closePath();
    target.fill();
    target.stroke();
  }

  function drawTutorialHeader(target, title, pageText) {
    fillTutorialRoundRect(target, 22, 22, 188, 48, 8, "rgba(8,11,18,0.7)", "rgba(255,255,255,0.14)");
    target.fillStyle = "#ffffff";
    target.font = "900 25px Inter, Microsoft YaHei, sans-serif";
    target.textAlign = "left";
    target.textBaseline = "alphabetic";
    target.fillText(title, 42, 54);
    target.fillStyle = "rgba(247,251,255,0.66)";
    target.font = "800 15px Inter, Microsoft YaHei, sans-serif";
    target.textAlign = "right";
    target.fillText(pageText, 650, 54);
  }

  function drawTutorialCaption(target, text) {
    fillTutorialRoundRect(target, 28, 344, 624, 150, 10, "rgba(247,250,253,0.94)", "rgba(255,255,255,0.3)");
    target.fillStyle = "#1f2937";
    target.font = "800 22px Microsoft YaHei, Inter, sans-serif";
    target.textAlign = "left";
    target.textBaseline = "alphabetic";
    wrapTutorialText(target, text, 54, 382, 572, 30);
  }

  function renderTutorialArtwork(pageIndex) {
    const page = pageIndex % 3;
    const source = document.createElement("canvas");
    source.width = 680;
    source.height = 520;
    const target = source.getContext("2d");
    const playerPalette = currentPlayerPalette();
    const enemyPalette = palettes[1];

    drawTutorialGrid(target, source.width, source.height);

    if (page === 0) {
      drawTutorialHeader(target, "移动", "1/3");
      drawTutorialKey(target, 64, 126, "W", true);
      drawTutorialKey(target, 18, 166, "A", false);
      drawTutorialKey(target, 64, 166, "S", false);
      drawTutorialKey(target, 110, 166, "D", true);
      drawTutorialArrow(target, 262, 205, 456, 176, "#4de0ff");
      drawTutorialSnake(target, 246, 212, -0.18, 5, playerPalette, { radius: 27 });
      drawTutorialMouse(target, 486, 124);
      drawTutorialCaption(target, "按 WASD 移动，或者用鼠标，球蛇会向着鼠标指针前进");
    } else if (page === 1) {
      drawTutorialHeader(target, "技巧", "2/3");
      target.globalAlpha = 0.5;
      drawTutorialArrow(target, 190, 236, 116, 236, "#ffffff");
      drawTutorialArrow(target, 220, 270, 145, 286, "#ffffff");
      target.globalAlpha = 1;
      drawTutorialSnake(target, 294, 248, 0.04, 6, playerPalette, { radius: 26 });
      fillTutorialRoundRect(target, 72, 96, 122, 58, 12, "rgba(255,255,255,0.14)", "rgba(255,255,255,0.34)");
      target.fillStyle = "#ffffff";
      target.font = "900 18px Inter, Microsoft YaHei, sans-serif";
      target.textAlign = "center";
      target.fillText("左键 / V", 133, 132);
      drawTutorialKey(target, 444, 116, "Q", true);
      drawTutorialSnake(target, 526, 134, 0, 4, playerPalette, { radius: 16 });
      drawTutorialKey(target, 444, 210, "E", true);
      drawTutorialSnake(target, 526, 228, 0, 3, playerPalette, { radius: 16 });
      drawTutorialCaption(target, "按鼠标左键或者 V 键加速，按 Q 增加一个球，按 E 减少一个球（注意：加速时间跟增减球都有冷却时间，显示在界面上方）");
    } else {
      drawTutorialHeader(target, "刺球", "3/3");
      drawTutorialSnake(target, 142, 216, -0.06, 5, playerPalette, { radius: 22 });
      for (let index = 0; index < 3; index += 1) {
        const px = 260 + index * 42;
        target.fillStyle = playerPalette.main;
        target.shadowColor = playerPalette.main;
        target.shadowBlur = 8;
        target.beginPath();
        target.arc(px, 206 + index * 8, 11, 0, TAU);
        target.fill();
      }
      target.shadowBlur = 0;
      drawTutorialArrow(target, 302, 212, 376, 220, "#ffd166");
      drawTutorialSpike(target, 408, 222, 31);
      drawTutorialArrow(target, 442, 222, 506, 222, "#75f0a4");
      drawTutorialSnake(target, 590, 222, Math.PI, 6, enemyPalette, { radius: 21, scale: 0.72 });
      drawTutorialKey(target, 204, 116, "F", true);
      target.fillStyle = "#75f0a4";
      target.font = "900 23px Inter, Microsoft YaHei, sans-serif";
      target.textAlign = "center";
      target.fillText("ouchhhhh", 514, 142);
      drawTutorialCaption(target, "绿色的刺球——高风险高回报。你可以按 F 吐出小球，将刺球推向对方。球蛇在碰到刺球后会迅速缩小，然后慢慢变得比原来更大。可以是粮草。也可以是武器。");
    }

    return source.toDataURL("image/png");
  }

  function renderTutorialPanel() {
    if (!tutorialImage) return;
    tutorialImage.src = renderTutorialArtwork(tutorialPageIndex);
    tutorialPageValue.textContent = `${tutorialPageIndex + 1}/3`;
  }

  function isTutorialOpen() {
    return tutorialPanel && !tutorialPanel.hidden;
  }

  function openTutorial() {
    renderTutorialPanel();
    tutorialPanel.hidden = false;
    tutorialNextButton.focus();
  }

  function closeTutorial() {
    tutorialPanel.hidden = true;
    tutorialOpenButton.focus();
  }

  function renderSkinChoices() {
    skinGrid.textContent = "";

    for (let index = 0; index < palettes.length; index += 1) {
      const palette = palettes[index];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skin-swatch";
      if (index === profile.skinIndex) button.classList.add("selected");
      button.setAttribute("aria-label", skinNames[index] || `Skin ${index + 1}`);
      button.innerHTML = `<span class="skin-dot"></span><small>${skinNames[index] || `Skin ${index + 1}`}</small>`;
      button.querySelector(".skin-dot").style.background = `linear-gradient(135deg, ${palette.light}, ${palette.main} 52%, ${palette.dark})`;
      button.addEventListener("click", () => {
        profile.skinIndex = index;
        saveProfile();
        renderSkinChoices();
        updateSkinPreview();
        renderTutorialPanel();
        syncDemoPlayerProfile();
      });
      skinGrid.appendChild(button);
    }
  }

  function setMenuVisibility(visible) {
    game.menuOpen = visible;
    game.demoMode = visible;
    startScreen.hidden = !visible;
    hud.hidden = visible;
    keys.clear();
    pointer.leftDown = false;
    if (visible) {
      game.paused = false;
      pauseButton.textContent = "II";
      playerNameInput.value = profile.name;
      renderSkinChoices();
      updateSkinPreview();
      syncDemoPlayerProfile();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function startMatch() {
    syncProfileFromInput();
    playerNameInput.blur();
    startPlayButton.blur();
    if (onlineRoom) {
      startOnlineMatch(onlineRoom);
      return;
    }
    resetGame({ menu: false, silent: true });
    showToast(`${profile.name} entered the arena`);
  }

  function closeExitPrompt() {
    if (!game.exitPromptOpen) return;

    game.exitPromptOpen = false;
    exitPromptPanel.hidden = true;
    game.paused = game.pauseBeforeExitPrompt;
    pauseButton.textContent = game.paused ? ">" : "II";
    keys.clear();
    pointer.leftDown = false;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function openExitPrompt() {
    if (game.menuOpen || game.gameOver || game.exitPromptOpen) return;

    game.pauseBeforeExitPrompt = game.paused;
    game.exitPromptOpen = true;
    game.paused = true;
    pauseButton.textContent = ">";
    keys.clear();
    pointer.leftDown = false;
    exitPromptPanel.hidden = false;
    stayInGameButton.focus();
  }

  function returnToLobby() {
    if (onlineGame.active || onlineRoom) {
      sendOnline("leave_room");
      onlineRoom = null;
      onlineGame.pendingLaunch = null;
    }
    resetGame({ menu: true, silent: true });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function screenToWorld(screenX, screenY) {
    return {
      x: (screenX - width / 2) / game.camera.zoom + game.camera.x,
      y: (screenY - height / 2) / game.camera.zoom + game.camera.y,
    };
  }

  function updatePointerWorld() {
    const world = screenToWorld(pointer.screenX, pointer.screenY);
    pointer.worldX = world.x;
    pointer.worldY = world.y;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = 1.4;
  }

  function setOnlineStatus(message, state = "") {
    onlineStatus.textContent = message;
    onlineStatus.classList.toggle("ready", state === "ready");
    onlineStatus.classList.toggle("error", state === "error");
  }

  function multiplayerUrl() {
    if (window.location.protocol === "file:") return null;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  function onlineProfile() {
    syncProfileFromInput();
    return {
      name: profile.name,
      skinIndex: profile.skinIndex,
    };
  }

  function sendOnline(type, payload = {}) {
    if (!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN) return false;
    onlineSocket.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  function paletteForSkin(index) {
    return palettes[clamp(Number.isInteger(index) ? index : 0, 0, palettes.length - 1)];
  }

  function readLocalOnlineInput() {
    const player = game.player;
    const head = player?.segments?.[0];
    let vx = 0;
    let vy = 0;

    if (keys.has("KeyA") || keys.has("ArrowLeft")) vx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) vx += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) vy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) vy += 1;

    const targetAngle = vx || vy
      ? Math.atan2(vy, vx)
      : head
        ? angleTo(head.x, head.y, pointer.worldX, pointer.worldY)
        : 0;

    return {
      targetAngle,
      mergeHold: keys.has("Space"),
      boostHold: keys.has("KeyV") || pointer.leftDown,
      spitHold: keys.has("KeyF"),
    };
  }

  function sanitizeOnlineInput(input = {}) {
    return {
      targetAngle: Number.isFinite(input.targetAngle) ? input.targetAngle : 0,
      mergeHold: Boolean(input.mergeHold),
      boostHold: Boolean(input.boostHold),
      spitHold: Boolean(input.spitHold),
    };
  }

  function applyControlToSnake(snake, input) {
    if (!snake || !snake.alive) return;

    const control = sanitizeOnlineInput(input);
    snake.targetAngle = control.targetAngle;

    const canContinueMerge = snake.mergeHold && snake.mergeEnergy > 0;
    snake.mergeHold = control.mergeHold && (canContinueMerge || canStartMerge(snake));
    snake.boostHold = control.boostHold;

    if (control.spitHold && snake.merge <= 0.14) {
      spitFood(snake);
    }
  }

  function sendOnlineInput(dt) {
    if (!onlineGame.active) return;

    onlineGame.lastInputSent += dt;
    if (onlineGame.lastInputSent < ONLINE_INPUT_INTERVAL) return;
    onlineGame.lastInputSent = 0;
    sendOnline("input", { input: readLocalOnlineInput() });
  }

  function applyOnlineHostInputs() {
    if (!onlineGame.active || !onlineGame.hosting) return;

    onlineGame.inputs.set(onlineSelfId, readLocalOnlineInput());
    for (const snake of game.snakes) {
      if (!snake.isHuman) continue;
      applyControlToSnake(snake, onlineGame.inputs.get(snake.id));
    }
  }

  function sendOnlineLengthCommand(delta) {
    if (!onlineGame.active) return false;

    if (onlineGame.hosting) {
      return adjustSnakeLength(game.player, delta);
    }

    sendOnline("command", { command: "length", delta });
    return true;
  }

  function handleOnlineCommand(playerId, command, delta) {
    if (!onlineGame.hosting || command !== "length") return;
    const snake = game.snakes.find((candidate) => candidate.id === playerId);
    adjustSnakeLength(snake, Number(delta) > 0 ? LENGTH_ADJUST_STEP : -LENGTH_ADJUST_STEP);
  }

  function serializeWorldState() {
    return {
      elapsed: game.elapsed,
      snakes: game.snakes.map((snake) => ({
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
      foods: game.foods.map((food) => ({ ...food })),
      shots: game.shots.map((shot) => ({
        x: shot.x,
        y: shot.y,
        vx: shot.vx,
        vy: shot.vy,
        mass: shot.mass,
        radius: shot.radius,
        color: shot.color,
        ownerId: shot.owner?.id ?? null,
        life: shot.life,
        age: shot.age,
        spin: shot.spin,
      })),
      spikes: game.spikes.map((spike) => ({ ...spike })),
      particles: game.particles.slice(-180).map((particle) => ({ ...particle })),
      texts: game.texts.slice(-36).map((text) => ({ ...text })),
    };
  }

  function hydrateSnake(data) {
    const skinIndex = clamp(Number.isInteger(data.skinIndex) ? data.skinIndex : 0, 0, palettes.length - 1);
    const segments = Array.isArray(data.segments)
      ? data.segments.map((segment) => ({
          x: Number(segment.x) || 0,
          y: Number(segment.y) || 0,
          mass: Math.max(1, Number(segment.mass) || 1),
          wobble: Number(segment.wobble) || 0,
        }))
      : [];
    const head = segments[0] || { x: 0, y: 0 };

    return {
      id: data.id,
      name: data.name || "Guest",
      color: paletteForSkin(skinIndex),
      skinIndex,
      isPlayer: data.id === onlineSelfId,
      isHuman: Boolean(data.isHuman),
      demoBot: false,
      segments,
      angle: Number(data.angle) || 0,
      targetAngle: Number(data.targetAngle) || 0,
      merge: Number(data.merge) || 0,
      mergeHold: Boolean(data.mergeHold),
      mergeEnergy: clamp(Number(data.mergeEnergy) || 0, 0, 1),
      mergeExhausted: Boolean(data.mergeExhausted),
      mergeEmptyNotified: Boolean(data.mergeEmptyNotified),
      mergeIntent: Boolean(data.mergeIntent),
      mergeDrainTimer: Math.max(0, Number(data.mergeDrainTimer) || 0),
      lengthenCharge: clamp(Number(data.lengthenCharge) || 0, 0, 1),
      shortenCharge: clamp(Number(data.shortenCharge) || 0, 0, 1),
      manualLengthOffset: Number(data.manualLengthOffset) || 0,
      boostHold: Boolean(data.boostHold),
      boostEmitClock: Number(data.boostEmitClock) || 0,
      spitCooldown: Math.max(0, Number(data.spitCooldown) || 0),
      spikeScale: Number(data.spikeScale) || 1,
      spikeDragSeverity: Number(data.spikeDragSeverity) || 0,
      digestMass: Math.max(0, Number(data.digestMass) || 0),
      stun: Math.max(0, Number(data.stun) || 0),
      invulnerable: Math.max(0, Number(data.invulnerable) || 0),
      alive: Boolean(data.alive),
      kills: Number(data.kills) || 0,
      respawnTimer: Math.max(0, Number(data.respawnTimer) || 0),
      ai: {
        timer: 0,
        targetX: head.x,
        targetY: head.y,
        mode: "food",
      },
    };
  }

  function applyOnlineWorldState(state) {
    if (!onlineGame.active || onlineGame.hosting || !state) return;

    game.elapsed = Number(state.elapsed) || game.elapsed;
    game.snakes = Array.isArray(state.snakes) ? state.snakes.map(hydrateSnake) : [];
    game.player = game.snakes.find((snake) => snake.id === onlineSelfId) || game.snakes.find((snake) => snake.isHuman) || null;
    game.foods = Array.isArray(state.foods) ? state.foods.map((food) => ({ ...food })) : [];
    game.shots = Array.isArray(state.shots)
      ? state.shots.map((shot) => ({
          ...shot,
          owner: null,
        }))
      : [];
    game.spikes = Array.isArray(state.spikes) ? state.spikes.map((spike) => ({ ...spike })) : [];
    game.particles = Array.isArray(state.particles) ? state.particles.map((particle) => ({ ...particle })) : [];
    game.texts = Array.isArray(state.texts) ? state.texts.map((text) => ({ ...text })) : [];
    onlineGame.snapshotAge = 0;
  }

  function maybeSendOnlineWorldState(dt) {
    if (!onlineGame.active || !onlineGame.hosting) return;

    onlineGame.lastStateSent += dt;
    if (onlineGame.lastStateSent < ONLINE_STATE_INTERVAL) return;
    onlineGame.lastStateSent = 0;
    sendOnline("world_state", { state: serializeWorldState() });
  }

  function onlineParticipants(room) {
    const players = Array.isArray(room?.players) ? room.players : [];
    const bots = Array.isArray(room?.bots) ? room.bots : [];
    return [
      ...players.map((player) => ({ ...player, isHuman: true })),
      ...bots.map((bot) => ({ ...bot, isHuman: false })),
    ].slice(0, 11);
  }

  function syncOnlineRoster(room) {
    if (!onlineGame.active || !onlineGame.hosting || !room) return;

    const participants = onlineParticipants(room);
    const participantIds = new Set(participants.map((participant) => participant.id));

    for (const participant of participants) {
      let snake = game.snakes.find((candidate) => candidate.id === participant.id);
      const skinIndex = clamp(Number.isInteger(participant.skinIndex) ? participant.skinIndex : 0, 0, palettes.length - 1);

      if (!snake) {
        const angle = Math.random() * TAU;
        const distance = randomRange(360, 680);
        snake = createSnake(
          participant.id,
          Math.cos(angle) * distance,
          Math.sin(angle) * distance,
          paletteForSkin(skinIndex),
          participant.id === onlineSelfId,
          {
            name: participant.name,
            skinIndex,
            isHuman: participant.isHuman,
            invulnerable: 1.2,
          },
        );
        game.snakes.push(snake);
      }

      snake.name = participant.name || snake.name;
      snake.skinIndex = skinIndex;
      snake.color = paletteForSkin(skinIndex);
      snake.isHuman = Boolean(participant.isHuman);
      snake.isPlayer = participant.id === onlineSelfId;
      if (snake.isPlayer) game.player = snake;
    }

    game.snakes = game.snakes.filter((snake) => !snake.isHuman || participantIds.has(snake.id));

    const humanCount = game.snakes.filter((snake) => snake.isHuman).length;
    let botOverflow = game.snakes.filter((snake) => !snake.isHuman).length - Math.max(0, 11 - humanCount);
    for (let index = game.snakes.length - 1; index >= 0 && botOverflow > 0; index -= 1) {
      if (game.snakes[index].isHuman) continue;
      game.snakes.splice(index, 1);
      botOverflow -= 1;
    }
  }

  function startOnlineMatch(room = onlineRoom) {
    if (!room) {
      setOnlineStatus("先创建或加入一个房间。", "error");
      return;
    }

    onlineGame.active = true;
    onlineGame.roomCode = room.code;
    onlineGame.hostId = room.hostId || room.players?.[0]?.id || onlineSelfId;
    onlineGame.hosting = onlineSelfId === onlineGame.hostId;
    onlineGame.inputs.clear();
    onlineGame.lastInputSent = ONLINE_INPUT_INTERVAL;
    onlineGame.lastStateSent = ONLINE_STATE_INTERVAL;
    onlineGame.snapshotAge = 0;

    resetGame({ menu: false, silent: true, onlineRoom: room });
    showToast(`房间 ${room.code} 开始`);
  }

  function renderOnlineRoom(room) {
    onlineRoom = room;
    if (onlineGame.active && room?.code === onlineGame.roomCode) {
      onlineGame.hostId = room.hostId || room.players?.[0]?.id || onlineGame.hostId;
      onlineGame.hosting = onlineSelfId === onlineGame.hostId;
      syncOnlineRoster(room);
    }
    if (!room) {
      setOnlineStatus("未加入房间。");
      return;
    }
    roomCodeInput.value = room.code;
    setOnlineStatus(`房间 ${room.code}：真人 ${room.playerCount}/11，机器人 ${room.botCount}/11。点击 Play 进入联机战局。`, "ready");
  }

  function handleOnlineMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "hello") {
      onlineSelfId = message.selfId;
      setOnlineStatus("联机服务已连接，可以创建房间或快速匹配。", "ready");
      return;
    }

    if (message.type === "joined_room" || message.type === "room_state") {
      if (message.selfId) onlineSelfId = message.selfId;
      renderOnlineRoom(message.room);
      if (message.type === "joined_room") {
        showToast(`房间 ${message.room.code} 已准备`);
        if (onlineGame.pendingLaunch === "quick" || onlineGame.pendingLaunch === "join") {
          onlineGame.pendingLaunch = null;
          startOnlineMatch(message.room);
        }
      }
      return;
    }

    if (message.type === "player_input") {
      onlineGame.inputs.set(message.playerId, sanitizeOnlineInput(message.input));
      return;
    }

    if (message.type === "player_command") {
      handleOnlineCommand(message.playerId, message.command, message.delta);
      return;
    }

    if (message.type === "world_state") {
      applyOnlineWorldState(message.state);
      return;
    }

    if (message.type === "left_room") {
      renderOnlineRoom(null);
      return;
    }

    if (message.type === "error_message") {
      setOnlineStatus(message.message || "联机服务错误", "error");
      showToast(message.message || "联机服务错误");
    }
  }

  function connectOnline() {
    if (onlineSocket?.readyState === WebSocket.OPEN) return Promise.resolve(onlineSocket);
    if (onlineConnecting) {
      return new Promise((resolve, reject) => {
        const started = performance.now();
        const timer = window.setInterval(() => {
          if (onlineSocket?.readyState === WebSocket.OPEN) {
            window.clearInterval(timer);
            resolve(onlineSocket);
          } else if (performance.now() - started > 6000) {
            window.clearInterval(timer);
            reject(new Error("连接超时"));
          }
        }, 60);
      });
    }

    const url = multiplayerUrl();
    if (!url) {
      setOnlineStatus("请通过联机服务器打开网页，例如 http://localhost:3000。直接打开 HTML 只能单机。", "error");
      return Promise.reject(new Error("No multiplayer server URL"));
    }

    onlineConnecting = true;
    setOnlineStatus("正在连接联机服务...");

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      onlineSocket = socket;

      socket.addEventListener("open", () => {
        onlineConnecting = false;
        socket.addEventListener("message", handleOnlineMessage);
        sendOnline("hello", onlineProfile());
        resolve(socket);
      });

      socket.addEventListener("close", () => {
        onlineConnecting = false;
        onlineSocket = null;
        onlineRoom = null;
        onlineGame.active = false;
        onlineGame.hosting = false;
        onlineGame.pendingLaunch = null;
        setOnlineStatus("联机服务已断开。", "error");
      });

      socket.addEventListener("error", () => {
        onlineConnecting = false;
        setOnlineStatus("连接联机服务失败。确认后端已经启动。", "error");
        reject(new Error("WebSocket connection failed"));
      });
    });
  }

  async function createOnlineRoom() {
    try {
      onlineGame.pendingLaunch = null;
      await connectOnline();
      sendOnline("create_room", { profile: onlineProfile() });
    } catch {}
  }

  async function quickMatchOnline() {
    try {
      onlineGame.pendingLaunch = "quick";
      await connectOnline();
      sendOnline("quick_match", { profile: onlineProfile() });
    } catch {
      onlineGame.pendingLaunch = null;
    }
  }

  async function joinOnlineRoom() {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setOnlineStatus("请输入 4 位房间码。", "error");
      return;
    }
    try {
      onlineGame.pendingLaunch = "join";
      await connectOnline();
      sendOnline("join_room", { code, profile: onlineProfile() });
    } catch {
      onlineGame.pendingLaunch = null;
    }
  }

  function addText(x, y, value, color = "#ffffff") {
    game.texts.push({
      x,
      y,
      value,
      color,
      life: 0.95,
      age: 0,
      vy: -38,
    });
  }

  function addParticles(x, y, color, count = 14, force = 1) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const speed = randomRange(36, 180) * force;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: randomRange(2, 5),
        color,
        life: randomRange(0.28, 0.72),
        age: 0,
      });
    }
  }

  function ambientFoodCount() {
    let count = 0;
    for (const food of game.foods) {
      if (food.ambient) count += 1;
    }
    return count;
  }

  function trimDroppedFood() {
    let dropped = 0;
    for (const food of game.foods) {
      if (!food.ambient) dropped += 1;
    }

    if (dropped <= DROPPED_FOOD_LIMIT) return;

    const removeCount = dropped - DROPPED_FOOD_LIMIT;
    let removed = 0;
    for (let index = 0; index < game.foods.length && removed < removeCount; ) {
      if (game.foods[index].ambient) {
        index += 1;
        continue;
      }

      game.foods.splice(index, 1);
      removed += 1;
    }
  }

  function spawnFood(
    x = worldRand(),
    y = worldRand(),
    mass = randomRange(2.2, 7.2),
    color = pick(pelletColors),
    ambient = true,
  ) {
    game.foods.push({
      x,
      y,
      mass,
      radius: radiusFromMass(mass) * 0.48,
      color,
      ambient,
      spin: Math.random() * TAU,
    });

    if (!ambient) trimDroppedFood();
  }

  function spawnFoodBurst(x, y, mass, color) {
    const count = clamp(Math.ceil(mass / 5.2), 2, 24);
    const share = mass / count;

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const distance = randomRange(7, 74);
      const pelletMass = Math.max(1.8, share * randomRange(0.72, 1.32));
      spawnFood(
        clamp(x + Math.cos(angle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
        clamp(y + Math.sin(angle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
        pelletMass,
        color || pick(pelletColors),
        false,
      );
    }

    trimDroppedFood();
  }

  function spawnSpike(x = worldRand(), y = worldRand()) {
    game.spikes.push({
      x,
      y,
      vx: 0,
      vy: 0,
      mass: randomRange(55, 90),
      radius: randomRange(24, 34),
      spin: Math.random() * TAU,
    });
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
    let desired = clamp(normalDesired + snake.manualLengthOffset, MIN_SEGMENTS, STRETCH_MAX_SEGMENTS);

    setSnakeSegmentCount(snake, desired, mass);
  }

  function updateLengthCharges(snake, dt) {
    snake.lengthenCharge = Math.min(1, snake.lengthenCharge + dt / LENGTHEN_CHARGE_TIME);
    snake.shortenCharge = Math.min(1, snake.shortenCharge + dt / SHORTEN_CHARGE_TIME);
  }

  function adjustSnakeLength(snake, delta) {
    if (!snake || !snake.alive || game.paused || game.gameOver) return false;

    const chargeKey = delta > 0 ? "lengthenCharge" : "shortenCharge";
    if (snake[chargeKey] < 1) {
      showToast(delta > 0 ? "Q 蓄力中" : "E 蓄力中");
      return false;
    }

    if (snake.merge > 0.08) {
      showToast("先松开 Space");
      return false;
    }

    const mass = totalMass(snake);
    const beforeLength = snake.segments.length;
    const maxSegments = chubbySegmentLimit(mass);
    const target = clamp(beforeLength + delta, MIN_SEGMENTS, maxSegments);
    if (target === beforeLength) {
      showToast(delta > 0 ? "已经最长" : "已经最短");
      return false;
    }

    const actualLength = setSnakeSegmentCount(snake, target, mass);
    snake.manualLengthOffset = actualLength - desiredNormalSegments(mass);

    snake[chargeKey] = 0;
    const changed = Math.abs(actualLength - beforeLength);
    addText(snake.segments[0].x, snake.segments[0].y - 22, delta > 0 ? `+${changed} BALL` : `-${changed} BALL`, snake.color.light);
    return true;
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

  function spitFood(snake) {
    if (!snake || !snake.alive || game.paused || game.gameOver) return false;
    if (snake.spitCooldown > 0) return false;
    if (snake.merge > 0.14) {
      showToast("先松开 Space");
      return false;
    }

    if (availableSnakeMass(snake) < SPIT_FOOD_COST * 0.72) {
      snake.spitCooldown = SPIT_COOLDOWN;
      showToast("质量不足");
      return false;
    }

    const spent = spendSnakeMass(snake, SPIT_FOOD_COST);
    rebalanceSnake(snake);
    const head = snake.segments[0];
    const radius = segmentRadius(snake, 0);
    const x = head.x + Math.cos(snake.angle) * (radius + 12);
    const y = head.y + Math.sin(snake.angle) * (radius + 12);

    game.shots.push({
      x,
      y,
      vx: Math.cos(snake.angle) * SPIT_SPEED,
      vy: Math.sin(snake.angle) * SPIT_SPEED,
      mass: spent * 0.92,
      radius: radiusFromMass(spent) * 0.5,
      color: snake.color.main,
      owner: snake,
      life: 1.05,
      age: 0,
      spin: Math.random() * TAU,
    });

    snake.spitCooldown = SPIT_COOLDOWN;
    addParticles(x, y, snake.color.main, 6, 0.36);
    return true;
  }

  function shedBoostFood(snake, dt) {
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
      spawnFood(
        clamp(tail.x + Math.cos(backAngle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
        clamp(tail.y + Math.sin(backAngle) * distance, WORLD_MIN + 24, WORLD_MAX - 24),
        spent * 0.9,
        snake.color.main,
        false,
      );
      addParticles(tail.x, tail.y, snake.color.main, snake.isPlayer ? 2 : 1, 0.24);
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

  function splitSnakeBySpike(snake, spike) {
    if (!snake.alive) return;

    const beforeMass = totalMass(snake);
    const beforeLength = snake.segments.length;
    const pressure = spikePressureForSnake(snake, beforeMass, beforeLength);
    const shrinkRatio = lerp(0.12, 0.48, pressure);
    const spikeReward = spike.mass * lerp(0.42, 1.08, pressure);
    const shrinkScale = clamp(1 - shrinkRatio, 0.42, 1);

    snake.spikeScale = Math.min(snake.spikeScale ?? 1, shrinkScale);
    snake.digestMass += spikeReward;
    snake.spikeDragSeverity = Math.max(snake.spikeDragSeverity, lerp(0.14, 0.86, pressure));
    snake.stun = Math.max(snake.stun, lerp(0.03, 0.24, pressure));

    spawnFoodBurst(spike.x, spike.y, spike.mass * lerp(0.12, 0.22, pressure), "#75f0a4");
    addParticles(spike.x, spike.y, "#75f0a4", 28, 1.35);
    addText(spike.x, spike.y - 18, spikeOuchText(pressure), snake.color.light);
  }

  function digestSpikeMass(snake, dt) {
    if (!snake.alive || snake.digestMass <= 0) return;

    const severity = snake.spikeDragSeverity || 0;
    const massPressure = clamp((totalMass(snake) - 180) / 900, 0, 1);
    const passiveRate = lerp(snake.isHuman ? 5.2 : 4.8, snake.isHuman ? 2.6 : 2.3, massPressure);
    const mergeRate = snake.mergeHold ? lerp(3.4, 1.4, massPressure) : 0;
    const rate = (passiveRate + mergeRate) * lerp(1, 0.58, severity);
    const amount = Math.min(snake.digestMass, dt * rate);
    snake.digestMass -= amount;
    growSnake(snake, amount, { keepSegments: true });
    snake.manualLengthOffset = snake.segments.length - desiredNormalSegments(totalMass(snake));

    if (snake.digestMass <= 0.001) {
      snake.digestMass = 0;
      addText(snake.segments[0].x, snake.segments[0].y - 24, "DIGESTED", snake.color.light);
    }
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

  function updateMergeEnergy(snake, dt) {
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
        if (!snake.mergeEmptyNotified) {
          snake.mergeEmptyNotified = true;
          addText(snake.segments[0].x, snake.segments[0].y - 28, "EMPTY", snake.color.light);
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

  function killSnake(snake, killer = null) {
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
    snake.respawnTimer = onlineGame.active && snake.isHuman ? 2.6 : 0;

    for (const segment of snake.segments) {
      spawnFoodBurst(segment.x, segment.y, segment.mass * 0.95, snake.color.main);
    }

    const head = snake.segments[0];
    addParticles(head.x, head.y, snake.color.main, 30, 1.1);

    if (killer && killer.alive) {
      killer.kills += 1;
      growSnake(killer, Math.max(8, deathMass * 0.16));
      addText(head.x, head.y - 18, "K.O.", killer.color.light);
    }

    if (snake.isPlayer && !game.menuOpen && !snake.demoBot && !onlineGame.active) {
      game.gameOver = true;
      finalScore.textContent = `质量 ${Math.round(deathMass)}`;
      gameOverPanel.hidden = false;
    }
  }

  function severSnake(defender, cutIndex, attacker) {
    if (!defender.alive || !attacker.alive || cutIndex <= 0) return;

    const removed = defender.segments.slice(cutIndex);
    const bitten = removed[0];
    defender.segments = defender.segments.slice(0, cutIndex);

    growSnake(attacker, bitten.mass * 0.82);
    spawnFoodBurst(bitten.x, bitten.y, bitten.mass * 0.28, attacker.color.main);

    for (let index = 1; index < removed.length; index += 1) {
      const segment = removed[index];
      spawnFoodBurst(segment.x, segment.y, segment.mass * 0.94, defender.color.main);
      addParticles(segment.x, segment.y, defender.color.main, 4, 0.8);
    }

    attacker.kills += removed.length >= 4 ? 1 : 0;
    defender.stun = Math.max(defender.stun, 0.34);
    addParticles(bitten.x, bitten.y, attacker.color.main, 22, 1.1);
    addText(bitten.x, bitten.y - 18, "YUMMY", attacker.color.light);

    if (defender.segments.length < 3 || totalMass(defender) < 32) {
      killSnake(defender, attacker);
      return;
    }

    const remainingMass = totalMass(defender);
    equalizeSnakeMass(defender, remainingMass);
    defender.manualLengthOffset = defender.segments.length - desiredNormalSegments(remainingMass);
  }

  function nearestFood(x, y, radius = 680) {
    let best = null;
    let bestDist = radius * radius;

    for (const food of game.foods) {
      const distance = distSq(x, y, food.x, food.y);
      if (distance < bestDist) {
        best = food;
        bestDist = distance;
      }
    }

    return best;
  }

  function findDanger(snake) {
    const head = snake.segments[0];
    const ownMass = headMass(snake);
    let best = null;
    let bestDist = Infinity;

    for (const other of game.snakes) {
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

  function findEdibleSegment(snake) {
    const head = snake.segments[0];
    const ownMass = headMass(snake);
    let best = null;
    let bestDist = Infinity;

    for (const other of game.snakes) {
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

  function updateAi(snake, dt) {
    snake.ai.timer -= dt;
    const head = snake.segments[0];
    const passiveDemo = snake.demoBot;

    if (snake.ai.timer <= 0) {
      snake.ai.timer = randomRange(passiveDemo ? 0.26 : 0.18, passiveDemo ? 0.56 : 0.42);
      snake.mergeHold = false;

      const danger = findDanger(snake);
      if (danger) {
        snake.ai.mode = "flee";
        snake.ai.targetX = head.x + (head.x - danger.x) * 1.25 + randomRange(-90, 90);
        snake.ai.targetY = head.y + (head.y - danger.y) * 1.25 + randomRange(-90, 90);
      } else {
        const target = passiveDemo ? null : findEdibleSegment(snake);
        if (target && Math.random() < 0.72) {
          snake.ai.mode = "attack";
          snake.ai.targetX = target.x;
          snake.ai.targetY = target.y;
          snake.mergeHold = canStartMerge(snake) && target.distance < 380 && totalMass(snake) > 95;
        } else {
          snake.ai.mode = "food";
          const food = nearestFood(head.x, head.y, 820);
          if (food) {
            snake.ai.targetX = food.x;
            snake.ai.targetY = food.y;
          } else {
            snake.ai.targetX = clamp(head.x + randomRange(-460, 460), WORLD_MIN + 120, WORLD_MAX - 120);
            snake.ai.targetY = clamp(head.y + randomRange(-460, 460), WORLD_MIN + 120, WORLD_MAX - 120);
          }

          if (!passiveDemo && canStartMerge(snake) && snake.mergeEnergy > 0.45 && totalMass(snake) > 210 && Math.random() < 0.08) {
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

  function updatePlayerInput() {
    const player = game.player;
    if (!player || !player.alive || game.menuOpen || player.demoBot) return;

    const head = player.segments[0];
    let vx = 0;
    let vy = 0;

    if (keys.has("KeyA") || keys.has("ArrowLeft")) vx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) vx += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) vy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) vy += 1;

    if (vx || vy) {
      player.targetAngle = Math.atan2(vy, vx);
    } else {
      player.targetAngle = angleTo(head.x, head.y, pointer.worldX, pointer.worldY);
    }

    const wantsMerge = keys.has("Space");
    const canContinueMerge = player.mergeHold && player.mergeEnergy > 0;
    player.mergeHold = wantsMerge && (canContinueMerge || canStartMerge(player));
    player.boostHold = keys.has("KeyV") || pointer.leftDown;

    if (keys.has("KeyF") && player.merge <= 0.14) {
      spitFood(player);
    }
  }

  function updateSnake(snake, dt) {
    if (!snake.alive || snake.segments.length === 0) return;

    snake.invulnerable = Math.max(0, snake.invulnerable - dt);
    snake.stun = Math.max(0, snake.stun - dt);
    snake.spitCooldown = Math.max(0, snake.spitCooldown - dt);

    if (!snake.isHuman || snake.demoBot) updateAi(snake, dt);

    const head = snake.segments[0];
    const margin = 80;
    if (head.x < WORLD_MIN + margin || head.x > WORLD_MAX - margin || head.y < WORLD_MIN + margin || head.y > WORLD_MAX - margin) {
      snake.targetAngle = angleLerp(snake.targetAngle, angleTo(head.x, head.y, 0, 0), 0.34);
    }

    updateLengthCharges(snake, dt);
    updateMergeEnergy(snake, dt);

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
      shedBoostFood(snake, dt);
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
      const gap = desiredGap(snake, index);
      const tx = previous.x + (dx / distance) * gap;
      const ty = previous.y + (dy / distance) * gap;

      segment.x = lerp(segment.x, tx, follow);
      segment.y = lerp(segment.y, ty, follow);
      segment.wobble += dt * (1.8 + index * 0.02);
    }
  }

  function updateFoodCollision() {
    for (const snake of game.snakes) {
      if (!snake.alive) continue;

      const head = snake.segments[0];
      const radius = segmentRadius(snake, 0);

      for (let index = game.foods.length - 1; index >= 0; index -= 1) {
        const food = game.foods[index];
        const eatDistance = radius + food.radius * 0.65;

        if (distSq(head.x, head.y, food.x, food.y) < eatDistance * eatDistance) {
          game.foods.splice(index, 1);
          growSnake(snake, food.mass);
          addParticles(food.x, food.y, food.color, snake.isPlayer ? 5 : 2, 0.42);
        }
      }
    }
  }

  function settleShotAsFood(shot) {
    spawnFood(
      clamp(shot.x, WORLD_MIN + 24, WORLD_MAX - 24),
      clamp(shot.y, WORLD_MIN + 24, WORLD_MAX - 24),
      Math.max(1.2, shot.mass),
      shot.color,
      false,
    );
  }

  function findShotAbsorber(shot) {
    for (const snake of game.snakes) {
      if (!snake.alive || snake === shot.owner) continue;

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

  function updateShots(dt) {
    for (let shotIndex = game.shots.length - 1; shotIndex >= 0; shotIndex -= 1) {
      const shot = game.shots[shotIndex];
      shot.age += dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.spin += dt * 14;

      let removeShot = false;
      if (shot.age >= shot.life || shot.x < WORLD_MIN || shot.x > WORLD_MAX || shot.y < WORLD_MIN || shot.y > WORLD_MAX) {
        settleShotAsFood(shot);
        removeShot = true;
      } else {
        const absorber = findShotAbsorber(shot);
        if (absorber) {
          growSnake(absorber, shot.mass * 0.96);
          addParticles(shot.x, shot.y, absorber.color.main, absorber.isPlayer ? 5 : 3, 0.42);
          addText(shot.x, shot.y - 18, "YUMMY", absorber.color.light);
          removeShot = true;
        } else {
          for (const spike of game.spikes) {
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
            addParticles(shot.x, shot.y, "#75f0a4", 16, 0.92);
            addText(spike.x, spike.y - 18, "PUSH", shot.owner?.color?.light || "#75f0a4");
            removeShot = true;
            break;
          }
        }
      }

      if (removeShot) {
        game.shots.splice(shotIndex, 1);
      }
    }
  }

  function updateSpikeCollision(dt) {
    for (let spikeIndex = game.spikes.length - 1; spikeIndex >= 0; spikeIndex -= 1) {
      const spike = game.spikes[spikeIndex];
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

      for (const snake of game.snakes) {
        if (!snake.alive) continue;

        for (let segmentIndex = 0; segmentIndex < snake.segments.length; segmentIndex += 1) {
          const segment = snake.segments[segmentIndex];
          const radius = segmentIndex === 0 ? segmentRadius(snake, 0) : collisionRadius(snake, segmentIndex);
          if (radius < 2.4) continue;

          const trigger = radius + spike.radius * 0.72;
          if (distSq(segment.x, segment.y, spike.x, spike.y) >= trigger * trigger) continue;

          game.spikes.splice(spikeIndex, 1);
          splitSnakeBySpike(snake, spike);
          spawnSpike();
          break;
        }

        if (!game.spikes.includes(spike)) break;
      }
    }
  }

  function resolveHeadPair(a, b) {
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
      killSnake(b, a);
      return;
    }

    if (bm > am * 1.18) {
      killSnake(a, b);
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

  function resolveHeadToBody(attacker, defender) {
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
        severSnake(defender, index, attacker);
      } else {
        killSnake(attacker, defender);
      }

      return true;
    }

    return false;
  }

  function resolveSnakeCollisions() {
    const snakes = game.snakes;

    for (let a = 0; a < snakes.length; a += 1) {
      for (let b = a + 1; b < snakes.length; b += 1) {
        resolveHeadPair(snakes[a], snakes[b]);
      }
    }

    for (const attacker of snakes) {
      if (!attacker.alive) continue;

      for (const defender of snakes) {
        if (!attacker.alive) break;
        if (!defender.alive || attacker === defender) continue;
        if (resolveHeadToBody(attacker, defender)) break;
      }
    }
  }

  function respawnSnakeBody(snake) {
    const x = worldRand();
    const y = worldRand();
    const angle = Math.random() * TAU;
    const startMass = randomRange(15.5, 17.5);

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
  }

  function respawnOnlineHumans(dt) {
    if (!onlineGame.active || !onlineGame.hosting) return;

    for (const snake of game.snakes) {
      if (!snake.isHuman || snake.alive) continue;
      snake.respawnTimer = Math.max(0, (snake.respawnTimer || 2.6) - dt);
      if (snake.respawnTimer <= 0) {
        respawnSnakeBody(snake);
        addText(snake.segments[0].x, snake.segments[0].y - 24, "READY", snake.color.light);
      }
    }
  }

  function maintainWorld(dt) {
    while (ambientFoodCount() < FOOD_TARGET) spawnFood();
    trimDroppedFood();
    while (game.spikes.length < SPIKE_TARGET) spawnSpike();

    respawnOnlineHumans(dt);

    const aiTarget = onlineGame.active ? Math.max(0, 11 - game.snakes.filter((snake) => snake.isHuman).length) : AI_TARGET;
    const aiCount = game.snakes.filter((snake) => snake.alive && !snake.isHuman).length;
    if (aiCount < aiTarget) {
      game.respawnClock -= dt;
      if (game.respawnClock <= 0) {
        game.respawnClock = 1.2;
        spawnAiSnake();
      }
    }
  }

  function updateParticles(dt) {
    for (let index = game.particles.length - 1; index >= 0; index -= 1) {
      const particle = game.particles[index];
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - dt * 2.4;
      particle.vy *= 1 - dt * 2.4;

      if (particle.age >= particle.life) {
        game.particles.splice(index, 1);
      }
    }

    for (let index = game.texts.length - 1; index >= 0; index -= 1) {
      const text = game.texts[index];
      text.age += dt;
      text.y += text.vy * dt;

      if (text.age >= text.life) {
        game.texts.splice(index, 1);
      }
    }
  }

  function updateCamera(dt) {
    const player = game.player;
    if (!player || !player.segments.length) return;

    const head = player.segments[0];
    const mass = totalMass(player);
    const targetZoom = clamp(1.08 - Math.sqrt(mass) * 0.018, 0.56, 1.02);

    game.camera.x = lerp(game.camera.x, head.x, 1 - Math.exp(-dt * 5.4));
    game.camera.y = lerp(game.camera.y, head.y, 1 - Math.exp(-dt * 5.4));
    game.camera.zoom = lerp(game.camera.zoom, targetZoom, 1 - Math.exp(-dt * 2.4));
  }

  function updateUi(dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.classList.remove("show");
    }

    const player = game.player;
    if (!player) return;

    const playerMass = Math.round(totalMass(player));
    const aliveSnakes = game.snakes.filter((snake) => snake.alive);
    const sorted = aliveSnakes.slice().sort((a, b) => totalMass(b) - totalMass(a));
    const rank = sorted.findIndex((snake) => snake === player) + 1;

    massValue.textContent = playerMass.toString();
    lengthValue.textContent = player.alive ? player.segments.length.toString() : "0";
    rankValue.textContent = `${rank > 0 ? rank : "-"} / ${Math.max(1, sorted.length)}`;
    mergeFill.style.width = `${Math.round(player.mergeEnergy * 100)}%`;
    mergeMeter.classList.toggle("low", player.mergeEnergy < 0.28);
    mergeMeter.classList.toggle("empty", player.mergeEnergy <= 0.02);
    lengthenFill.style.width = `${Math.round(player.lengthenCharge * 100)}%`;
    shortenFill.style.width = `${Math.round(player.shortenCharge * 100)}%`;
    lengthenFill.parentElement.classList.toggle("ready", player.lengthenCharge >= 1);
    shortenFill.parentElement.classList.toggle("ready", player.shortenCharge >= 1);
  }

  function update(dt) {
    updatePointerWorld();
    sendOnlineInput(dt);

    if (game.paused || game.gameOver) {
      updateUi(dt);
      updateCamera(dt);
      return;
    }

    if (onlineGame.active && !onlineGame.hosting) {
      onlineGame.snapshotAge += dt;
      updateParticles(dt);
      updateCamera(dt);
      updateUi(dt);
      return;
    }

    if (onlineGame.active) {
      applyOnlineHostInputs();
    } else {
      updatePlayerInput();
    }

    for (const snake of game.snakes) updateSnake(snake, dt);

    updateFoodCollision();
    updateShots(dt);
    updateSpikeCollision(dt);
    resolveSnakeCollisions();

    game.snakes = game.snakes.filter((snake) => snake.alive || snake.isPlayer || snake.isHuman);
    maintainWorld(dt);
    updateParticles(dt);
    updateCamera(dt);
    updateUi(dt);
    maybeSendOnlineWorldState(dt);
  }

  function isVisible(x, y, radius = 0) {
    const left = game.camera.x - width / 2 / game.camera.zoom - radius;
    const right = game.camera.x + width / 2 / game.camera.zoom + radius;
    const top = game.camera.y - height / 2 / game.camera.zoom - radius;
    const bottom = game.camera.y + height / 2 / game.camera.zoom + radius;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  function drawWorldBase() {
    ctx.fillStyle = "#080b12";
    ctx.fillRect(WORLD_MIN - 900, WORLD_MIN - 900, WORLD_SIZE + 1800, WORLD_SIZE + 1800);

    const grid = 120;
    const left = game.camera.x - width / 2 / game.camera.zoom - grid;
    const right = game.camera.x + width / 2 / game.camera.zoom + grid;
    const top = game.camera.y - height / 2 / game.camera.zoom - grid;
    const bottom = game.camera.y + height / 2 / game.camera.zoom + grid;

    ctx.lineWidth = 1 / game.camera.zoom;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
    ctx.beginPath();

    for (let x = Math.floor(left / grid) * grid; x <= right; x += grid) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }

    for (let y = Math.floor(top / grid) * grid; y <= bottom; y += grid) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }

    ctx.stroke();

    ctx.strokeStyle = "rgba(77, 224, 255, 0.35)";
    ctx.lineWidth = 5 / game.camera.zoom;
    ctx.strokeRect(WORLD_MIN, WORLD_MIN, WORLD_SIZE, WORLD_SIZE);
  }

  function drawFood() {
    for (const food of game.foods) {
      if (!isVisible(food.x, food.y, food.radius + 10)) continue;

      food.spin += 0.01;
      ctx.save();
      ctx.translate(food.x, food.y);
      ctx.rotate(food.spin);

      ctx.fillStyle = food.color;
      ctx.shadowColor = food.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, food.radius, 0, TAU);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.beginPath();
      ctx.arc(-food.radius * 0.28, -food.radius * 0.34, Math.max(1.2, food.radius * 0.24), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawShots() {
    for (const shot of game.shots) {
      if (!isVisible(shot.x, shot.y, shot.radius + 18)) continue;

      ctx.save();
      ctx.translate(shot.x, shot.y);
      ctx.rotate(shot.spin);
      ctx.shadowColor = shot.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = shot.color;
      ctx.beginPath();
      ctx.arc(0, 0, shot.radius, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
      ctx.lineWidth = 2 / game.camera.zoom;
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.beginPath();
      ctx.arc(-shot.radius * 0.24, -shot.radius * 0.32, Math.max(1.2, shot.radius * 0.22), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSpikes() {
    for (const spike of game.spikes) {
      if (!isVisible(spike.x, spike.y, spike.radius + 28)) continue;

      spike.spin += 0.006;
      ctx.save();
      ctx.translate(spike.x, spike.y);
      ctx.rotate(spike.spin);
      ctx.shadowColor = "#75f0a4";
      ctx.shadowBlur = 16;
      ctx.beginPath();

      const points = 22;
      for (let index = 0; index < points; index += 1) {
        const angle = (index / points) * TAU;
        const radius = index % 2 === 0 ? spike.radius * 1.18 : spike.radius * 0.72;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.fillStyle = "#75f0a4";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(224, 255, 233, 0.78)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "#208b48";
      ctx.beginPath();
      ctx.arc(0, 0, spike.radius * 0.36, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function makeSnakeGradient(x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.45, radius * 0.08, x, y, radius);
    gradient.addColorStop(0, color.light);
    gradient.addColorStop(0.32, color.main);
    gradient.addColorStop(1, color.dark);
    return gradient;
  }

  function buildSnakePath(snake) {
    const points = snake.segments.map((segment) => ({ x: segment.x, y: segment.y }));
    const distances = [0];
    let total = 0;

    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      distances.push(total);
    }

    return { points, distances, total };
  }

  function sampleSnakePath(path, distanceFromHead) {
    if (path.points.length === 0) return { x: 0, y: 0 };
    if (distanceFromHead <= 0) return path.points[0];
    if (distanceFromHead >= path.total) return path.points[path.points.length - 1];

    for (let index = 1; index < path.points.length; index += 1) {
      if (path.distances[index] < distanceFromHead) continue;

      const previousDistance = path.distances[index - 1];
      const segmentLength = Math.max(0.001, path.distances[index] - previousDistance);
      const t = (distanceFromHead - previousDistance) / segmentLength;
      const previous = path.points[index - 1];
      const current = path.points[index];

      return {
        x: lerp(previous.x, current.x, t),
        y: lerp(previous.y, current.y, t),
      };
    }

    return path.points[path.points.length - 1];
  }

  function drawEyes(snake, x, y, radius) {
    const forward = snake.angle;
    const side = forward + Math.PI / 2;
    const eyeForward = radius * 0.38;
    const eyeSide = radius * 0.28;
    const eyeRadius = clamp(radius * 0.13, 2.2, 7.5);

    for (const sign of [-1, 1]) {
      const ex = x + Math.cos(forward) * eyeForward + Math.cos(side) * eyeSide * sign;
      const ey = y + Math.sin(forward) * eyeForward + Math.sin(side) * eyeSide * sign;
      const px = ex + Math.cos(forward) * eyeRadius * 0.38;
      const py = ey + Math.sin(forward) * eyeRadius * 0.38;

      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#071018";
      ctx.beginPath();
      ctx.arc(px, py, eyeRadius * 0.48, 0, TAU);
      ctx.fill();
    }
  }

  function drawSnakeName(snake, x, y, radius) {
    if (!snake.name) return;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(12, 16 / game.camera.zoom)}px Inter, sans-serif`;
    ctx.lineWidth = 4 / game.camera.zoom;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillStyle = snake.isPlayer ? "#ffffff" : "rgba(255, 255, 255, 0.92)";
    ctx.strokeText(snake.name, x, y - radius - 14);
    ctx.fillText(snake.name, x, y - radius - 14);
    ctx.restore();
  }

  function drawMergeTrail(snake, path) {
    if (snake.merge <= 0.04 || snake.segments.length < 3) return;

    const baseRadius = normalSegmentRadius(snake);
    const alpha = 0.16 + snake.merge * 0.36;
    const lineWidth = Math.max(2.5 / game.camera.zoom, baseRadius * (0.18 + snake.merge * 0.12));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = snake.color.main;
    ctx.shadowColor = snake.color.main;
    ctx.shadowBlur = 10;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    const tail = path.points[path.points.length - 1];
    ctx.moveTo(tail.x, tail.y);
    for (let index = path.points.length - 2; index >= 0; index -= 1) {
      const point = path.points[index];
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    const beadRadius = Math.max(1.8 / game.camera.zoom, baseRadius * 0.13);
    ctx.fillStyle = snake.color.light;
    for (let index = 1; index < snake.segments.length; index += 1) {
      const segment = snake.segments[index];
      ctx.beginPath();
      ctx.arc(segment.x, segment.y, beadRadius, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSnake(snake) {
    if (!snake.alive || !snake.segments.length) return;

    const path = buildSnakePath(snake);
    drawMergeTrail(snake, path);

    for (let index = snake.segments.length - 1; index >= 0; index -= 1) {
      const segment = snake.segments[index];
      let x = segment.x;
      let y = segment.y;
      let radius = segmentRadius(snake, index);
      let alpha = 1;

      if (index > 0) {
        const travel = segmentTravelProgress(snake, index);
        const absorb = segmentAbsorbProgress(snake, index);
        const originalDistance = path.distances[index] || 0;
        const point = sampleSnakePath(path, originalDistance * (1 - travel));

        x = point.x;
        y = point.y;
        radius *= 1 - absorb * 0.92;
        alpha = 1 - absorb;

        if (absorb > 0.985 || radius < 1.5 || alpha < 0.02) continue;
      }

      if (radius < 1.5 || !isVisible(x, y, radius + 22)) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = snake.color.main;
      ctx.shadowBlur = index === 0 ? 18 : 8;
      ctx.fillStyle = makeSnakeGradient(x, y, radius, snake.color);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.lineWidth = index === 0 ? 3.2 / game.camera.zoom : 1.5 / game.camera.zoom;
      ctx.strokeStyle = index === 0 ? snake.color.ring : "rgba(255, 255, 255, 0.28)";
      ctx.stroke();

      if (index > 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.beginPath();
        ctx.arc(
          x - radius * 0.25,
          y - radius * 0.3,
          Math.max(1.2, radius * 0.12),
          0,
          TAU,
        );
        ctx.fill();
      }

      if (index === 0) {
        drawEyes(snake, x, y, radius);
        drawSnakeName(snake, x, y, radius);
      }

      ctx.restore();
    }

    if (snake.isPlayer && snake.merge > 0.08) {
      const head = snake.segments[0];
      const radius = segmentRadius(snake, 0);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.16 + snake.merge * 0.34})`;
      ctx.lineWidth = 6 / game.camera.zoom;
      ctx.beginPath();
      ctx.arc(head.x, head.y, radius + 8 + Math.sin(game.elapsed * 7) * 2, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      if (!isVisible(particle.x, particle.y, particle.radius + 10)) continue;

      const fade = 1 - particle.age / particle.life;
      ctx.globalAlpha = fade;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * (0.45 + fade), 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${24 / game.camera.zoom}px Inter, sans-serif`;
    ctx.lineWidth = 5 / game.camera.zoom;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.52)";

    for (const text of game.texts) {
      const fade = 1 - text.age / text.life;
      ctx.globalAlpha = fade;
      ctx.fillStyle = text.color;
      ctx.strokeText(text.value, text.x, text.y);
      ctx.fillText(text.value, text.x, text.y);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawMinimap() {
    const size = clamp(Math.min(width, height) * 0.18, 92, 150);
    const x = width - size - 16;
    const y = height - size - 16;
    const scale = size / WORLD_SIZE;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(8, 11, 18, 0.68)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 8);
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    for (const spike of game.spikes) {
      ctx.fillStyle = "#75f0a4";
      ctx.fillRect(x + (spike.x - WORLD_MIN) * scale - 1, y + (spike.y - WORLD_MIN) * scale - 1, 2, 2);
    }

    for (const snake of game.snakes) {
      if (!snake.alive) continue;
      const head = snake.segments[0];
      const dot = snake.isPlayer ? 4 : 3;
      ctx.fillStyle = snake.isPlayer ? "#ffffff" : snake.color.main;
      ctx.beginPath();
      ctx.arc(x + (head.x - WORLD_MIN) * scale, y + (head.y - WORLD_MIN) * scale, dot, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPausedShade() {
    if (!game.paused || game.gameOver) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(5, 8, 13, 0.28)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 30px Inter, sans-serif";
    ctx.fillText("PAUSED", width / 2, height / 2);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#080b12";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(game.camera.zoom, game.camera.zoom);
    ctx.translate(-game.camera.x, -game.camera.y);

    drawWorldBase();
    drawFood();
    drawShots();
    drawSpikes();

    const snakesByMass = game.snakes
      .filter((snake) => snake.alive)
      .slice()
      .sort((a, b) => totalMass(a) - totalMass(b));

    for (const snake of snakesByMass) drawSnake(snake);
    drawParticles();
    drawTexts();

    ctx.restore();
    drawMinimap();
    drawPausedShade();
  }

  function spawnAiSnake() {
    const color = palettes[(game.snakes.length + randomInt(0, palettes.length - 1)) % palettes.length];
    let x = worldRand();
    let y = worldRand();

    if (game.player && game.player.segments.length) {
      const playerHead = game.player.segments[0];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        x = worldRand();
        y = worldRand();
        if (distSq(x, y, playerHead.x, playerHead.y) > 720 * 720) break;
      }
    }

    const snake = createSnake(100 + game.snakes.length + Math.floor(Math.random() * 1000), x, y, color, false);
    game.snakes.push(snake);
  }

  function resetGame(options = {}) {
    const menu = Boolean(options.menu);
    const silent = Boolean(options.silent);
    const onlineRoomOption = options.onlineRoom || null;

    if (!onlineRoomOption) {
      onlineGame.active = false;
      onlineGame.hosting = false;
      onlineGame.roomCode = null;
      onlineGame.hostId = null;
      onlineGame.inputs.clear();
    }

    game.snakes = [];
    game.foods = [];
    game.shots = [];
    game.spikes = [];
    game.particles = [];
    game.texts = [];
    game.paused = false;
    game.gameOver = false;
    game.exitPromptOpen = false;
    game.pauseBeforeExitPrompt = false;
    game.elapsed = 0;
    game.respawnClock = 0.3;
    keys.clear();
    pointer.leftDown = false;
    gameOverPanel.hidden = true;
    exitPromptPanel.hidden = true;

    if (onlineRoomOption) {
      const participants = onlineParticipants(onlineRoomOption);
      const spawnRadius = 470;

      participants.forEach((participant, index) => {
        const angle = (index / Math.max(1, participants.length)) * TAU + randomRange(-0.18, 0.18);
        const x = Math.cos(angle) * spawnRadius + randomRange(-90, 90);
        const y = Math.sin(angle) * spawnRadius + randomRange(-90, 90);
        const skinIndex = clamp(Number.isInteger(participant.skinIndex) ? participant.skinIndex : index, 0, palettes.length - 1);
        const isLocalPlayer = participant.id === onlineSelfId;
        const snake = createSnake(participant.id, x, y, paletteForSkin(skinIndex), isLocalPlayer, {
          name: participant.name,
          skinIndex,
          isHuman: participant.isHuman,
          invulnerable: 1.2,
        });
        game.snakes.push(snake);
        if (isLocalPlayer) game.player = snake;
      });

      game.player ||= game.snakes.find((snake) => snake.isHuman) || game.snakes[0] || null;
    } else {
      const spawnX = randomRange(-220, 220);
      const spawnY = randomRange(-220, 220);
      const playerColor = currentPlayerPalette();
      game.player = createSnake(0, spawnX, spawnY, playerColor, true, {
        name: profile.name,
        skinIndex: profile.skinIndex,
        demoBot: menu,
        invulnerable: menu ? Number.POSITIVE_INFINITY : 0.75,
      });
      game.snakes.push(game.player);
    }

    game.camera.x = game.player.segments[0].x;
    game.camera.y = game.player.segments[0].y;
    game.camera.zoom = menu ? 0.86 : 0.92;

    for (let index = 0; index < FOOD_TARGET; index += 1) spawnFood();
    for (let index = 0; index < SPIKE_TARGET; index += 1) spawnSpike();
    if (!onlineRoomOption) {
      for (let index = 0; index < AI_TARGET; index += 1) spawnAiSnake();
    }

    setMenuVisibility(menu);
    pauseButton.textContent = "II";
    if (!silent) {
      showToast(menu ? "The SnakeBall Battle" : `Ready, ${profile.name}`);
    }
  }

  function togglePause() {
    if (game.gameOver || game.menuOpen || game.exitPromptOpen) return;
    game.paused = !game.paused;
    pauseButton.textContent = game.paused ? ">" : "II";
    showToast(game.paused ? "PAUSED" : "GO");
  }

  function frame(now) {
    if (!game.lastTime) game.lastTime = now;
    const dt = Math.min(MAX_DT, (now - game.lastTime) / 1000 || 0);
    game.lastTime = now;
    game.elapsed += dt;

    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }

    if (isTutorialOpen()) {
      if (event.code === "Escape") {
        event.preventDefault();
        closeTutorial();
      }
      return;
    }

    if (game.exitPromptOpen) {
      if (event.code === "Escape") {
        event.preventDefault();
        closeExitPrompt();
      }
      return;
    }

    if (game.menuOpen) {
      if (document.activeElement === roomCodeInput) return;
      if (event.code === "Enter") {
        event.preventDefault();
        startMatch();
      }
      return;
    }

    if (document.activeElement === playerNameInput) return;

    if (game.gameOver) {
      if (event.code === "Enter" || event.code === "KeyR") resetGame({ menu: false, silent: true });
      if (event.code === "Escape") {
        event.preventDefault();
        returnToLobby();
      }
      return;
    }

    if (event.code === "Escape") {
      event.preventDefault();
      openExitPrompt();
      return;
    }

    keys.add(event.code);

    if (!event.repeat && event.code === "KeyQ") {
      if (onlineGame.active) sendOnlineLengthCommand(LENGTH_ADJUST_STEP);
      else adjustSnakeLength(game.player, LENGTH_ADJUST_STEP);
    }
    if (!event.repeat && event.code === "KeyE") {
      if (onlineGame.active) sendOnlineLengthCommand(-LENGTH_ADJUST_STEP);
      else adjustSnakeLength(game.player, -LENGTH_ADJUST_STEP);
    }
    if (!onlineGame.active && !event.repeat && event.code === "KeyF") spitFood(game.player);
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyR") resetGame({ menu: false, silent: true });
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  canvas.addEventListener("pointermove", (event) => {
    pointer.active = true;
    pointer.screenX = event.clientX;
    pointer.screenY = event.clientY;
    pointer.leftDown = (event.buttons & 1) === 1;
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointer.active = true;
    pointer.screenX = event.clientX;
    pointer.screenY = event.clientY;
    if (event.button === 0) pointer.leftDown = true;
    canvas.setPointerCapture(event.pointerId);
  });

  window.addEventListener("pointerup", (event) => {
    if (event.button === 0) pointer.leftDown = false;
  });

  window.addEventListener("pointercancel", () => {
    pointer.leftDown = false;
  });

  playerNameInput.addEventListener("input", syncProfileFromInput);
  startPlayButton.addEventListener("click", startMatch);
  createRoomButton.addEventListener("click", createOnlineRoom);
  quickMatchButton.addEventListener("click", quickMatchOnline);
  joinRoomButton.addEventListener("click", joinOnlineRoom);
  roomCodeInput.addEventListener("input", () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  });
  roomCodeInput.addEventListener("keydown", (event) => {
    if (event.code === "Enter") {
      event.preventDefault();
      joinOnlineRoom();
    }
  });
  tutorialOpenButton.addEventListener("click", openTutorial);
  tutorialCloseButton.addEventListener("click", closeTutorial);
  tutorialPanel.addEventListener("click", (event) => {
    if (event.target === tutorialPanel) closeTutorial();
  });
  tutorialNextButton.addEventListener("click", () => {
    tutorialPageIndex = (tutorialPageIndex + 1) % 3;
    renderTutorialPanel();
  });
  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", () => resetGame({ menu: false, silent: true }));
  playAgainButton.addEventListener("click", () => resetGame({ menu: false, silent: true }));
  gameOverLobbyButton.addEventListener("click", returnToLobby);
  stayInGameButton.addEventListener("click", closeExitPrompt);
  confirmLobbyButton.addEventListener("click", returnToLobby);

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      this.moveTo(x + radius, y);
      this.arcTo(x + w, y, x + w, y + h, radius);
      this.arcTo(x + w, y + h, x, y + h, radius);
      this.arcTo(x, y + h, x, y, radius);
      this.arcTo(x, y, x + w, y, radius);
      return this;
    };
  }

  loadProfile();
  playerNameInput.value = profile.name;
  renderSkinChoices();
  updateSkinPreview();
  renderTutorialPanel();
  resize();
  resetGame({ menu: true, silent: true });
  requestAnimationFrame(frame);
})();
