const searchInput = document.getElementById("searchInput");
const tableBody = document.getElementById("tableBody");
const summary = document.getElementById("summary");
const loadingIndicator = document.getElementById("loadingIndicator");
const DATA_VERSION = "20260414-1";

let allRows = [];

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) {
        return [];
    }

    const headers = lines[0].split(",");
    return lines.slice(1).map((line) => {
        const values = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i += 1) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === "," && !inQuotes) {
                values.push(current);
                current = "";
            } else {
                current += char;
            }
        }
        values.push(current);

        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || "";
        });
        return row;
    });
}

function buildSendouLabel(row) {
    return row.sendou_id;
}

function formatModes(row) {
    if (!row.modes_crossed) {
        return "—";
    }

    return row.modes_crossed.split(";").filter(Boolean).join(", ");
}

function formatSeasons(row) {
    if (!row.seasons_crossed) {
        return "—";
    }

    return row.seasons_crossed
        .split(";")
        .filter(Boolean)
        .map((season) => `S${season}`)
        .join(", ");
}

function formatPeak(row) {
    if (!row.peak_mode) {
        return "—";
    }

    if (!row.peak_rank) {
        return row.peak_mode;
    }

    return `${row.peak_mode} #${row.peak_rank}`;
}

function formatPeakSeason(row) {
    if (!row.peak_season_number) {
        return "—";
    }

    return `S${row.peak_season_number}`;
}

function renderRows(rows) {
    summary.textContent = `${rows.length} accounts`;
    tableBody.innerHTML = "";

    if (!rows.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="px-4 py-8 text-center text-slate-500">
                    No matching accounts found.
                </td>
            </tr>
        `;
        return;
    }

    rows.forEach((row) => {
        const sendouLabel = buildSendouLabel(row);
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50";
        tr.innerHTML = `
            <td class="px-4 py-3 font-medium">${Number(row.peak_x_power).toFixed(1)}</td>
            <td class="px-4 py-3">${escapeHtml(row.splashtag)}</td>
            <td class="px-4 py-3">${escapeHtml(formatPeak(row))}</td>
            <td class="px-4 py-3">${escapeHtml(formatPeakSeason(row))}</td>
            <td class="px-4 py-3">${escapeHtml(row.snapshot_count_above_3100 || "0")}</td>
            <td class="px-4 py-3 min-w-52">${escapeHtml(formatModes(row))}</td>
            <td class="px-4 py-3 min-w-48">${escapeHtml(formatSeasons(row))}</td>
            <td class="px-4 py-3">
                <a href="https://splat.top/player/${encodeURIComponent(row.player_id)}" target="_blank" rel="noopener noreferrer">
                    ${escapeHtml(row.player_id)}
                </a>
            </td>
            <td class="px-4 py-3">
                <a href="https://sendou.ink/u/${encodeURIComponent(sendouLabel)}" target="_blank" rel="noopener noreferrer">
                    ${escapeHtml(sendouLabel)}
                </a>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function applyFilter() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
        renderRows(allRows);
        return;
    }

    const filtered = allRows.filter((row) => {
        const sendouLabel = buildSendouLabel(row).toLowerCase();
        return (
            row.splashtag.toLowerCase().includes(query) ||
            row.player_id.toLowerCase().includes(query) ||
            row.peak_mode.toLowerCase().includes(query) ||
            row.peak_season_number.toLowerCase().includes(query) ||
            row.snapshot_count_above_3100.toLowerCase().includes(query) ||
            row.modes_crossed.toLowerCase().includes(query) ||
            row.seasons_crossed.toLowerCase().includes(query) ||
            sendouLabel.includes(query)
        );
    });
    renderRows(filtered);
}

async function loadData() {
    try {
        const response = await fetch(
            `takoroka_peak_3100_sendou_accounts.csv?v=${DATA_VERSION}`,
            { cache: "no-store" }
        );
        if (!response.ok) {
            throw new Error("failed to load CSV");
        }

        const csvText = await response.text();
        allRows = parseCSV(csvText).sort(
            (a, b) => Number(b.peak_x_power) - Number(a.peak_x_power)
        );
        loadingIndicator.classList.add("hidden");
        renderRows(allRows);
    } catch (error) {
        console.error(error);
        loadingIndicator.textContent = "Failed to load data.";
    }
}

searchInput.addEventListener("input", applyFilter);
document.addEventListener("DOMContentLoaded", loadData);
