// Погодное приложение на Open-Meteo (бесплатный API, без ключа, без блокировок по региону)
// Документация: https://open-meteo.com/

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";

const WEATHER_CODES = {
  0: { desc: "ясно", icon: "☀️" },
  1: { desc: "преимущественно ясно", icon: "🌤️" },
  2: { desc: "переменная облачность", icon: "⛅" },
  3: { desc: "пасмурно", icon: "☁️" },
  45: { desc: "туман", icon: "🌫️" },
  48: { desc: "изморозь", icon: "🌫️" },
  51: { desc: "лёгкая морось", icon: "🌦️" },
  53: { desc: "морось", icon: "🌦️" },
  55: { desc: "сильная морось", icon: "🌧️" },
  56: { desc: "ледяная морось", icon: "🌧️" },
  57: { desc: "сильная ледяная морось", icon: "🌧️" },
  61: { desc: "небольшой дождь", icon: "🌧️" },
  63: { desc: "дождь", icon: "🌧️" },
  65: { desc: "сильный дождь", icon: "🌧️" },
  66: { desc: "ледяной дождь", icon: "🌧️" },
  67: { desc: "сильный ледяной дождь", icon: "🌧️" },
  71: { desc: "небольшой снег", icon: "🌨️" },
  73: { desc: "снег", icon: "❄️" },
  75: { desc: "сильный снег", icon: "❄️" },
  77: { desc: "снежная крупа", icon: "❄️" },
  80: { desc: "ливень", icon: "🌦️" },
  81: { desc: "сильный ливень", icon: "🌧️" },
  82: { desc: "очень сильный ливень", icon: "⛈️" },
  85: { desc: "снегопад", icon: "🌨️" },
  86: { desc: "сильный снегопад", icon: "❄️" },
  95: { desc: "гроза", icon: "⛈️" },
  96: { desc: "гроза с градом", icon: "⛈️" },
  99: { desc: "сильная гроза с градом", icon: "⛈️" },
};

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const els = {
  form: document.getElementById("search-form"),
  input: document.getElementById("search-input"),
  geoBtn: document.getElementById("geo-btn"),
  suggestions: document.getElementById("suggestions"),
  content: document.getElementById("content"),
  status: document.getElementById("status"),
};

let searchDebounce = null;
let precipMap = null;

function showStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.remove("hidden");
  els.status.classList.toggle("error", isError);
  if (!isError) {
    setTimeout(() => els.status.classList.add("hidden"), 2500);
  }
}

function hideStatus() {
  els.status.classList.add("hidden");
}

function weatherInfo(code) {
  return WEATHER_CODES[code] || { desc: "нет данных", icon: "❔" };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ошибка сети (${res.status})`);
  return res.json();
}

async function searchCities(query) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=5&language=ru&format=json`;
  const data = await fetchJson(url);
  return data.results || [];
}

function renderSuggestions(results) {
  if (!results.length) {
    els.suggestions.classList.add("hidden");
    els.suggestions.innerHTML = "";
    return;
  }
  els.suggestions.innerHTML = "";
  for (const r of results) {
    const div = document.createElement("div");
    div.className = "suggestion";
    const region = [r.admin1, r.country].filter(Boolean).join(", ");
    div.innerHTML = `${r.name}<small>${region}</small>`;
    div.addEventListener("click", () => {
      els.input.value = r.name;
      els.suggestions.classList.add("hidden");
      loadWeather(r.latitude, r.longitude, `${r.name}${r.country ? ", " + r.country : ""}`);
    });
    els.suggestions.appendChild(div);
  }
  els.suggestions.classList.remove("hidden");
}

els.input.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = els.input.value.trim();
  if (q.length < 2) {
    els.suggestions.classList.add("hidden");
    return;
  }
  searchDebounce = setTimeout(async () => {
    try {
      const results = await searchCities(q);
      renderSuggestions(results);
    } catch (e) {
      // тихо игнорируем ошибки автодополнения
    }
  }, 350);
});

document.addEventListener("click", (e) => {
  if (!els.suggestions.contains(e.target) && e.target !== els.input) {
    els.suggestions.classList.add("hidden");
  }
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (!q) return;
  try {
    showStatus("Поиск города…");
    const results = await searchCities(q);
    if (!results.length) {
      showStatus("Город не найден", true);
      return;
    }
    const r = results[0];
    els.suggestions.classList.add("hidden");
    await loadWeather(r.latitude, r.longitude, `${r.name}${r.country ? ", " + r.country : ""}`);
  } catch (err) {
    showStatus("Не удалось получить данные: " + err.message, true);
  }
});

els.geoBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showStatus("Геолокация не поддерживается браузером", true);
    return;
  }
  showStatus("Определяем местоположение…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      await loadWeather(latitude, longitude, "Моё местоположение");
    },
    () => showStatus("Не удалось получить геолокацию", true),
    { timeout: 10000 }
  );
});

async function loadWeather(lat, lon, placeName) {
  try {
    showStatus("Загрузка прогноза…");
    const url =
      `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,precipitation` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto&forecast_days=7`;
    const data = await fetchJson(url);
    renderWeather(data, placeName, lat, lon);
    hideStatus();
  } catch (err) {
    showStatus("Не удалось загрузить погоду: " + err.message, true);
  }
}

function classifyCode(code) {
  return {
    isThunder: [95, 96, 99].includes(code),
    isSnow: [71, 73, 75, 77, 85, 86].includes(code),
    isRain: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code),
    isFog: [45, 48].includes(code),
    isClear: [0, 1].includes(code),
    isCloudy: [2, 3].includes(code),
  };
}

function buildRecommendations(current, hourly, hourlyStartIdx) {
  const recs = [];
  const { isThunder, isSnow, isRain, isFog, isClear, isCloudy } = classifyCode(current.weather_code);
  const temp = current.temperature_2m;
  const wind = current.wind_speed_10m;

  let soonRainProb = 0;
  if (hourly && hourly.precipitation_probability) {
    const from = Math.max(hourlyStartIdx, 0);
    const to = Math.min(from + 3, hourly.precipitation_probability.length);
    for (let i = from; i < to; i++) {
      soonRainProb = Math.max(soonRainProb, hourly.precipitation_probability[i] || 0);
    }
  }

  if (isThunder) {
    recs.push({ icon: "⛈️", text: "Гроза — лучше остаться дома или переждать в помещении, избегайте открытых пространств" });
  } else if (isSnow) {
    recs.push({ icon: "🧣", text: "Снег — оденьтесь теплее, на дорогах и тротуарах возможен гололёд" });
  } else if (isRain) {
    recs.push({ icon: "☔", text: "Дождь — не забудьте зонт и непромокаемую обувь" });
  } else if (isFog) {
    recs.push({ icon: "🚗", text: "Туман — если за рулём, снизьте скорость: видимость плохая" });
  } else if (isClear && temp >= 18 && temp <= 28 && wind < 30) {
    recs.push({ icon: "🌳", text: "Отличная погода для прогулки в парке, пробежки или пикника" });
  } else if (isClear && temp > 28) {
    recs.push({ icon: "🥤", text: "Жарко — берите воду, старайтесь избегать солнца в полдень" });
  } else if (isClear && temp < 0) {
    recs.push({ icon: "🧤", text: "Морозно, но ясно — гулять можно, оденьтесь теплее" });
  } else if (isClear || isCloudy) {
    recs.push({ icon: "🚶", text: "Без осадков — хорошее время для прогулки на улице" });
  }

  if (!isRain && !isThunder && soonRainProb >= 50) {
    recs.push({ icon: "🌂", text: `Вероятность дождя в ближайшие часы ~${Math.round(soonRainProb)}% — возьмите зонт на всякий случай` });
  }

  if (wind >= 40) {
    recs.push({ icon: "💨", text: "Сильный ветер — зонт может не спасти, будьте осторожны на открытых местах" });
  }

  if (temp <= -10) {
    recs.push({ icon: "🥶", text: "Сильный мороз — ограничьте время на улице и одевайтесь в несколько слоёв" });
  }

  if (recs.length === 0) {
    recs.push({ icon: "👍", text: "Погода спокойная — подходит для большинства планов" });
  }

  return recs;
}

async function initPrecipMap(lat, lon) {
  const container = document.getElementById("precip-map");
  if (!container || typeof L === "undefined") return;

  if (precipMap) {
    precipMap.remove();
    precipMap = null;
  }

  precipMap = L.map(container, { scrollWheelZoom: false, maxZoom: 12 }).setView([lat, lon], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '&copy; OpenStreetMap',
  }).addTo(precipMap);

  L.marker([lat, lon]).addTo(precipMap);

  try {
    const meta = await fetchJson(RAINVIEWER_URL);
    const frames = (meta.radar && meta.radar.past) || [];
    const last = frames[frames.length - 1];
    if (last) {
      L.tileLayer(`${meta.host}${last.path}/256/{z}/{x}/{y}/4/1_1.png`, {
        opacity: 0.6,
        maxZoom: 12,
        attribution: "Radar: RainViewer.com",
      }).addTo(precipMap);
    }
  } catch (e) {
    // если радар недоступен, показываем только базовую карту без осадков
  }
}

function renderWeather(data, placeName, lat, lon) {
  els.content.innerHTML = "";

  // Текущая погода
  const currentTpl = document.getElementById("tpl-current").content.cloneNode(true);
  const c = data.current;
  const info = weatherInfo(c.weather_code);
  currentTpl.querySelector(".place").textContent = placeName;
  currentTpl.querySelector(".temp").textContent = `${Math.round(c.temperature_2m)}°C`;
  currentTpl.querySelector(".desc").textContent = info.desc;
  currentTpl.querySelector(".icon").textContent = info.icon;
  currentTpl.querySelector(".feels").textContent = `${Math.round(c.apparent_temperature)}°C`;
  currentTpl.querySelector(".humidity").textContent = `${c.relative_humidity_2m}%`;
  currentTpl.querySelector(".wind").textContent = `${Math.round(c.wind_speed_10m)} км/ч`;
  currentTpl.querySelector(".pressure").textContent = `${Math.round(c.surface_pressure * 0.750062)} мм рт.ст.`;
  els.content.appendChild(currentTpl);

  const nowIso = data.current.time;
  let startIdx = data.hourly.time.findIndex((t) => t >= nowIso);
  if (startIdx < 0) startIdx = 0;

  // Рекомендации по погоде
  const recTitle = document.createElement("div");
  recTitle.className = "section-title";
  recTitle.textContent = "Рекомендации";
  els.content.appendChild(recTitle);

  const recWrap = document.createElement("div");
  recWrap.className = "recommendations";
  const recs = buildRecommendations(c, data.hourly, startIdx);
  for (const rec of recs) {
    const tpl = document.getElementById("tpl-rec-item").content.cloneNode(true);
    tpl.querySelector(".rec-icon").textContent = rec.icon;
    tpl.querySelector(".rec-text").textContent = rec.text;
    recWrap.appendChild(tpl);
  }
  els.content.appendChild(recWrap);

  // Карта осадков
  const mapTitle = document.createElement("div");
  mapTitle.className = "section-title";
  mapTitle.textContent = "Карта осадков";
  els.content.appendChild(mapTitle);

  const mapWrap = document.createElement("div");
  mapWrap.className = "map-wrap";
  const mapDiv = document.createElement("div");
  mapDiv.id = "precip-map";
  const mapLegend = document.createElement("div");
  mapLegend.className = "map-legend";
  mapLegend.innerHTML = "<span>Радар осадков</span><span>RainViewer.com</span>";
  mapWrap.appendChild(mapDiv);
  mapWrap.appendChild(mapLegend);
  els.content.appendChild(mapWrap);

  if (typeof lat === "number" && typeof lon === "number") {
    initPrecipMap(lat, lon);
  }

  // Почасовой прогноз (следующие 24 часа от текущего момента)
  const hourlyTitle = document.createElement("div");
  hourlyTitle.className = "section-title";
  hourlyTitle.textContent = "Почасовой прогноз";
  els.content.appendChild(hourlyTitle);

  const hourlyWrap = document.createElement("div");
  hourlyWrap.className = "hourly";

  for (let i = startIdx; i < Math.min(startIdx + 24, data.hourly.time.length); i++) {
    const tpl = document.getElementById("tpl-hourly-item").content.cloneNode(true);
    const time = new Date(data.hourly.time[i]);
    const hInfo = weatherInfo(data.hourly.weather_code[i]);
    tpl.querySelector(".h-time").textContent = time.getHours() + ":00";
    tpl.querySelector(".h-icon").textContent = hInfo.icon;
    tpl.querySelector(".h-temp").textContent = `${Math.round(data.hourly.temperature_2m[i])}°`;
    hourlyWrap.appendChild(tpl);
  }
  els.content.appendChild(hourlyWrap);

  // Прогноз на неделю
  const dailyTitle = document.createElement("div");
  dailyTitle.className = "section-title";
  dailyTitle.textContent = "На неделю";
  els.content.appendChild(dailyTitle);

  const dailyWrap = document.createElement("div");
  dailyWrap.className = "daily";

  for (let i = 0; i < data.daily.time.length; i++) {
    const tpl = document.getElementById("tpl-day-item").content.cloneNode(true);
    const date = new Date(data.daily.time[i]);
    const dInfo = weatherInfo(data.daily.weather_code[i]);
    const dayLabel = i === 0 ? "Сегодня" : WEEKDAYS[date.getDay()];
    tpl.querySelector(".d-name").textContent = dayLabel;
    tpl.querySelector(".d-icon").textContent = dInfo.icon;
    tpl.querySelector(".d-desc").textContent = dInfo.desc;
    tpl.querySelector(".d-max").textContent = `${Math.round(data.daily.temperature_2m_max[i])}°`;
    tpl.querySelector(".d-min").textContent = `${Math.round(data.daily.temperature_2m_min[i])}°`;
    dailyWrap.appendChild(tpl);
  }
  els.content.appendChild(dailyWrap);
}

// При загрузке пытаемся показать погоду для Москвы по умолчанию
loadWeather(55.7558, 37.6173, "Москва, Россия");
