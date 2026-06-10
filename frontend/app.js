const DEFAULT_DEVICE_ID = "ESP32_STATION_01";
const urlParams = new URLSearchParams(window.location.search);
const API_URL = window.IOT_API_URL || urlParams.get("api") || getDefaultApiUrl();

let iotChart;
let refreshTimer;
let isDemoMode = false;

const els = {
    stationId: document.getElementById("station-id"),
    statusDot: document.getElementById("status-dot"),
    statusLabel: document.getElementById("status-label"),
    lastUpdate: document.getElementById("last-update"),
    syncLabel: document.getElementById("sync-label"),
    pulse: document.querySelector(".pulse"),
    tempVal: document.getElementById("temp-val"),
    humVal: document.getElementById("hum-val"),
    waterVal: document.getElementById("water-val"),
    tempTrend: document.getElementById("temp-trend"),
    humTrend: document.getElementById("hum-trend"),
    waterTrend: document.getElementById("water-trend"),
    tempMeter: document.getElementById("temp-meter"),
    humMeter: document.getElementById("hum-meter"),
    waterMeter: document.getElementById("water-meter"),
    tempNote: document.getElementById("temp-note"),
    humNote: document.getElementById("hum-note"),
    waterNote: document.getElementById("water-note"),
    tankFill: document.getElementById("tank-fill"),
    tankLabel: document.getElementById("tank-label"),
    waterState: document.getElementById("water-state"),
    riskList: document.getElementById("risk-list"),
    rangeSelect: document.getElementById("range-select"),
    refreshBtn: document.getElementById("refresh-btn"),
    commandState: document.getElementById("command-state"),
    statusMessage: document.getElementById("status-message"),
    historyTable: document.getElementById("history-table")
};

window.addEventListener("DOMContentLoaded", () => {
    els.stationId.textContent = DEFAULT_DEVICE_ID;
    initChart();
    bindEvents();
    fetchData();
    refreshTimer = setInterval(fetchData, 5000);
});

function getDefaultApiUrl() {
    if (window.location.protocol === "file:") {
        return "http://localhost:8000";
    }

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "http://localhost:8000";
    }

    return window.location.origin;
}

function bindEvents() {
    els.refreshBtn.addEventListener("click", fetchData);
    els.rangeSelect.addEventListener("change", fetchData);
}

function initChart() {
    const ctx = document.getElementById("iotChart");

    if (!window.Chart || !ctx) {
        return;
    }

    iotChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                makeDataset("Temperature (°C)", "#e47b23"),
                makeDataset("Humidite (%)", "#0ea5b7"),
                makeDataset("Niveau d'eau (%)", "#0f766e")
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: "#10201d",
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(99, 112, 108, 0.14)" }
                }
            }
        }
    });
}

function makeDataset(label, color) {
    return {
        label,
        data: [],
        borderColor: color,
        backgroundColor: `${color}1f`,
        pointBackgroundColor: color,
        pointRadius: 3,
        borderWidth: 3,
        tension: 0.35,
        fill: true
    };
}

async function fetchData() {
    setSyncState("loading", "Synchronisation");

    try {
        const limit = els.rangeSelect.value;
        const [historyResponse, statusResponse] = await Promise.all([
            fetch(`${API_URL}/history?limit=${limit}`),
            fetch(`${API_URL}/status?device_id=${encodeURIComponent(DEFAULT_DEVICE_ID)}`)
        ]);

        if (!historyResponse.ok) {
            throw new Error("Historique indisponible");
        }

        const history = await historyResponse.json();
        const status = statusResponse.ok ? await statusResponse.json() : { online: false };

        isDemoMode = false;
        updateDashboard(normalizeHistory(history), Boolean(status.online));
        setSyncState("online", "Donnees reelles");
    } catch (error) {
        isDemoMode = true;
        updateDashboard(generateDemoData(Number(els.rangeSelect.value)), false);
        setSyncState("offline", "Mode demo");
    }
}

function normalizeHistory(history) {
    return [...history]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map((item) => ({
            temperature: Number(item.temperature || 0),
            humidity: Number(item.humidity || 0),
            water_level: Number(item.water_level || 0),
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
            device_id: item.device_id || DEFAULT_DEVICE_ID
        }));
}

function updateDashboard(history, online) {
    if (!history.length) {
        renderEmptyState();
        return;
    }

    const last = history[history.length - 1];
    const previous = history[history.length - 2] || last;

    els.stationId.textContent = last.device_id || DEFAULT_DEVICE_ID;
    updateConnectionState(online, last.timestamp);
    updateMetric("temp", last.temperature, previous.temperature, 0, 45, "°C");
    updateMetric("hum", last.humidity, previous.humidity, 0, 100, "%");
    updateMetric("water", last.water_level, previous.water_level, 0, 100, "%");
    updateNotes(last);
    updateTank(last.water_level);
    updateRisks(last, online);
    updateChart(history);
    updateTable(history);
}

function updateConnectionState(online, timestamp) {
    const statusClass = online && !isDemoMode ? "online" : "offline";
    els.statusDot.className = `status-dot ${statusClass}`;
    els.statusLabel.textContent = online && !isDemoMode ? "ESP32 en ligne" : "Presentation locale";
    els.lastUpdate.textContent = `Derniere mesure: ${formatDateTime(timestamp)}`;
}

function updateMetric(type, current, previous, min, max, unit) {
    const valueEl = els[`${type}Val`];
    const trendEl = els[`${type}Trend`];
    const meterEl = els[`${type}Meter`];
    const delta = current - previous;
    const precision = unit === "°C" ? 1 : 0;

    valueEl.textContent = `${current.toFixed(precision)} ${unit}`;
    trendEl.textContent = formatTrend(delta, unit);
    meterEl.style.width = `${clamp(((current - min) / (max - min)) * 100, 0, 100)}%`;
}

function updateNotes(last) {
    els.tempNote.textContent = getTempNote(last.temperature);
    els.humNote.textContent = getHumidityNote(last.humidity);
    els.waterNote.textContent = getWaterNote(last.water_level);
}

function updateTank(level) {
    const waterLevel = clamp(level, 0, 100);
    els.tankFill.style.height = `${waterLevel}%`;
    els.tankLabel.textContent = `${waterLevel.toFixed(0)}%`;
    els.waterState.textContent = getWaterNote(waterLevel);
}

function updateRisks(last, online) {
    const risks = [];

    if (!online || isDemoMode) {
        risks.push({ text: "Interface en mode presentation: lance le backend pour lire les mesures reelles.", level: "warning" });
    }

    if (last.water_level < 25) {
        risks.push({ text: "Reservoir bas: LED d'alerte recommandee.", level: "danger" });
    } else if (last.water_level < 45) {
        risks.push({ text: "Reservoir a surveiller: niveau sous le seuil de confort.", level: "warning" });
    }

    if (last.temperature > 32) {
        risks.push({ text: "Temperature elevee: risque de surchauffe en serre.", level: "warning" });
    }

    if (last.humidity < 35) {
        risks.push({ text: "Air sec: humidite sous la zone confortable.", level: "warning" });
    }

    if (!risks.length) {
        risks.push({ text: "Toutes les mesures sont dans une zone stable.", level: "" });
    }

    els.riskList.innerHTML = risks
        .map((risk) => `<p class="risk-item ${risk.level}">${risk.text}</p>`)
        .join("");
}

function updateChart(history) {
    if (!iotChart) {
        return;
    }

    iotChart.data.labels = history.map((item) => formatTime(item.timestamp));
    iotChart.data.datasets[0].data = history.map((item) => item.temperature);
    iotChart.data.datasets[1].data = history.map((item) => item.humidity);
    iotChart.data.datasets[2].data = history.map((item) => item.water_level);
    iotChart.update();
}

function updateTable(history) {
    const latest = [...history].slice(-8).reverse();
    els.historyTable.innerHTML = latest.map((item) => `
        <tr>
            <td>${formatTime(item.timestamp)}</td>
            <td>${item.temperature.toFixed(1)} °C</td>
            <td>${item.humidity.toFixed(0)} %</td>
            <td>${item.water_level.toFixed(0)} %</td>
        </tr>
    `).join("");
}

function renderEmptyState() {
    els.historyTable.innerHTML = `<tr><td colspan="4">Aucune mesure recue.</td></tr>`;
    els.statusLabel.textContent = "Aucune donnee";
    els.lastUpdate.textContent = "Derniere mesure: --";
}

function setSyncState(state, label) {
    els.syncLabel.textContent = label;
    els.pulse.className = `pulse ${state === "online" ? "online" : state === "offline" ? "offline" : ""}`;
}

async function sendLedCommand(commandText) {
    els.commandState.textContent = "Envoi";
    els.statusMessage.textContent = "Commande en cours d'envoi...";
    els.statusMessage.style.color = "#63706c";

    if (isDemoMode) {
        setTimeout(() => {
            els.commandState.textContent = "Demo";
            els.statusMessage.textContent = `Commande ${commandText} simulee pendant la presentation.`;
            els.statusMessage.style.color = "#0f766e";
        }, 350);
        return;
    }

    try {
        const response = await fetch(`${API_URL}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                device_id: DEFAULT_DEVICE_ID,
                command: commandText
            })
        });

        if (!response.ok) {
            throw new Error("Commande refusee");
        }

        els.commandState.textContent = "Envoyee";
        els.statusMessage.textContent = `Commande ${commandText} mise en attente pour l'ESP32.`;
        els.statusMessage.style.color = "#1f9d55";
    } catch (error) {
        els.commandState.textContent = "Erreur";
        els.statusMessage.textContent = "Impossible de joindre le serveur.";
        els.statusMessage.style.color = "#d94f45";
    }
}

function generateDemoData(limit) {
    const now = Date.now();
    const points = [];

    for (let i = limit - 1; i >= 0; i -= 1) {
        const wave = Math.sin((limit - i) / 4);
        points.push({
            device_id: DEFAULT_DEVICE_ID,
            temperature: 27 + wave * 3 + Math.cos(i / 3),
            humidity: 58 + Math.cos(i / 5) * 8,
            water_level: clamp(72 - (limit - i) * 0.8 + Math.sin(i / 2) * 2, 18, 92),
            timestamp: new Date(now - i * 5000)
        });
    }

    return points;
}

function getTempNote(value) {
    if (value >= 32) return "Chaud";
    if (value <= 18) return "Frais";
    return "Zone confortable";
}

function getHumidityNote(value) {
    if (value < 35) return "Air sec";
    if (value > 75) return "Air humide";
    return "Humidite stable";
}

function getWaterNote(value) {
    if (value < 25) return "Critique";
    if (value < 45) return "A surveiller";
    return "Stable";
}

function formatTrend(delta, unit) {
    if (Math.abs(delta) < 0.1) {
        return "stable";
    }

    const sign = delta > 0 ? "+" : "";
    const precision = unit === "°C" ? 1 : 0;
    return `${sign}${delta.toFixed(precision)} ${unit}`;
}

function formatTime(date) {
    return new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(new Date(date));
}

function formatDateTime(date) {
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(date));
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
