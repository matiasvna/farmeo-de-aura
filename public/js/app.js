/**
 * ==============================================================================
 * FARMEO DE AURA 🗿 | TORNEO CICLOTRÓN - CORE LOGIC & FIREBASE SDK
 * ==============================================================================
 * Torneo de aura LOOKMAXING ZYZZ RIZZ GIGACHAD SIXSEVEN
 * SPA con estética Sigma/Mewing, ranking en tiempo real, ordenamiento interactivo
 * y Tribunal de Apelaciones de los viernes.
 */

// Importación de configuración modular limpia
import { firebaseConfig } from "./firebase-config.js";

// Importaciones modulares de Firebase v10 vía CDN ESM
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ==========================================================================
   1. PARTICIPANTES & ESTADO GLOBAL
   ========================================================================== */
const INITIAL_USERS = [
  { id: "caro", nombre: "Caro", total_aura: 0 },
  { id: "diego", nombre: "Diego", total_aura: 0 },
  { id: "nico", nombre: "Nico", total_aura: 0 },
  { id: "juank", nombre: "Juank", total_aura: 0 },
  { id: "pedro", nombre: "Pedro", total_aura: 0 },
  { id: "mati", nombre: "Mati", total_aura: 0 },
  { id: "ceci", nombre: "Ceci", total_aura: 0 },
  { id: "yamil", nombre: "Yamil", total_aura: 0 }
];

// Fotos circulares (PFP) asociadas a la carpeta farmeadores_de_aura
const USER_AVATARS = {
  caro: "farmeadores_de_aura/CARO.jpg",
  ceci: "farmeadores_de_aura/CECI.jpg",
  diego: "farmeadores_de_aura/DIEGO.jpg",
  juank: "farmeadores_de_aura/JUANK.jpg",
  mati: "farmeadores_de_aura/MATI.jpg",
  nico: "farmeadores_de_aura/NICO.jpg",
  pedro: "farmeadores_de_aura/PEDRO.jpg",
  yamil: "farmeadores_de_aura/YAMIL.jpg"
};

function getAvatarHtml(userId, userName, extraClass = '') {
  const normId = (userId || '').toLowerCase();
  const imgSrc = USER_AVATARS[normId] || `farmeadores_de_aura/${normId.toUpperCase()}.jpg`;
  const initial = (userName || 'A').charAt(0).toUpperCase();

  return `
    <img src="${imgSrc}" alt="${escapeHTML(userName)}" class="avatar-pfp-img ${extraClass}" 
         onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
    <span class="avatar-pfp-fallback" style="display:none;">${initial}</span>
  `;
}

let db = null;
let isFirebaseConnected = false;
let devTribunalBypass = false;

// Constantes criptográficas para autenticación de Superadmin del Tribunal
// NOTA DE SEGURIDAD: Las credenciales NUNCA se exponen en texto plano, únicamente sus hashes de un solo sentido.
const AUTH_SALT_U = "ciclotron_u_";
const AUTH_SALT_P = "ciclotron_p_";
const AUTH_DOC_ID = "76878d75c5ea0e4661602ba59522ff76443e4024b1cc8b8a08f0b2c00ad35c35";
const AUTH_P_HASH = "f49541a1e3faa3f439acee9538dfa3c607a99b0a1a62f5b470214b2e92aac67a";

// Función auxiliar de hashing SHA-256 estándar WebCrypto (sin dependencias externas)
async function hashWithSalt(salt, text) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Estado de la aplicación
let appState = {
  users: [],
  logs: [],
  currentView: 'ranking',
  sortOrder: 'desc', // 'desc' (Mayor a Menor) | 'asc' (Menor a Mayor)
  selectedLogToRevert: null,
  activeTribunalRange: 'week',
  isSuperadmin: sessionStorage.getItem("ciclotron_superadmin_auth") === "true",
  pendingLogToAppeal: null
};

/* ==========================================================================
   2. INICIALIZACIÓN DE FIREBASE & ALMACENAMIENTO LOCAL
   ========================================================================== */
async function initFirebase() {
  const isPlaceholder = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PLACEHOLDER");

  if (!isPlaceholder) {
    try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      isFirebaseConnected = true;
      console.log("⚡ Firebase conectado exitosamente a Firestore:", firebaseConfig.projectId);

      // Limpiar residuos de demo local para que Firestore sea la única fuente de verdad
      try {
        localStorage.removeItem("torneo_aura_users");
        localStorage.removeItem("torneo_aura_logs");
      } catch (e) {}

      await seedInitialUsersIfEmpty();
      subscribeToFirestore();
      return;
    } catch (err) {
      console.warn("⚠️ No se pudo conectar a Firebase Firestore. Activando almacenamiento reactivo local:", err);
    }
  } else {
    console.info("ℹ️ Firebase config en modo demo/local. Podés configurarlo en 'public/js/firebase-config.js'.");
  }

  // Fallback / Modo Local
  initLocalStorageFallback();
}

/**
 * Seeding inicial en Firestore si la colección 'users' está vacía
 */
async function seedInitialUsersIfEmpty() {
  if (!db) return;
  try {
    const usersCol = collection(db, "users");
    const snapshot = await getDocs(usersCol);
    if (snapshot.empty) {
      console.log("🌱 Inicializando participantes en Firestore...");
      for (const u of INITIAL_USERS) {
        await setDoc(doc(db, "users", u.id), {
          id: u.id,
          nombre: u.nombre,
          total_aura: 0,
          created_at: serverTimestamp()
        });
      }
      showToast("Participantes inicializados con 0 de Aura 🗿", "info");
    }
  } catch (e) {
    console.error("Error al sembrar usuarios en Firestore:", e);
  }
}

/**
 * Suscripciones reactivas en tiempo real a Firestore (onSnapshot)
 */
function subscribeToFirestore() {
  if (!db) return;

  // 1. Suscripción a usuarios (ranking)
  const usersQuery = query(collection(db, "users"), orderBy("total_aura", "desc"));
  onSnapshot(usersQuery, (snapshot) => {
    const users = [];
    snapshot.forEach(docSnap => {
      if (docSnap.id.startsWith("_")) return; // Excluir documentos de sistema como _system_auth
      users.push({ id: docSnap.id, ...docSnap.data() });
    });
    appState.users = users;
    renderLeaderboard();
    populateSelectDropdowns();
  }, (error) => {
    console.error("Error escuchando 'users':", error);
    showToast("Error de conexión con Firestore", "error");
  });

  // 2. Suscripción a aura_logs (Tribunal e historial)
  const logsQuery = query(collection(db, "aura_logs"), orderBy("timestamp", "desc"));
  onSnapshot(logsQuery, (snapshot) => {
    const logs = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      let ts = Date.now();
      if (data.timestamp?.toMillis) {
        ts = data.timestamp.toMillis();
      } else if (data.timestamp) {
        ts = new Date(data.timestamp).getTime();
      }
      logs.push({ id: docSnap.id, ...data, timestampMs: ts });
    });
    appState.logs = logs;
    renderTribunal();
    updateMetrics();
  }, (error) => {
    console.error("Error escuchando 'aura_logs':", error);
  });

  // 3. Sincronización continua automática en vivo cada 5 segundos (silenciosa y sin cartel de 'actualizando')
  setInterval(async () => {
    if (!db || !isFirebaseConnected) return;
    try {
      const usersCol = collection(db, "users");
      const snapshot = await getDocs(usersCol);
      if (!snapshot.empty) {
        const freshUsers = [];
        snapshot.forEach(docSnap => {
          if (docSnap.id.startsWith("_")) return;
          freshUsers.push({ id: docSnap.id, ...docSnap.data() });
        });
        const hasDifferences = freshUsers.some(fu => {
          const match = appState.users.find(u => u.id === fu.id);
          return !match || (match.total_aura || 0) !== (fu.total_aura || 0);
        });
        if (hasDifferences || freshUsers.length !== appState.users.length) {
          appState.users = freshUsers;
          renderLeaderboard();
          populateSelectDropdowns();
          updateMetrics();
        }
      }
    } catch (e) {
      // Silencioso en background
    }
  }, 5000);
}

/**
 * Fallback a LocalStorage para pruebas completas inmediatas
 */
function initLocalStorageFallback() {
  const storedUsers = localStorage.getItem("torneo_aura_users");
  const storedLogs = localStorage.getItem("torneo_aura_logs");

  if (storedUsers) {
    try {
      appState.users = JSON.parse(storedUsers);
    } catch {
      appState.users = [...INITIAL_USERS];
    }
  } else {
    appState.users = [...INITIAL_USERS];
    saveLocalState();
  }

  if (storedLogs) {
    try {
      appState.logs = JSON.parse(storedLogs);
    } catch {
      appState.logs = [];
    }
  } else {
    appState.logs = [];
  }

  renderLeaderboard();
  populateSelectDropdowns();
  renderTribunal();
  updateMetrics();
}

function saveLocalState() {
  localStorage.setItem("torneo_aura_users", JSON.stringify(appState.users));
  localStorage.setItem("torneo_aura_logs", JSON.stringify(appState.logs));
}

/* ==========================================================================
   3. CONTROL HORARIO DEL TRIBUNAL (VIERNES 08:00 A 16:00 HS)
   ========================================================================== */
function isTribunalOpen() {
  if (devTribunalBypass) return true;

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Domingo, 5 = Viernes
  const hours = now.getHours();
  const minutes = now.getMinutes();

  if (dayOfWeek === 5) {
    if (hours >= 8 && hours < 16) {
      return true;
    }
    if (hours === 16 && minutes === 0) {
      return true;
    }
  }
  return false;
}

function updateTribunalTimeStatus() {
  const isOpen = isTribunalOpen();
  const pill = document.getElementById("tribunal-pill");
  const pillStatus = document.getElementById("tribunal-pill-status");
  const fabTribunal = document.getElementById("fab-tribunal");
  const fabBadge = document.getElementById("fab-tribunal-badge");
  const lockedView = document.getElementById("tribunal-locked-view");
  const openContent = document.getElementById("tribunal-open-content");

  if (isOpen) {
    pill.classList.remove("locked");
    pill.classList.add("open");
    pillStatus.textContent = devTribunalBypass ? "Tribunal Abierto (Dev) ⚖️" : "Tribunal Abierto ⚖️";
    
    fabTribunal.disabled = false;
    fabTribunal.title = "El Tribunal de Apelaciones está activo";
    if (fabBadge) fabBadge.textContent = "🔓";

    if (lockedView) lockedView.classList.add("hidden");
    if (openContent) openContent.classList.remove("hidden");
  } else {
    pill.classList.remove("open");
    pill.classList.add("locked");
    pillStatus.textContent = "Tribunal Cerrado 🗿";

    fabTribunal.disabled = false;
    fabTribunal.title = "El Tribunal está en receso. Solo viernes de 8 a 16hs 🗿 (Clic para ver al Juez y horario)";
    if (fabBadge) fabBadge.textContent = "🔒";

    if (lockedView) lockedView.classList.remove("hidden");
    if (openContent) openContent.classList.add("hidden");
    updateTribunalCountdown();
  }
}

function updateTribunalCountdown() {
  const countdownEl = document.getElementById("tribunal-countdown");
  if (!countdownEl) return;

  const now = new Date();
  const nextFriday = new Date(now);
  const currentDay = now.getDay();
  let daysUntilFriday = (5 - currentDay + 7) % 7;

  if (currentDay === 5 && (now.getHours() > 16 || (now.getHours() === 16 && now.getMinutes() > 0))) {
    daysUntilFriday = 7;
  } else if (currentDay === 5 && now.getHours() < 8) {
    daysUntilFriday = 0;
  }

  nextFriday.setDate(now.getDate() + daysUntilFriday);
  nextFriday.setHours(8, 0, 0, 0);

  const diffMs = nextFriday - now;
  if (diffMs <= 0) {
    countdownEl.textContent = "El Tribunal está por abrir...";
    return;
  }

  const hoursTotal = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hoursTotal / 24);
  const hours = hoursTotal % 24;
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

  let str = "Próxima sesión en: ";
  if (days > 0) str += `${days}d `;
  str += `${hours}h ${minutes}m ⏳ (Viernes 08:00 hs)`;

  countdownEl.textContent = str;
}

/* ==========================================================================
   4. RENDERIZADO: LEADERBOARD & ORDENAMIENTO (MAYOR A MENOR / MENOR A MAYOR)
   ========================================================================== */
function toggleSortOrder() {
  appState.sortOrder = appState.sortOrder === 'desc' ? 'asc' : 'desc';
  updateSortButtonUI();
  renderLeaderboard();
  
  const sortText = appState.sortOrder === 'desc' ? "Mayor a Menor 📈" : "Menor a Mayor 📉";
  showToast(`Orden: ${sortText}`, "info");
}

function updateSortButtonUI() {
  const sortTextEl = document.getElementById("sort-indicator-text");
  const sortIconEl = document.getElementById("sort-indicator-icon");
  if (sortTextEl && sortIconEl) {
    if (appState.sortOrder === 'desc') {
      sortTextEl.textContent = "Mayor a Menor";
      sortIconEl.textContent = "📈";
    } else {
      sortTextEl.textContent = "Menor a Mayor";
      sortIconEl.textContent = "📉";
    }
  }
}

function renderLeaderboard() {
  const listContainer = document.getElementById("leaderboard-list");
  if (!listContainer) return;

  if (appState.users.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗿</div>
        <p>No hay participantes registrados todavía.</p>
      </div>`;
    return;
  }

  // 1. Determinar líderes y estado global de puntos
  const allZero = appState.users.every(u => (u.total_aura || 0) === 0);
  const maxAura = Math.max(...appState.users.map(u => u.total_aura || 0));
  const minAura = Math.min(...appState.users.map(u => u.total_aura || 0));
  const hasLeader = maxAura > 0;

  const usersByAuraDesc = [...appState.users].sort((a, b) => (b.total_aura || 0) - (a.total_aura || 0));
  const absoluteTop1 = hasLeader ? usersByAuraDesc[0] : null;

  const sigmaNameEl = document.getElementById("sigma-name");
  const sigmaAuraEl = document.getElementById("sigma-aura");
  const sigmaAvatarEl = document.getElementById("sigma-avatar");
  const sigmaTagEl = document.querySelector(".sigma-tag");
  const sigmaStatusEl = document.querySelector(".sigma-status");

  if (sigmaNameEl && sigmaAuraEl) {
    if (hasLeader && absoluteTop1) {
      sigmaNameEl.textContent = absoluteTop1.nombre;
      sigmaAuraEl.textContent = `+${absoluteTop1.total_aura.toLocaleString()}`;
      if (sigmaTagEl) sigmaTagEl.textContent = "👑 ALPHA / SIGMA SUPREMO #1";
      if (sigmaStatusEl) sigmaStatusEl.textContent = "🤫🧏‍♂️ MEWING GOD SIXSEVEN";
      if (sigmaAvatarEl) {
        sigmaAvatarEl.innerHTML = `
          ${getAvatarHtml(absoluteTop1.id, absoluteTop1.nombre, 'sigma-pfp-img')}
          <span class="sigma-crown-badge">👑</span>
        `;
      }
    } else {
      // TODOS TIENEN 0: No poner a nadie como número 1
      sigmaNameEl.textContent = "No hay nadie aún 🗿";
      sigmaAuraEl.textContent = "0";
      if (sigmaTagEl) sigmaTagEl.textContent = "⚖️ TORNEO EN LÍNEA DE PARTIDA";
      if (sigmaStatusEl) sigmaStatusEl.textContent = "TODOS ARRANCAN CON 0 AURA";
      if (sigmaAvatarEl) {
        sigmaAvatarEl.innerHTML = `<span style="font-size: 2.6rem; display: flex; align-items: center; justify-content: center; height: 100%;">🗿</span>`;
      }
    }
  }

  // 2. Ordenar según la preferencia del usuario
  const displayList = [...appState.users].sort((a, b) => {
    const auraA = a.total_aura || 0;
    const auraB = b.total_aura || 0;
    if (auraA === auraB) {
      return (a.nombre || '').localeCompare(b.nombre || '');
    }
    return appState.sortOrder === 'desc' ? auraB - auraA : auraA - auraB;
  });

  const lowestAuraUser = usersByAuraDesc[usersByAuraDesc.length - 1];

  // 3. Renderizar items del ranking (todos parten del mismo color neutral en 0)
  listContainer.innerHTML = displayList.map((user, index) => {
    const userAura = user.total_aura || 0;
    const isUserZero = userAura === 0;
    const isAbsoluteTop1 = hasLeader && user.id === absoluteTop1.id;
    // Únicamente es lowest / cooked si tiene AURA ESTRICTAMENTE NEGATIVA (< 0)
    const isLowest = minAura < 0 && userAura === minAura;

    const displayRank = index + 1;

    let rankClass = `rank-${displayRank}`;
    let badgeIcon = "✨";
    let tierTag = "AURA FARMING";
    let flavorText = "⚡ Dab king del ciclotrón 67 🤫";

    if (allZero || isUserZero) {
      // Partida desde 0: TODOS TIENEN EL MISMO COLOR NEUTRAL, SIN ROJOS NI SKULLS
      rankClass = "rank-item-neutral-zero";
      badgeIcon = "🗿";
      tierTag = "0 AURA";
      flavorText = "⚡ Listo para farmear aura en el torneo";
    } else if (isAbsoluteTop1) {
      rankClass += " rank-1";
      badgeIcon = "👑";
      tierTag = "Sigma Supremo";
      flavorText = "🗿 Aura infinita • Imparable sixseven";
    } else if (displayRank === 2 && appState.sortOrder === 'desc') {
      badgeIcon = "🥈";
      tierTag = "GigaChad";
      flavorText = "📈 Looksmaxxing sixseven dab king";
    } else if (displayRank === 3 && appState.sortOrder === 'desc') {
      badgeIcon = "🥉";
      tierTag = "Alpha Rival";
      flavorText = "🤫 Metido en el sixseven 67";
    } else if (isLowest) {
      rankClass += " negative-aura-last";
      badgeIcon = "💀";
      tierTag = "Negative Aura";
      flavorText = "📉 Bro is completely cooked";
    } else {
      tierTag = "AURA FARMING";
      flavorText = "⚡ Dab king del ciclotrón 67 🤫";
    }

    // Score styling
    let scoreClass = "score-zero";
    let scoreText = "0";
    if (userAura > 0) {
      scoreClass = "score-positive";
      scoreText = `+${userAura.toLocaleString()}`;
    } else if (userAura < 0) {
      scoreClass = "score-negative";
      scoreText = userAura.toLocaleString();
    }

    const posDisplay = allZero ? `#${displayRank}` : (isAbsoluteTop1 ? '👑 #1' : (isLowest ? `💀 #${displayRank}` : `#${displayRank}`));

    return `
      <div class="rank-item ${rankClass}" data-user-id="${user.id}" title="Hacé clic para ver el historial de ${escapeHTML(user.nombre)}">
        <div class="rank-position">
          ${posDisplay}
        </div>
        <div class="rank-avatar">
          ${getAvatarHtml(user.id, user.nombre)}
          <span class="rank-badge-icon">${badgeIcon}</span>
        </div>
        <div class="rank-details">
          <div class="rank-user-name">
            <span>${escapeHTML(user.nombre)}</span>
            <span class="rank-tier-tag">${tierTag}</span>
            <span class="rank-traza-btn"><span>🔎 Ver</span></span>
          </div>
          <div class="rank-flavor-text">
            <span>${flavorText}</span>
          </div>
        </div>
        <div class="rank-score-wrap">
          <span class="rank-score ${scoreClass}">${scoreText}</span>
          <span class="rank-score-unit">Aura</span>
        </div>
      </div>
    `;
  }).join("");

  // Listeners para abrir el historial o la foto ampliada (Instagram style)
  listContainer.querySelectorAll(".rank-item").forEach(item => {
    const uid = item.dataset.userId;
    const userObj = appState.users.find(u => u.id === uid);

    // Clic en la foto redonda abre el Lightbox de Instagram
    const avatarEl = item.querySelector(".rank-avatar");
    if (avatarEl && userObj) {
      avatarEl.title = `Hacé clic para ampliar la foto de ${escapeHTML(userObj.nombre)}`;
      avatarEl.addEventListener("click", (e) => {
        e.stopPropagation(); // Evitar abrir la traza al tocar la foto
        openPfpModal(userObj.id, userObj.nombre, userObj.total_aura);
      });
    }

    // Clic en el resto de la fila abre la traza / historial
    item.addEventListener("click", () => {
      if (uid) openTrazaModal(uid);
    });
  });

  // Spotlight del Top 1
  const sigmaSpotlight = document.getElementById("sigma-spotlight");
  if (sigmaSpotlight && absoluteTop1) {
    sigmaSpotlight.title = `Hacé clic para ver el historial de ${absoluteTop1.nombre}`;
    sigmaSpotlight.onclick = () => openTrazaModal(absoluteTop1.id);

    const sigmaAvatar = sigmaSpotlight.querySelector(".sigma-avatar");
    if (sigmaAvatar) {
      sigmaAvatar.title = `Hacé clic para ampliar la foto de ${absoluteTop1.nombre}`;
      sigmaAvatar.onclick = (e) => {
        e.stopPropagation();
        openPfpModal(absoluteTop1.id, absoluteTop1.nombre, absoluteTop1.total_aura);
      };
    }
  }

  updateMetrics();
}

function updateMetrics() {
  const usersCountEl = document.getElementById("metric-users-count");
  const totalAuraEl = document.getElementById("metric-total-aura");
  const logsCountEl = document.getElementById("metric-logs-count");

  if (usersCountEl) usersCountEl.textContent = appState.users.length;
  if (totalAuraEl) {
    const sum = appState.users.reduce((acc, u) => acc + (u.total_aura || 0), 0);
    totalAuraEl.textContent = sum > 0 ? `+${sum.toLocaleString()}` : sum.toLocaleString();
  }
  if (logsCountEl) {
    const appealedCount = appState.logs.filter(l => l.revisado || l.apelado).length;
    logsCountEl.textContent = `${appealedCount}/${appState.logs.length}`;
  }
}

function populateSelectDropdowns() {
  const targetSelect = document.getElementById("form-target");
  const evalSelect = document.getElementById("form-evaluator");
  if (!targetSelect || !evalSelect) return;

  const currentTargetVal = targetSelect.value;
  const currentEvalVal = evalSelect.value;

  targetSelect.innerHTML = `<option value="" disabled selected>Seleccioná al participante (Target)</option>`;
  evalSelect.innerHTML = `<option value="" disabled selected>Identificate (Evaluador)</option>`;

  appState.users.forEach(u => {
    const optT = document.createElement("option");
    optT.value = u.id;
    optT.textContent = `${u.nombre} (Aura actual: ${u.total_aura})`;
    targetSelect.appendChild(optT);

    const optE = document.createElement("option");
    optE.value = u.id;
    optE.textContent = u.nombre;
    evalSelect.appendChild(optE);
  });

  if (currentTargetVal) targetSelect.value = currentTargetVal;
  if (currentEvalVal) evalSelect.value = currentEvalVal;
}

/* ==========================================================================
   5. FORMULARIO SUMAR / RESTAR (PATRÓN PRG & NUEVOS TEXTOS)
   ========================================================================== */
function openActionForm(actionType) {
  const formSection = document.getElementById("view-action-form");
  const rankingSection = document.getElementById("view-ranking");
  const tribunalSection = document.getElementById("view-tribunal");

  const actionPill = document.getElementById("action-type-pill");
  const heroBanner = document.getElementById("form-hero-banner");
  const heroIcon = document.getElementById("form-hero-icon");
  const heroTitle = document.getElementById("form-title");
  const heroSubtitle = document.getElementById("form-subtitle");
  const formActionInput = document.getElementById("form-action-type");
  const amountPrefix = document.getElementById("amount-prefix");
  const chips = document.querySelectorAll("#preset-chips .chip");
  const submitBtn = document.getElementById("btn-submit-aura");
  const motivoInput = document.getElementById("form-motivo");

  formActionInput.value = actionType;

  // Nuevos textos solicitados
  if (actionType === "suma") {
    actionPill.className = "action-type-pill suma";
    actionPill.textContent = "SUMAR AURA 📈";

    heroBanner.className = "form-hero hero-suma";
    heroIcon.textContent = "📈";
    heroTitle.textContent = "Sumar Aura al Jugador";
    // REGLA 8: "Farmeo constante de aura, chupete mal"
    heroSubtitle.textContent = "Farmeo constante de aura, chupete mal";

    amountPrefix.className = "amount-prefix suma";
    amountPrefix.textContent = "+";

    submitBtn.className = "btn btn-primary btn-submit";
    submitBtn.style.background = "linear-gradient(135deg, #008744 0%, #00b35c 100%)";
    submitBtn.querySelector(".btn-text").textContent = "Registrar Suma de Aura 📈";

    chips.forEach(chip => {
      chip.className = "chip";
      const amt = chip.dataset.amount;
      chip.textContent = `+${parseInt(amt).toLocaleString()}`;
    });
  } else {
    actionPill.className = "action-type-pill resta";
    actionPill.textContent = "RESTAR AURA 📉";

    heroBanner.className = "form-hero hero-resta";
    heroIcon.textContent = "📉";
    heroTitle.textContent = "Restar Aura al Jugador";
    // REGLA 7: "Descuentos de INAURA, evalua bien o Andrea te va a chorear algo"
    heroSubtitle.textContent = "Descuentos de INAURA, evalua bien o Andrea te va a chorear algo";

    amountPrefix.className = "amount-prefix resta";
    amountPrefix.textContent = "-";

    submitBtn.className = "btn btn-danger btn-submit";
    submitBtn.style.background = "linear-gradient(135deg, #b80036 0%, #ff3366 100%)";
    submitBtn.querySelector(".btn-text").textContent = "Registrar Resta de Aura 📉";

    chips.forEach(chip => {
      chip.className = "chip";
      const amt = chip.dataset.amount;
      chip.textContent = `-${parseInt(amt).toLocaleString()}`;
    });
  }

  // REGLA 9: "Explicar con motivos y hechos o se abre QR con las tias"
  if (motivoInput) {
    motivoInput.placeholder = "Explicar con motivos y hechos o se abre QR con las tias";
  }

  // Cambiar vista SPA
  rankingSection.classList.remove("active");
  rankingSection.classList.add("hidden");
  tribunalSection.classList.remove("active");
  tribunalSection.classList.add("hidden");

  formSection.classList.remove("hidden");
  formSection.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let isSubmittingAura = false;
async function handleAuraFormSubmit(e) {
  e.preventDefault();
  if (isSubmittingAura) return;
  const submitBtn = document.getElementById("btn-submit-aura");
  const btnText = submitBtn.querySelector(".btn-text");
  const btnLoader = submitBtn.querySelector(".btn-loader");

  const actionType = document.getElementById("form-action-type").value;
  const targetId = document.getElementById("form-target").value;
  const evaluatorId = document.getElementById("form-evaluator").value;
  const amountVal = parseInt(document.getElementById("form-amount").value, 10);
  const motivo = document.getElementById("form-motivo").value.trim();

  // Validaciones
  if (!targetId) {
    showToast("Por favor seleccioná a quién se le aplica el Aura", "error");
    return;
  }
  if (!evaluatorId) {
    showToast("Por favor seleccioná quién está evaluando", "error");
    return;
  }
  if (targetId === evaluatorId) {
    showToast("¡No podés evaluarte a vos mismo! 🗿 -1000 de Aura moral", "error");
    return;
  }
  if (isNaN(amountVal) || amountVal <= 0) {
    showToast("Ingresá una cantidad de Aura válida mayor a 0", "error");
    return;
  }
  if (!motivo) {
    showToast("Explicar con motivos y hechos o se abre QR con las tias 🤫", "error");
    return;
  }

  // Prevenir duplicados (Patrón PRG)
  submitBtn.disabled = true;
  btnText.classList.add("hidden");
  btnLoader.classList.remove("hidden");

  const targetUserObj = appState.users.find(u => u.id === targetId);
  const evalUserObj = appState.users.find(u => u.id === evaluatorId);
  const targetName = targetUserObj ? targetUserObj.nombre : targetId;
  const evalName = evalUserObj ? evalUserObj.nombre : evaluatorId;

  const auraDelta = actionType === "suma" ? amountVal : -amountVal;

  try {
    if (isFirebaseConnected && db) {
      const targetDocRef = doc(db, "users", targetId);
      const logsColRef = collection(db, "aura_logs");

      await runTransaction(db, async (transaction) => {
        const targetDocSnap = await transaction.get(targetDocRef);
        let currentAura = 0;
        if (targetDocSnap.exists()) {
          currentAura = targetDocSnap.data().total_aura || 0;
        }
        const newAura = currentAura + auraDelta;
        transaction.update(targetDocRef, { total_aura: newAura });
      });

      await addDoc(logsColRef, {
        target_user: targetName,
        target_id: targetId,
        evaluator: evalName,
        evaluator_id: evaluatorId,
        tipo: actionType,
        cantidad: amountVal,
        motivo: motivo,
        timestamp: serverTimestamp(),
        revisado: false,
        apelado: false
      });

    } else {
      // Fallback local
      if (targetUserObj) {
        targetUserObj.total_aura = (targetUserObj.total_aura || 0) + auraDelta;
      }
      const newLog = {
        id: "local_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        target_user: targetName,
        target_id: targetId,
        evaluator: evalName,
        evaluator_id: evaluatorId,
        tipo: actionType,
        cantidad: amountVal,
        motivo: motivo,
        timestamp: new Date().toISOString(),
        timestampMs: Date.now(),
        revisado: false,
        apelado: false
      };
      appState.logs.unshift(newLog);
      saveLocalState();
      renderLeaderboard();
      renderTribunal();
      updateMetrics();
    }

    // Resetear formulario
    document.getElementById("aura-form").reset();
    document.getElementById("char-count").textContent = "0/280";
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active-suma", "active-resta"));

    const emojiAction = actionType === "suma" ? "📈" : "📉";
    const signText = actionType === "suma" ? `+${amountVal}` : `-${amountVal}`;
    showToast(`${emojiAction} ${signText} Aura para ${targetName} registrado 🤫🧏‍♂️`, "success");

    // Redirección PRG y limpieza de estado de historial
    try {
      window.history.replaceState({ view: 'ranking' }, '', window.location.pathname);
    } catch (e) {}
    returnToRanking();

  } catch (err) {
    console.error("Error al registrar Aura:", err);
    showToast("Ocurrió un error al guardar. Reintentá en un instante.", "error");
  } finally {
    isSubmittingAura = false;
    submitBtn.disabled = false;
    btnText.classList.remove("hidden");
    btnLoader.classList.add("hidden");
  }
}

/* ==========================================================================
   6. VISTA C: EL TRIBUNAL DE APELACIONES (CASTIGO & REVERSIÓN)
   ========================================================================== */
function updateSuperadminUI() {
  const loginBtn = document.getElementById("btn-open-superadmin-login");
  const loggedPill = document.getElementById("superadmin-logged-pill");
  if (appState.isSuperadmin) {
    loginBtn?.classList.add("hidden");
    loggedPill?.classList.remove("hidden");
  } else {
    loginBtn?.classList.remove("hidden");
    loggedPill?.classList.add("hidden");
  }
}

function openSuperadminLoginModal() {
  const modal = document.getElementById("superadmin-login-modal");
  const form = document.getElementById("superadmin-login-form");
  const errMsg = document.getElementById("auth-error-msg");
  if (form) form.reset();
  if (errMsg) errMsg.classList.add("hidden");
  if (modal) modal.classList.remove("hidden");
  setTimeout(() => document.getElementById("admin-user-input")?.focus(), 80);
}

function closeSuperadminLoginModal() {
  const modal = document.getElementById("superadmin-login-modal");
  if (modal) modal.classList.add("hidden");
  appState.pendingLogToAppeal = null;
}

async function authenticateSuperadmin(username, password) {
  const uClean = (username || '').trim().toLowerCase();
  const pClean = (password || '').trim();
  if (!uClean || !pClean) return false;

  const inputUHash = await hashWithSalt(AUTH_SALT_U, uClean);
  const inputPHash = await hashWithSalt(AUTH_SALT_P, pClean);

  // 1. Verificación directa contra Cloud Firestore si está conectado
  if (db && isFirebaseConnected) {
    try {
      const authDocRef = doc(db, "users", "_system_auth");
      const docSnap = await getDoc(authDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.uHash === inputUHash && data.pHash === inputPHash) {
          return true;
        }
      }
    } catch (err) {
      console.warn("Verificando credenciales vía hash criptográfico:", err);
    }
  }

  // 2. Validación de respaldo criptográfica mediante hashes precomputados de un solo sentido
  if (inputUHash === AUTH_DOC_ID && inputPHash === AUTH_P_HASH) {
    return true;
  }

  return false;
}

async function handleSuperadminLoginSubmit(e) {
  e.preventDefault();
  const userInput = document.getElementById("admin-user-input").value;
  const passInput = document.getElementById("admin-pass-input").value;
  const submitBtn = document.getElementById("btn-submit-auth");
  const btnText = submitBtn.querySelector(".btn-auth-text");
  const btnLoader = submitBtn.querySelector(".btn-auth-loader");
  const errMsg = document.getElementById("auth-error-msg");

  submitBtn.disabled = true;
  btnText.classList.add("hidden");
  btnLoader.classList.remove("hidden");
  if (errMsg) errMsg.classList.add("hidden");

  try {
    const isValid = await authenticateSuperadmin(userInput, passInput);
    if (isValid) {
      appState.isSuperadmin = true;
      try {
        sessionStorage.setItem("ciclotron_superadmin_auth", "true");
      } catch (e) {}

      const pendingId = appState.pendingLogToAppeal;
      appState.pendingLogToAppeal = null;

      closeSuperadminLoginModal();
      updateSuperadminUI();
      renderTribunal();
      showToast("👑 Magistrado Supremo autenticado. Acceso concedido al Tribunal ⚖️", "success");

      if (pendingId) {
        promptReversalModal(pendingId);
      }
    } else {
      if (errMsg) {
        errMsg.textContent = "💀 Credenciales incorrectas. Acceso denegado a la Corte.";
        errMsg.classList.remove("hidden");
      }
      showToast("Acceso denegado: credenciales incorrectas 🗿", "error");
    }
  } catch (err) {
    console.error("Error en autenticación Superadmin:", err);
    if (errMsg) {
      errMsg.textContent = "Ocurrió un error al verificar credenciales con la base de datos.";
      errMsg.classList.remove("hidden");
    }
  } finally {
    submitBtn.disabled = false;
    btnText.classList.remove("hidden");
    btnLoader.classList.add("hidden");
  }
}

function logoutSuperadmin() {
  appState.isSuperadmin = false;
  try {
    sessionStorage.removeItem("ciclotron_superadmin_auth");
  } catch (e) {}
  updateSuperadminUI();
  renderTribunal();
  showToast("Sesión de Superadmin cerrada 🔒", "info");
}

function openAppealSuccessModal(log) {
  const modal = document.getElementById("appeal-success-modal");
  const desc = document.getElementById("appeal-success-desc");
  if (desc && log) {
    const isSum = log.tipo === 'suma';
    const targetAction = isSum 
      ? `se le descontaron los -${log.cantidad} Aura que se le habían sumado injustamente`
      : `recuperó sus +${log.cantidad} Aura tras anularse el juicio espurio`;

    desc.innerHTML = `
      El veredicto fue ejecutado en el Ciclotrón bajo los estatutos de la Corte:<br><br>
      🎯 <strong>${escapeHTML(log.target_user)}</strong>: ${targetAction}.<br>
      👨‍⚖️ <strong>${escapeHTML(log.evaluator)}</strong>: Sancionado con <strong>-${log.cantidad} Aura</strong> por falso reporte.
    `;
  }
  if (modal) modal.classList.remove("hidden");
}

function closeAppealSuccessModal() {
  const modal = document.getElementById("appeal-success-modal");
  if (modal) modal.classList.add("hidden");
}

function openTribunalView() {
  const isOpen = isTribunalOpen();
  if (!isOpen && !devTribunalBypass) {
    showToast("El Tribunal está en receso. Sesiones los viernes de 8 a 16hs 🗿", "info");
  }

  const formSection = document.getElementById("view-action-form");
  const rankingSection = document.getElementById("view-ranking");
  const tribunalSection = document.getElementById("view-tribunal");

  rankingSection.classList.remove("active");
  rankingSection.classList.add("hidden");
  formSection.classList.remove("active");
  formSection.classList.add("hidden");

  tribunalSection.classList.remove("hidden");
  tribunalSection.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });

  updateSuperadminUI();
  renderTribunal();
}

function returnToRanking() {
  const formSection = document.getElementById("view-action-form");
  const rankingSection = document.getElementById("view-ranking");
  const tribunalSection = document.getElementById("view-tribunal");

  formSection.classList.remove("active");
  formSection.classList.add("hidden");
  tribunalSection.classList.remove("active");
  tribunalSection.classList.add("hidden");

  rankingSection.classList.remove("hidden");
  rankingSection.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTribunal() {
  const container = document.getElementById("tribunal-logs-container");
  if (!container) return;

  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

  const weekLogs = appState.logs.filter(log => (now - (log.timestampMs || now)) <= oneWeekMs);
  const monthLogs = appState.logs.filter(log => (now - (log.timestampMs || now)) <= oneMonthMs);

  const badgeWeek = document.getElementById("badge-count-week");
  const badgeMonth = document.getElementById("badge-count-month");
  if (badgeWeek) badgeWeek.textContent = weekLogs.length;
  if (badgeMonth) badgeMonth.textContent = monthLogs.length;

  const displayLogs = appState.activeTribunalRange === 'week' ? weekLogs : monthLogs;

  if (displayLogs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚖️</div>
        <p>No hay registros de aura en este periodo para apelar.</p>
      </div>`;
    return;
  }

  container.innerHTML = displayLogs.map(log => {
    const isSum = log.tipo === 'suma';
    const actionClass = isSum ? 'suma' : 'resta';
    const actionSign = isSum ? `+${log.cantidad}` : `-${log.cantidad}`;
    const dateFormatted = log.timestampMs ? new Date(log.timestampMs).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Fecha desconocida';

    const isReverted = log.revisado || log.apelado;
    const isAuth = appState.isSuperadmin;
    const appealBtnClass = isAuth ? 'btn-appeal' : 'btn-appeal appeal-locked';
    const appealBtnTitle = isAuth ? 'Dictar sentencia y anular veredicto' : 'Requiere inicio de sesión de Superadmin para apelar';
    const appealBtnText = isAuth ? '⚖️ Dictar Sentencia / Anular 🔨' : '⚖️ Apelar / Sancionar 🔒';

    return `
      <div class="log-card ${isReverted ? 'reverted' : ''}" data-log-id="${log.id}">
        <div class="log-card-header">
          <div class="log-parties">
            <span class="log-user-badge">🎯 ${escapeHTML(log.target_user)}</span>
            <span class="log-evaluator-badge">(Evaluado por: ${escapeHTML(log.evaluator)})</span>
          </div>
          <span class="log-badge-action ${actionClass}">
            ${isSum ? '📈' : '📉'} ${actionSign} AURA
          </span>
        </div>

        <p class="log-motivo">"${escapeHTML(log.motivo)}"</p>

        <div class="log-card-footer">
          <span class="log-date">🕒 ${dateFormatted}</span>
          ${isReverted ? `
            <span class="badge-reverted-status">
              <span>⚖️ Veredicto Anulado & Evaluador Sancionado</span>
            </span>
          ` : `
            <button class="${appealBtnClass}" data-action="appeal" data-log-id="${log.id}" title="${appealBtnTitle}">
              <span>${appealBtnText}</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".btn-appeal").forEach(btn => {
    btn.addEventListener("click", () => {
      const logId = btn.dataset.logId;
      if (!appState.isSuperadmin) {
        appState.pendingLogToAppeal = logId;
        openSuperadminLoginModal();
        showToast("Iniciá sesión como Superadmin para alterar veredictos 🔐", "info");
      } else {
        promptReversalModal(logId);
      }
    });
  });
}

function promptReversalModal(logId) {
  if (!appState.isSuperadmin) {
    appState.pendingLogToAppeal = logId;
    openSuperadminLoginModal();
    return;
  }

  const log = appState.logs.find(l => l.id === logId);
  if (!log) return;

  appState.selectedLogToRevert = log;

  const modal = document.getElementById("tribunal-modal");
  const modalBody = document.getElementById("tribunal-modal-body");

  const isSum = log.tipo === 'suma';
  const targetImpact = isSum 
    ? `Perderá los +${log.cantidad} Aura que se le habían sumado injustamente.`
    : `Recuperará los ${log.cantidad} Aura que se le habían restado injustamente.`;

  const evaluatorPenalty = `Perderá -${log.cantidad} de Aura por haber presentado un falso reporte o juicio injusto.`;

  modalBody.innerHTML = `
    <p>¿Estás seguro de que el Tribunal dictaminó anular este reporte?</p>
    <div class="reversal-preview">
      <p><strong>🎯 Participante (Target):</strong> ${escapeHTML(log.target_user)}</p>
      <p><strong>Impacto en Target:</strong> ${targetImpact}</p>
      <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:8px 0;">
      <p><strong>👨‍⚖️ Evaluador Original:</strong> ${escapeHTML(log.evaluator)}</p>
      <p><strong>Sanción al Evaluador:</strong> ${evaluatorPenalty}</p>
      <p style="margin-top:6px; font-size:0.75rem; color:#9e9cb4;"><strong>Motivo original:</strong> "${escapeHTML(log.motivo)}"</p>
    </div>
    <p class="reversal-rule-alert">⚠️ Esta acción es definitiva e irrevocable bajo los estatutos del Ciclotrón 🗿🔨</p>
  `;

  modal.classList.remove("hidden");
}

function closeReversalModal() {
  const modal = document.getElementById("tribunal-modal");
  modal.classList.add("hidden");
  appState.selectedLogToRevert = null;
}

async function confirmLogReversal() {
  if (!appState.isSuperadmin) {
    showToast("Solo un Superadmin autenticado puede anular veredictos 🗿🔒", "error");
    closeReversalModal();
    openSuperadminLoginModal();
    return;
  }

  const log = appState.selectedLogToRevert;
  if (!log) return;

  const confirmBtn = document.getElementById("btn-confirm-revert");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Aplicando Castigo...";

  const targetId = log.target_id || findUserIdByName(log.target_user);
  const evaluatorId = log.evaluator_id || findUserIdByName(log.evaluator);
  const isSum = log.tipo === 'suma';
  const amount = log.cantidad;

  const targetCorrection = isSum ? -amount : amount;
  const evaluatorPenalty = -amount;

  try {
    if (isFirebaseConnected && db) {
      const targetRef = doc(db, "users", targetId);
      const evalRef = doc(db, "users", evaluatorId);
      const logRef = doc(db, "aura_logs", log.id);
      const logsCol = collection(db, "aura_logs");

      await runTransaction(db, async (transaction) => {
        const targetSnap = await transaction.get(targetRef);
        const evalSnap = await transaction.get(evalRef);

        const targetCurrentAura = targetSnap.exists() ? (targetSnap.data().total_aura || 0) : 0;
        const evalCurrentAura = evalSnap.exists() ? (evalSnap.data().total_aura || 0) : 0;

        transaction.update(targetRef, { total_aura: targetCurrentAura + targetCorrection });
        transaction.update(evalRef, { total_aura: evalCurrentAura + evaluatorPenalty });
        transaction.update(logRef, {
          revisado: true,
          apelado: true,
          apelado_timestamp: serverTimestamp()
        });
      });

      // Registrar la traza oficial de sanción al evaluador
      await addDoc(logsCol, {
        target_user: log.evaluator,
        target_id: evaluatorId,
        evaluator: "El Tribunal ⚖️",
        evaluator_id: "tribunal",
        tipo: 'resta',
        cantidad: amount,
        motivo: `⚖️ Sanción del Tribunal: Castigo por emitir veredicto injusto contra ${log.target_user}. (Motivo original apelado: "${log.motivo}")`,
        timestamp: serverTimestamp(),
        revisado: true,
        apelado: false,
        es_sancion_tribunal: true
      });

      // Registrar la traza oficial de restitución de aura al target
      const targetActionType = targetCorrection > 0 ? 'suma' : 'resta';
      await addDoc(logsCol, {
        target_user: log.target_user,
        target_id: targetId,
        evaluator: "El Tribunal ⚖️",
        evaluator_id: "tribunal",
        tipo: targetActionType,
        cantidad: amount,
        motivo: `⚖️ Restitución del Tribunal: Apelación ganada contra reporte erróneo de ${log.evaluator}. (Aura devuelta tras anulación)`,
        timestamp: serverTimestamp(),
        revisado: true,
        apelado: false,
        es_restitucion_tribunal: true
      });

    } else {
      const targetUser = appState.users.find(u => u.id === targetId || u.nombre === log.target_user);
      const evalUser = appState.users.find(u => u.id === evaluatorId || u.nombre === log.evaluator);

      if (targetUser) targetUser.total_aura = (targetUser.total_aura || 0) + targetCorrection;
      if (evalUser) evalUser.total_aura = (evalUser.total_aura || 0) + evaluatorPenalty;

      log.revisado = true;
      log.apelado = true;

      // Registrar la traza de sanción al evaluador en modo local
      const penaltyLog = {
        id: "penalty_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        target_user: log.evaluator,
        target_id: evaluatorId,
        evaluator: "El Tribunal ⚖️",
        evaluator_id: "tribunal",
        tipo: 'resta',
        cantidad: amount,
        motivo: `⚖️ Sanción del Tribunal: Castigo por emitir veredicto injusto contra ${log.target_user}. (Motivo original apelado: "${log.motivo}")`,
        timestamp: new Date().toISOString(),
        timestampMs: Date.now() + 1,
        revisado: true,
        apelado: false,
        es_sancion_tribunal: true
      };

      // Registrar la traza de restitución al target en modo local
      const targetActionType = targetCorrection > 0 ? 'suma' : 'resta';
      const restitutionLog = {
        id: "restitution_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        target_user: log.target_user,
        target_id: targetId,
        evaluator: "El Tribunal ⚖️",
        evaluator_id: "tribunal",
        tipo: targetActionType,
        cantidad: amount,
        motivo: `⚖️ Restitución del Tribunal: Apelación ganada contra reporte erróneo de ${log.evaluator}. (Aura devuelta tras anulación)`,
        timestamp: new Date().toISOString(),
        timestampMs: Date.now() + 2,
        revisado: true,
        apelado: false,
        es_restitucion_tribunal: true
      };

      appState.logs.unshift(restitutionLog);
      appState.logs.unshift(penaltyLog);

      saveLocalState();
      renderLeaderboard();
      renderTribunal();
      updateMetrics();
    }

    // Patrón PRG: reemplazo de historial para evitar reenvíos accidentales
    try {
      window.history.replaceState({ view: 'tribunal', veredicto: 'anulado', logId: log.id, ts: Date.now() }, '', window.location.pathname);
    } catch (e) {}

    closeReversalModal();
    openAppealSuccessModal(log);
    showToast(`⚖️ Veredicto anulado: ${escapeHTML(log.evaluator)} fue sancionado con -${amount} Aura 🔨`, "success");
  } catch (err) {
    console.error("Error aplicando revocación del Tribunal:", err);
    showToast("Error al procesar la apelación en Firestore", "error");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirmar Castigo 🔨";
  }
}

function findUserIdByName(name) {
  const u = appState.users.find(user => user.nombre.toLowerCase() === (name || '').toLowerCase());
  return u ? u.id : (name || '').toLowerCase();
}

/* ==========================================================================
   7. UTILIDADES: TOASTS & AUDIO SYNTH
   ========================================================================== */

/* ==========================================================================
   TRAZA / HISTORIAL DE AURA POR PARTICIPANTE
   ========================================================================== */
function openTrazaModal(userId) {
  const user = appState.users.find(u => u.id === userId);
  if (!user) return;

  const modal = document.getElementById("traza-modal");
  const userNameEl = document.getElementById("traza-user-name");
  const userAvatarEl = document.getElementById("traza-user-avatar");
  const statNetEl = document.getElementById("traza-stat-net");
  const statPositiveEl = document.getElementById("traza-stat-positive");
  const statNegativeEl = document.getElementById("traza-stat-negative");
  const logsListEl = document.getElementById("traza-logs-list");

  userNameEl.textContent = user.nombre;
  userAvatarEl.innerHTML = getAvatarHtml(user.id, user.nombre, 'traza-pfp-img');
  userAvatarEl.title = `Hacé clic para ampliar la foto de ${escapeHTML(user.nombre)}`;
  userAvatarEl.onclick = (e) => {
    e.stopPropagation();
    openPfpModal(user.id, user.nombre, user.total_aura);
  };

  // Filtrar todos los logs donde este usuario fue el Target (a quien le sumaron o restaron aura)
  const userLogs = appState.logs.filter(log => {
    return log.target_id === userId || (log.target_user && log.target_user.toLowerCase() === user.nombre.toLowerCase());
  });

  // Calcular totales acumulados
  let totalPositive = 0;
  let totalNegative = 0;

  userLogs.forEach(log => {
    if (!log.apelado) {
      if (log.tipo === 'suma') {
        totalPositive += log.cantidad;
      } else {
        totalNegative += log.cantidad;
      }
    }
  });

  statNetEl.textContent = user.total_aura > 0 ? `+${user.total_aura.toLocaleString()}` : user.total_aura.toLocaleString();
  statNetEl.style.color = user.total_aura > 0 ? 'var(--neon-green)' : (user.total_aura < 0 ? 'var(--neon-red)' : 'var(--text-muted)');
  statPositiveEl.textContent = `+${totalPositive.toLocaleString()}`;
  statNegativeEl.textContent = `-${totalNegative.toLocaleString()}`;

  // Renderizar la lista de transacciones / traza
  if (userLogs.length === 0) {
    logsListEl.innerHTML = `
      <div class="empty-state" style="padding:2.5rem 1rem;">
        <div class="empty-state-icon">🗿</div>
        <p>Aún no hay registros de aura para <strong>${escapeHTML(user.nombre)}</strong>.</p>
        <p style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">¡Sumale o restale aura desde el ranking para iniciar su traza!</p>
      </div>
    `;
  } else {
    logsListEl.innerHTML = userLogs.map(log => {
      const isSum = log.tipo === 'suma';
      const deltaClass = isSum ? 'suma' : 'resta';
      const deltaSign = isSum ? `+${log.cantidad.toLocaleString()}` : `-${log.cantidad.toLocaleString()}`;
      const dateFormatted = log.timestampMs ? new Date(log.timestampMs).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'Fecha desconocida';

      const isReverted = log.revisado || log.apelado;

      let statusNote = '<span style="color:var(--text-dim);">Veredicto Válido</span>';
      if (log.es_sancion_tribunal) {
        statusNote = '<span class="traza-reverted-note">⚖️ Sanción de Tribunal Aplicada</span>';
      } else if (log.es_restitucion_tribunal) {
        statusNote = '<span style="color:var(--neon-green); font-weight:700;">⚖️ Restitución de Tribunal Aplicada</span>';
      } else if (isReverted) {
        statusNote = '<span class="traza-reverted-note">⚖️ Anulado por el Tribunal</span>';
      }

      return `
        <div class="traza-log-item item-${deltaClass} ${isReverted ? 'reverted' : ''}">
          <div class="traza-log-header">
            <div class="traza-evaluator-badge">
              <span>👤 Evaluado por:</span>
              <span class="traza-evaluator-name">${escapeHTML(log.evaluator)}</span>
            </div>
            <span class="traza-amount-badge ${deltaClass}">
              ${isSum ? '📈' : '📉'} ${deltaSign} AURA
            </span>
          </div>

          <div class="traza-motivo">
            "${escapeHTML(log.motivo)}"
          </div>

          <div class="traza-log-footer">
            <span>🕒 ${dateFormatted}</span>
            ${statusNote}
          </div>
        </div>
      `;
    }).join("");
  }

  modal.classList.remove("hidden");
}

function closeTrazaModal() {
  const modal = document.getElementById("traza-modal");
  if (modal) modal.classList.add("hidden");
}

/* ==========================================================================
   LIGHTBOX / FOTO AMPLIADA (INSTAGRAM STYLE)
   ========================================================================== */
function openPfpModal(userId, userName, userAura) {
  const modal = document.getElementById("pfp-modal");
  const imgEl = document.getElementById("pfp-lightbox-img");
  const nameEl = document.getElementById("pfp-lightbox-name");
  const auraEl = document.getElementById("pfp-lightbox-aura");

  const normId = (userId || '').toLowerCase();
  let imgSrc;
  if (normId === 'profeta' || normId === 'profesota') {
    imgSrc = 'farmeadores_de_aura/img/el_profeta.jpeg';
  } else {
    imgSrc = USER_AVATARS[normId] || `farmeadores_de_aura/${normId.toUpperCase()}.jpg`;
  }

  imgEl.src = imgSrc;
  imgEl.onerror = () => {
    if (imgSrc.includes('el_profeta.jpeg')) {
      imgEl.src = 'farmeadores_de_aura/img/el_profesota.jpg';
    }
  };
  imgEl.alt = userName;
  nameEl.textContent = userName;

  if (typeof userAura === 'number') {
    const auraSign = userAura > 0 ? `+${userAura.toLocaleString()}` : userAura.toLocaleString();
    auraEl.textContent = `${auraSign} Aura`;
    auraEl.style.color = userAura > 0 ? 'var(--neon-green)' : (userAura < 0 ? 'var(--neon-red)' : 'var(--text-muted)');
  } else {
    auraEl.textContent = userAura || 'Magistrado Supremo ⚖️';
    auraEl.style.color = 'var(--neon-gold)';
  }

  const cardEl = modal.querySelector(".pfp-lightbox-card");
  if (normId === 'profesota' || normId === 'profeta') {
    cardEl?.classList.add("judge-mode");
  } else {
    cardEl?.classList.remove("judge-mode");
  }

  modal.classList.remove("hidden");
}

function closePfpModal() {
  const modal = document.getElementById("pfp-modal");
  if (modal) {
    modal.classList.add("hidden");
    const cardEl = modal.querySelector(".pfp-lightbox-card");
    cardEl?.classList.remove("judge-mode");
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "🗿";
  if (type === "success") icon = "✨";
  if (type === "error") icon = "💀";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);
  playSubtleSound(type);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4000);
}

function playSubtleSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "success") {
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    } else if (type === "error") {
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(146.83, audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    } else {
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    }

    osc.start();
    osc.stop(audioCtx.currentTime + 0.26);
  } catch (e) {
    // Audio opcional
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   8. EVENT LISTENERS & INICIALIZACIÓN
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  initFirebase();

  // Control horario y reloj del tribunal
  updateTribunalTimeStatus();
  setInterval(updateTribunalTimeStatus, 30000);

  // Botón de alternar ordenamiento (Mayor a Menor y viceversa)
  const sortToggleBtn = document.getElementById("btn-toggle-sort");
  sortToggleBtn?.addEventListener("click", toggleSortOrder);

  // Botones de navegación principal (FABs) y Header
  document.getElementById("fab-sumar")?.addEventListener("click", () => openActionForm("suma"));
  document.getElementById("fab-restar")?.addEventListener("click", () => openActionForm("resta"));
  document.getElementById("fab-tribunal")?.addEventListener("click", openTribunalView);
  document.getElementById("tribunal-pill")?.addEventListener("click", openTribunalView);

  // Botones de regreso al ranking
  document.getElementById("btn-back-from-form")?.addEventListener("click", returnToRanking);
  document.getElementById("btn-back-from-tribunal")?.addEventListener("click", returnToRanking);

  // Envío del Formulario
  const auraForm = document.getElementById("aura-form");
  if (auraForm) {
    auraForm.addEventListener("submit", handleAuraFormSubmit);
  }

  // Chips de cantidad rápida
  document.querySelectorAll("#preset-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const amountInput = document.getElementById("form-amount");
      amountInput.value = chip.dataset.amount;
      document.querySelectorAll("#preset-chips .chip").forEach(c => c.classList.remove("active-suma", "active-resta"));
      const isSuma = document.getElementById("form-action-type").value === "suma";
      chip.classList.add(isSuma ? "active-suma" : "active-resta");
    });
  });

  // Contador de caracteres del motivo
  const motivoInput = document.getElementById("form-motivo");
  const charCount = document.getElementById("char-count");
  motivoInput?.addEventListener("input", () => {
    charCount.textContent = `${motivoInput.value.length}/280`;
  });

  // Botones de frases meme rápidas (con jerga brainrot sixseven, dab king, zyzz rizz)
  document.querySelectorAll(".quick-meme-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (motivoInput) {
        motivoInput.value = btn.dataset.meme;
        charCount.textContent = `${motivoInput.value.length}/280`;
        motivoInput.focus();
      }
    });
  });

  // Pestañas del Tribunal (Semana / Mes)
  const tabWeek = document.getElementById("tab-week");
  const tabMonth = document.getElementById("tab-month");
  tabWeek?.addEventListener("click", () => {
    tabWeek.classList.add("active");
    tabMonth.classList.remove("active");
    appState.activeTribunalRange = 'week';
    renderTribunal();
  });
  tabMonth?.addEventListener("click", () => {
    tabMonth.classList.add("active");
    tabWeek.classList.remove("active");
    appState.activeTribunalRange = 'month';
    renderTribunal();
  });

  // Modal Traza / Historial de Aura
  document.getElementById("btn-close-traza")?.addEventListener("click", closeTrazaModal);
  document.getElementById("btn-close-traza-footer")?.addEventListener("click", closeTrazaModal);
  document.getElementById("traza-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "traza-modal") closeTrazaModal();
  });

  // Modal Lightbox Foto de Perfil (Instagram style)
  document.getElementById("btn-close-pfp")?.addEventListener("click", closePfpModal);
  document.getElementById("pfp-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "pfp-modal") closePfpModal();
  });

  // Retrato del Tribunal: El Profeta para ampliar en Lightbox
  const judgePortrait = document.getElementById("tribunal-judge-portrait");
  if (judgePortrait) {
    judgePortrait.addEventListener("click", () => {
      openPfpModal("profeta", "El Profeta ⚖️", "Magistrado Supremo");
    });
  }

  // Cerrar cualquier modal con tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePfpModal();
      closeTrazaModal();
      closeReversalModal();
      closeSuperadminLoginModal();
      closeAppealSuccessModal();
    }
  });

  // Modal Confirmación Tribunal
  document.getElementById("btn-close-tribunal-modal")?.addEventListener("click", closeReversalModal);
  document.getElementById("btn-cancel-revert")?.addEventListener("click", closeReversalModal);
  document.getElementById("btn-confirm-revert")?.addEventListener("click", confirmLogReversal);

  // Superadmin Login & Auth Listeners
  document.getElementById("btn-open-superadmin-login")?.addEventListener("click", openSuperadminLoginModal);
  document.getElementById("btn-superadmin-logout")?.addEventListener("click", logoutSuperadmin);
  document.getElementById("btn-close-superadmin-login")?.addEventListener("click", closeSuperadminLoginModal);
  document.getElementById("btn-cancel-auth")?.addEventListener("click", closeSuperadminLoginModal);
  document.getElementById("superadmin-login-form")?.addEventListener("submit", handleSuperadminLoginSubmit);
  document.getElementById("superadmin-login-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "superadmin-login-modal") closeSuperadminLoginModal();
  });

  // Modal Pop-up Éxito de Apelación
  document.getElementById("btn-close-appeal-success")?.addEventListener("click", closeAppealSuccessModal);
  document.getElementById("appeal-success-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "appeal-success-modal") closeAppealSuccessModal();
  });

  // Sincronizar UI de Superadmin inicial
  updateSuperadminUI();

  // Atajo discreto por parámetro de URL para pruebas: ?tribunal=open
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("tribunal") === "open" || urlParams.get("dev") === "true") {
    devTribunalBypass = true;
    updateTribunalTimeStatus();
  }
});

