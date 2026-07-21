// Модуль «Атмосферный визуал и маскот»
// Отвечает за динамический фон (время суток + погода), частицы (дождь/снег)
// и поведение маскота-синоптика. Полностью самодостаточен: принимает сырые
// данные о погоде и не зависит от внутреннего устройства app.js.
(function () {
  "use strict";

  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Классификация погоды и времени суток ----------

  const KIND_BY_CODE = [
    { codes: [95, 96, 99], kind: "thunder" },
    { codes: [71, 73, 75, 77, 85, 86], kind: "snow" },
    { codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], kind: "rain" },
    { codes: [45, 48], kind: "fog" },
    { codes: [0, 1], kind: "clear" },
  ];

  function kindFromCode(code) {
    for (const entry of KIND_BY_CODE) {
      if (entry.codes.includes(code)) return entry.kind;
    }
    return "cloudy"; // 2, 3 и любые нераспознанные коды
  }

  // Время суток определяется относительно восхода/заката текущего дня,
  // а не только по часам — так рассвет/закат совпадают с реальностью в любом городе.
  function computePeriod(nowIso, sunriseIso, sunsetIso, isDay) {
    if (!sunriseIso || !sunsetIso) {
      const h = new Date(nowIso).getHours();
      if (!isDay) return "night";
      if (h < 10) return "morning";
      if (h >= 17) return "sunset";
      return "day";
    }
    const now = new Date(nowIso).getTime();
    const sunrise = new Date(sunriseIso).getTime();
    const sunset = new Date(sunsetIso).getTime();
    const NEAR = 90 * 60 * 1000; // 90 минут — окно "утра"/"заката"
    if (now < sunrise || now >= sunset) return "night";
    if (now - sunrise <= NEAR) return "morning";
    if (sunset - now <= NEAR) return "sunset";
    return "day";
  }

  // ---------- Градиенты фона по времени суток ----------

  const PERIOD_GRADIENTS = {
    morning: ["#ffd9a0", "#ff9a76", "#7ec8e3"],
    day: ["#6ec6ff", "#4a90d9", "#1f5f8b"],
    sunset: ["#ff7e5f", "#c15c8e", "#3c3b6e"],
    night: ["#0f2027", "#203a43", "#2c5364"],
  };

  const OVERLAY_COLORS = {
    clear: "rgba(255,255,255,0)",
    cloudy: "rgba(90,100,115,0.35)",
    rain: "rgba(35,45,60,0.45)",
    snow: "rgba(210,225,240,0.28)",
    fog: "rgba(170,175,180,0.55)",
    thunder: "rgba(20,18,35,0.6)",
  };

  function updateBackground(period, kind) {
    const root = document.documentElement;
    const [from, mid, to] = PERIOD_GRADIENTS[period] || PERIOD_GRADIENTS.day;
    root.style.setProperty("--sky-start", from);
    root.style.setProperty("--sky-mid", mid);
    root.style.setProperty("--sky-end", to);
    root.style.setProperty("--overlay-color", OVERLAY_COLORS[kind] || OVERLAY_COLORS.cloudy);
    document.body.dataset.period = period;
    document.body.dataset.weather = kind;
  }

  // ---------- Частицы: дождь / снег / молния ----------

  let canvas = null;
  let ctx = null;
  let rafId = null;
  let particles = [];
  let lightningTimer = null;

  function setupCanvas() {
    canvas = document.getElementById("fx-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function stopParticles() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    particles = [];
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function startRain(count) {
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      len: 10 + Math.random() * 14,
      speed: 6 + Math.random() * 6,
      drift: 1 + Math.random(),
    }));
    loopRain();
  }

  function loopRain() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(210,230,255,0.55)";
    ctx.lineWidth = 1.4;
    for (const p of particles) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.drift * 2, p.y + p.len);
      ctx.stroke();
      p.y += p.speed;
      p.x -= p.drift * 0.3;
      if (p.y > canvas.height) {
        p.y = -p.len;
        p.x = Math.random() * canvas.width;
      }
    }
    rafId = requestAnimationFrame(loopRain);
  }

  function startSnow(count) {
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1.5 + Math.random() * 2.5,
      speed: 0.6 + Math.random() * 1.4,
      drift: Math.random() * 1.2 - 0.6,
      phase: Math.random() * Math.PI * 2,
    }));
    loopSnow();
  }

  function loopSnow() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const p of particles) {
      p.phase += 0.02;
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(p.phase) * 0.6, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y += p.speed;
      p.x += p.drift * 0.2;
      if (p.y > canvas.height) {
        p.y = -p.r;
        p.x = Math.random() * canvas.width;
      }
    }
    rafId = requestAnimationFrame(loopSnow);
  }

  function startLightning() {
    const flash = document.getElementById("lightning-flash");
    if (!flash) return;
    const scheduleFlash = () => {
      const delay = 3000 + Math.random() * 6000;
      lightningTimer = setTimeout(() => {
        flash.classList.add("flash-active");
        setTimeout(() => flash.classList.remove("flash-active"), 150);
        scheduleFlash();
      }, delay);
    };
    scheduleFlash();
  }

  function stopLightning() {
    clearTimeout(lightningTimer);
    lightningTimer = null;
    const flash = document.getElementById("lightning-flash");
    if (flash) flash.classList.remove("flash-active");
  }

  function manageParticles(kind) {
    if (!canvas) setupCanvas();
    if (!canvas) return;
    stopParticles();
    stopLightning();
    if (reduceMotion) return; // уважаем настройку "меньше анимаций"
    if (kind === "rain") startRain(90);
    else if (kind === "thunder") {
      startRain(140);
      startLightning();
    } else if (kind === "snow") startSnow(110);
  }

  // ---------- Маскот ----------

  function applyMascot(kind, period, temp) {
    const mascot = document.getElementById("mascot");
    if (!mascot) return;
    const cold = typeof temp === "number" && temp <= 0;
    mascot.dataset.kind = kind;
    mascot.dataset.period = period;
    mascot.classList.toggle("has-sunglasses", kind === "clear" && period !== "night");
    mascot.classList.toggle("has-scarf", kind === "snow" || cold);
    mascot.classList.toggle("has-umbrella", kind === "rain" || kind === "thunder");
    mascot.classList.toggle("is-surprised", kind === "thunder");
    mascot.classList.toggle("is-squint", kind === "fog");
    mascot.classList.toggle("is-sleepy", period === "night" && kind !== "thunder");
  }

  // ---------- Реплики маскота ----------

  const PHRASES = {
    clear: [
      "Ясно и солнечно — самое время для прогулки!",
      "Ни облачка! Надеваю очки и ловлю лучи.",
      "Такой день грех проводить дома.",
    ],
    cloudy: [
      "Облачно, но настроение отличное!",
      "Тучки гуляют по небу, а я — по подоконнику.",
      "Серовато, но дождя вроде не обещали.",
    ],
    rain: [
      "Дождик! Хорошо, что зонт всегда под лапой.",
      "Кап-кап… хорошая погода, чтобы посидеть с чаем.",
      "Мокро на улице — не забудьте зонт!",
    ],
    snow: [
      "Снежинки летят — самое время для какао!",
      "Бррр, замотался в шарф потеплее.",
      "Снег идёт! Красиво, но зябко.",
    ],
    fog: [
      "Ничего не вижу… кажется, это туман.",
      "Всё в дымке — двигайтесь осторожно.",
      "Туманно, прямо как в моих утренних мыслях.",
    ],
    thunder: [
      "Ого, гроза! Лучше переждать дома.",
      "Гром гремит — я уже спрятался под зонтом.",
      "Молнии сверкают — берегите себя!",
    ],
  };

  const NIGHT_EXTRA = {
    clear: ["Ночное небо звёздное — красота!", "Тихая ясная ночь, идеально для сна."],
    cloudy: ["Ночью и тучки спят.", "Темно и облачно — уютный вечер."],
    rain: ["Дождь стучит по крыше — самое время для сна.", "Ночной дождь навевает сон."],
    snow: ["Снег тихо падает в темноте.", "Ночной снегопад — так тихо и спокойно."],
    fog: ["Ночной туман — жутковато, но красиво.", "В темноте да ещё в тумане — держитесь рядом."],
    thunder: ["Гроза среди ночи — жутковато!", "Молнии освещают ночное небо."],
  };

  let lastPhrase = null;

  function pickPhrase(kind, period) {
    let pool = PHRASES[kind] || PHRASES.cloudy;
    if (period === "night" && NIGHT_EXTRA[kind]) {
      pool = pool.concat(NIGHT_EXTRA[kind]);
    }
    let choice;
    do {
      choice = pool[Math.floor(Math.random() * pool.length)];
    } while (pool.length > 1 && choice === lastPhrase);
    lastPhrase = choice;
    return choice;
  }

  function say(text) {
    const phraseEl = document.getElementById("mascot-phrase");
    const bubble = document.getElementById("mascot-bubble");
    if (!phraseEl || !bubble) return;
    bubble.classList.remove("pop");
    void bubble.offsetWidth; // форсируем reflow, чтобы анимация перезапустилась
    phraseEl.textContent = text;
    bubble.classList.add("pop");
  }

  // ---------- Публичный API ----------

  function update({ code, isDay, temp, now, sunrise, sunset }) {
    const kind = kindFromCode(code);
    const period = computePeriod(now, sunrise, sunset, isDay);
    updateBackground(period, kind);
    applyMascot(kind, period, temp);
    manageParticles(kind);
    say(pickPhrase(kind, period));
  }

  window.Atmosphere = { update };
})();
