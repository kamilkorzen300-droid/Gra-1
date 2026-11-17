import * as THREE from "three";

const $ = id => document.getElementById(id);

let token = "";
let nick = "";
let coins = 0;
let kills = 0;

let scene, camera, renderer, clock;
let player, socket;
let yaw = 0;
let pitch = 0.2;
let velocityY = 0;
let onGround = true;

const keys = {};
const remote = new Map();
const bullets = [];
const enemies = [];

let moveStick = { x: 0, z: 0 };
let lastSend = 0;

async function auth(mode) {
  const message = $("authMessage");

  try {
    const response = await fetch("/api/" + mode, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nick: $("nick").value.trim(),
        password: $("password").value
      })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    token = data.token;
    nick = data.nick;
    coins = data.coins;

    $("auth").hidden = true;
    $("game").hidden = false;

    $("hudNick").textContent = nick;
    $("coins").textContent = coins;

    startGame();

  } catch (error) {
    message.textContent = error.message;
  }
}

$("login").onclick = () => auth("login");
$("register").onclick = () => auth("register");

function mat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8
  });
}

function box(parent, w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat(color)
  );

  mesh.position.set(x, y, z);
  parent.add(mesh);

  return mesh;
}

function sphere(parent, radius, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    mat(color)
  );

  mesh.position.set(x, y, z);
  parent.add(mesh);

  return mesh;
}

// NORMALNY LUDZIK 3D
function makeHuman(color = 0x287bd1) {
  const root = new THREE.Group();

  // TUŁÓW
  box(root, 0.62, 0.82, 0.34, color, 0, 1.35, 0);

  // GŁOWA
  sphere(root, 0.24, 0xe6b88f, 0, 1.98, 0);

  // SZYJA
  box(root, 0.18, 0.16, 0.18, 0xe6b88f, 0, 1.83, 0);

  // LEWA RĘKA
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.42, 1.65, 0);
  root.add(leftArm);

  box(leftArm, 0.19, 0.62, 0.2,
      0xe6b88f, 0, -0.28, 0);

  // PRAWA RĘKA
  const rightArm = new THREE.Group();
  rightArm.position.set(0.42, 1.65, 0);
  root.add(rightArm);

  box(rightArm, 0.19, 0.62, 0.2,
      0xe6b88f, 0, -0.28, 0);

  // LEWA NOGA
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.19, 0.95, 0);
  root.add(leftLeg);

  box(leftLeg, 0.23, 0.66, 0.25,
      0x263448, 0, -0.31, 0);

  // LEWY BUT
  box(leftLeg, 0.25, 0.15, 0.42,
      0x171717, 0, -0.62, 0.08);

  // PRAWA NOGA
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.19, 0.95, 0);
  root.add(rightLeg);

  box(rightLeg, 0.23, 0.66, 0.25,
      0x263448, 0, -0.31, 0);

  // PRAWY BUT
  box(rightLeg, 0.25, 0.15, 0.42,
      0x171717, 0, -0.62, 0.08);

  // BROŃ
  box(root, 0.16, 0.16, 0.82,
      0x242a30, 0.42, 1.42, -0.48);

  box(root, 0.12, 0.25, 0.18,
      0x111820, 0.42, 1.24, -0.35);

  root.userData = {
    leftLeg,
    rightLeg,
    leftArm,
    rightArm
  };

  return root;
}

function makeWorld() {
  scene = new THREE.Scene();

  scene.background = new THREE.Color(0x9bc5df);
  scene.fog = new THREE.Fog(0x9bc5df, 35, 95);

  camera = new THREE.PerspectiveCamera(
    70,
    innerWidth / innerHeight,
    0.1,
    150
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(
    0xffffff,
    0x566070,
    2
  ));

  const sun = new THREE.DirectionalLight(
    0xffffff,
    2.2
  );

  sun.position.set(15, 25, 10);
  sun.castShadow = true;
  scene.add(sun);

  // PODŁOGA
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 110),
    mat(0x66765b)
  );

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(
    110, 55, 0x43513e, 0x59664f
  );

  grid.position.y = 0.015;
  scene.add(grid);

  // MAGAZYNY
  for (let i = 0; i < 4; i++) {
    const z = -18 + i * 12;

    box(scene, 12, 6, 7,
        0x8b9298, -17, 3, z);

    box(scene, 12.2, 0.35, 7.2,
        0x3d4a55, -17, 6.1, z);

    box(scene, 2.4, 3.8, 0.15,
        0x293947, -17, 1.9, z + 3.58);

    box(scene, 12, 6, 7,
        0x9b8064, 17, 3, z + 5);

    box(scene, 12.2, 0.35, 7.2,
        0x4c4038, 17, 6.1, z + 5);
  }

  // SKRZYNIE
  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 65;
    const z = (Math.random() - 0.5) * 65;

    box(scene, 1.5, 1.4, 1.5,
        0x80552d, x, 0.7, z);
  }

  // NASZ GRACZ
  player = makeHuman();
  scene.add(player);
  player.position.set(0, 0, 5);

  clock = new THREE.Clock();
}

function addEnemy() {
  const enemy = makeHuman(0xb83b35);

  enemy.position.set(
    (Math.random() - 0.5) * 35,
    0,
    -12 - Math.random() * 25
  );

  scene.add(enemy);

  enemies.push({
    mesh: enemy,
    hp: 100
  });
}

function shoot() {
  const direction = new THREE.Vector3(
    Math.sin(yaw),
    0,
    -Math.cos(yaw)
  );

  const origin = player.position.clone();

  origin.y += 1.45;
  origin.add(direction.clone().multiplyScalar(0.7));

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    mat(0xffdf66)
  );

  mesh.position.copy(origin);
  scene.add(mesh);

  bullets.push({
    mesh,
    direction,
    life: 1.2
  });

  if (socket) socket.emit("player:shoot");
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];

    bullet.mesh.position.addScaledVector(
      bullet.direction,
      35 * dt
    );

    bullet.life -= dt;

    let hit = false;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];

      const target = enemy.mesh.position.clone();
      target.y += 1;

      if (bullet.mesh.position.distanceTo(target) < 0.9) {
        enemy.hp -= 50;
        hit = true;

        if (enemy.hp <= 0) {
          scene.remove(enemy.mesh);
          enemies.splice(j, 1);

          kills++;
          coins += 15;

          $("kills").textContent = kills;
          $("coins").textContent = coins;

          showNotice("+15 monet!");
          addEnemy();
        }

        break;
      }
    }

    if (hit || bullet.life <= 0) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }
}

function showNotice(text) {
  $("notice").textContent = text;

  setTimeout(() => {
    $("notice").textContent = "";
  }, 1400);
}

function addRemote(p) {
  if (!scene || p.id === socket.id || remote.has(p.id)) return;

  const mesh = makeHuman(0x35a878);

  scene.add(mesh);

  remote.set(p.id, {
    mesh,
    nick: p.nick
  });

  updateRemote(p);
}

function updateRemote(p) {
  const r = remote.get(p.id);

  if (!r) return;

  r.mesh.position.set(p.x, 0, p.z);
  r.mesh.rotation.y = p.rot;
}

function jump() {
  if (onGround) {
    velocityY = 7;
    onGround = false;
  }
}

function setupStick() {
  const stick = $("stick");
  const knob = $("knob");

  let active = false;

  function move(e) {
    const r = stick.getBoundingClientRect();

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    let dx = e.clientX - cx;
    let dy = e.clientY - cy;

    const length = Math.hypot(dx, dy);
    const max = 38;

    if (length > max) {
      dx = dx / length * max;
      dy = dy / length * max;
    }

    moveStick = {
      x: dx / max,
      z: dy / max
    };

    knob.style.transform =
      `translate(${dx}px, ${dy}px)`;
  }

  stick.addEventListener("pointerdown", e => {
    active = true;
    stick.setPointerCapture(e.pointerId);
    move(e);
  });

  stick.addEventListener("pointermove", e => {
    if (active) move(e);
  });

  function end() {
    active = false;
    moveStick = { x: 0, z: 0 };
    knob.style.transform = "translate(0,0)";
  }

  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);
}

function startGame() {
  makeWorld();

  socket = io({
    auth: { token }
  });

  socket.on("connect_error", e => {
    showNotice(e.message);
  });

  socket.on("world:players", list => {
    list.forEach(addRemote);
  });

  socket.on("player:join", addRemote);
  socket.on("player:update", updateRemote);

  socket.on("player:leave", id => {
    const r = remote.get(id);

    if (r) {
      scene.remove(r.mesh);
      remote.delete(id);
    }
  });

  // KLAWISZE
  window.addEventListener("keydown", e => {
    keys[e.code] = true;

    if (e.code === "Space") jump();
  });

  window.addEventListener("keyup", e => {
    keys[e.code] = false;
  });

  // MYSZ
  window.addEventListener("mousemove", e => {
    if (document.pointerLockElement === renderer.domElement) {
      yaw -= e.movementX * 0.0025;

      pitch = Math.max(
        -0.15,
        Math.min(0.65, pitch + e.movementY * 0.0018)
      );
    }
  });

  renderer.domElement.addEventListener("click", () => {
    renderer.domElement.requestPointerLock?.();
    shoot();
  });

  $("fire").addEventListener("pointerdown", e => {
    e.preventDefault();
    shoot();
  });

  $("jump").addEventListener("pointerdown", e => {
    e.preventDefault();
    jump();
  });

  setupStick();

  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(innerWidth, innerHeight);
  });

  animate();
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.04);

  let forward =
    (keys.KeyW || keys.ArrowUp ? 1 : 0) -
    (keys.KeyS || keys.ArrowDown ? 1 : 0) -
    moveStick.z;

  let side =
    (keys.KeyD || keys.ArrowRight ? 1 : 0) -
    (keys.KeyA || keys.ArrowLeft ? 1 : 0) +
    moveStick.x;

  const moving = Math.abs(forward) + Math.abs(side) > 0.08;

  const length = Math.hypot(forward, side) || 1;

  forward /= length;
  side /= length;

  const speed = 7;

  const dx =
    (Math.sin(yaw) * forward +
    Math.cos(yaw) * side) * speed * dt;

  const dz =
    (-Math.cos(yaw) * forward +
    Math.sin(yaw) * side) * speed * dt;

  player.position.x = THREE.MathUtils.clamp(
    player.position.x + dx, -48, 48
  );

  player.position.z = THREE.MathUtils.clamp(
    player.position.z + dz, -48, 48
  );

  player.rotation.y = yaw;

  // ANIMACJA CHODZENIA
  const ud = player.userData;

  const swing = moving
    ? Math.sin(performance.now() * 0.012) * 0.65
    : 0;

  ud.leftLeg.rotation.x = swing;
  ud.rightLeg.rotation.x = -swing;

  ud.leftArm.rotation.x = -swing * 0.55;
  ud.rightArm.rotation.x = -swing * 0.55;

  // SKAKANIE
  velocityY -= 18 * dt;
  player.position.y += velocityY * dt;

  if (player.position.y <= 0) {
    player.position.y = 0;
    velocityY = 0;
    onGround = true;
  }

  // KAMERA ZA POSTACIĄ
  const target = new THREE.Vector3(
    player.position.x,
    player.position.y + 2.3,
    player.position.z
  );

  const offset = new THREE.Vector3(
    Math.sin(yaw) * 5,
    2.4 + pitch * 2,
    Math.cos(yaw) * 5
  );

  camera.position.lerp(
    target.clone().add(offset),
    0.12
  );

  camera.lookAt(target);

  updateBullets(dt);

  // WYSYŁANIE POZYCJI DO SERWERA
  const now = performance.now();

  if (socket && socket.connected && now - lastSend > 70) {
    socket.emit("player:move", {
      x: player.position.x,
      z: player.position.z,
      rot: yaw,
      moving
    });

    lastSend = now;
  }

  renderer.render(scene, camera);
}

for (let i = 0; i < 6; i++) {
  addEnemy();
}
