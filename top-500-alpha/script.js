// --- DOM ELEMENTS ---
const searchInput = document.getElementById('searchInput');
const leaderboardBody = document.getElementById('leaderboardBody');
const loadingIndicator = document.getElementById('loadingIndicator');
const paginationControls = document.getElementById('paginationControls');

// --- STATE MANAGEMENT ---
let fullPlayerData = [];
let filteredPlayerData = [];
let currentPage = 1;
const rowsPerPage = 50;
let maxLastActive = 0;

// --- CORE FUNCTIONS ---

/**
 * Parses a CSV string into an array of objects.
 * @param {string} csvString The raw CSV data.
 * @returns {Array<Object>} An array of player objects.
 */
function parseCSV(csvString) {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const entry = {};
        headers.forEach((header, index) => {
            entry[header] = values[index] ? values[index].trim() : '';
        });
        data.push(entry);
    }
    return data;
}

/**
 * Renders a specific page of the leaderboard table.
 * @param {Array<Object>} playersData The subset of players to display for the current page.
 */
function renderTablePage(playersData) {
    leaderboardBody.innerHTML = ''; // Clear previous content
    if (!playersData || playersData.length === 0) {
        leaderboardBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-gray-500">No matching players found.</td></tr>';
        return;
    }

    const secondsInADay = 60 * 60 * 24;
    playersData.forEach(player => {
        const shouldDisplayScore = ['XX', 'XS+'].includes(player.rank_label);
        const score = shouldDisplayScore ? parseFloat(player.display_score).toFixed(2) : '—';
        
        const lastActiveTimestamp = parseInt(player.last_active, 10);
        const deltaInSeconds = maxLastActive - lastActiveTimestamp;
        const deltaInDays = Math.round(deltaInSeconds / secondsInADay);
        const lastActiveText = `${deltaInDays} ${deltaInDays === 1 ? 'day' : 'days'} ago`;

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors duration-150';
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${player.rank}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${player.rank_label}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${score}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <a href="https://sendou.ink/u/${player.player_id}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-900 hover:underline">
                    ${player.username}
                </a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${lastActiveText}</td>
        `;
        leaderboardBody.appendChild(row);
    });
}

/**
 * Renders the pagination controls (buttons and page info).
 */
function renderPagination() {
    paginationControls.innerHTML = '';
    const totalPages = Math.ceil(filteredPlayerData.length / rowsPerPage);
    if (totalPages <= 1) return;

    const startItem = (currentPage - 1) * rowsPerPage + 1;
    const endItem = Math.min(currentPage * rowsPerPage, filteredPlayerData.length);
    const totalItems = filteredPlayerData.length;

    paginationControls.innerHTML = `
        <div>
            Showing <span class="font-medium">${startItem}</span> to <span class="font-medium">${endItem}</span> of <span class="font-medium">${totalItems}</span> results
        </div>
        <div class="flex items-center gap-2">
            <button id="prevPageBtn" class="pagination-btn px-3 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-50">Previous</button>
            <span class="font-medium">${currentPage} / ${totalPages}</span>
            <button id="nextPageBtn" class="pagination-btn px-3 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-50">Next</button>
        </div>
    `;
    
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateDisplay();
        }
    });
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateDisplay();
        }
    });
}

/**
 * Main function to update the entire view (table + pagination).
 */
function updateDisplay() {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageData = filteredPlayerData.slice(startIndex, endIndex);
    
    renderTablePage(pageData);
    renderPagination();
}

/**
 * Processes CSV data, sets state, and triggers the first render.
 * @param {string} csvData The raw CSV string.
 */
function processAndDisplayData(csvData) {
    try {
        fullPlayerData = parseCSV(csvData);
        filteredPlayerData = [...fullPlayerData];
        maxLastActive = Math.max(...fullPlayerData.map(p => parseInt(p.last_active, 10) || 0));
        currentPage = 1;
        searchInput.value = '';
        updateDisplay();
        loadingIndicator.classList.add('hidden');
    } catch (error) {
        console.error("Error processing data:", error);
        leaderboardBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-red-500">Error: Could not process the data.</td></tr>';
        loadingIndicator.classList.add('hidden');
    }
}

/**
 * Fetches the CSV file and initializes the leaderboard
 */
async function loadLeaderboardData() {
    loadingIndicator.classList.remove('hidden');
    try {
        const response = await fetch('top_500_players.csv');
        if (!response.ok) {
            throw new Error('Failed to load CSV file');
        }
        const csvData = await response.text();
        processAndDisplayData(csvData);
    } catch (error) {
        console.error("Error loading CSV file:", error);
        leaderboardBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-red-500">Error: Could not load the leaderboard data.</td></tr>';
        loadingIndicator.classList.add('hidden');
    }
}

// --- EVENT LISTENERS & INITIALIZATION ---

searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    filteredPlayerData = fullPlayerData.filter(player => 
        player.username.toLowerCase().includes(searchTerm)
    );
    currentPage = 1; // Reset to first page on new search
    updateDisplay();
});

// Initial load on page ready
document.addEventListener('DOMContentLoaded', () => {
    loadLeaderboardData();
});