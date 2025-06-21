// Global state
let traceData = null;
let currentStep = 0;
let currentCandidateIndex = 0; 
let tierFilters = { m: true, t: true, s: true };
let chartDisplayMode = 'logit'; 

// --- Data Loading and Processing ---
// FIX: The fetch call was failing, likely due to CORS issues in the sandboxed environment.
// The most robust solution is to embed the data directly, bypassing the network request.
function processAndLoadData(data) {
    try {
        if (!data || !data.steps || !data.builds || !data.feature_labels) {
            throw new Error("JSON is missing required keys: 'steps', 'builds', or 'feature_labels'.");
        }
        
        const featureMap = {};
        const { feature_ids, feature_names, feature_categories } = data.feature_labels;
        for (let i = 0; i < feature_ids.length; i++) {
            const id = feature_ids[i];
            const category = feature_categories[i] || 'strategic'; 
            featureMap[id] = {
                label: feature_names[i] || `Unknown Feature #${id}`,
                tier: category.startsWith('m') ? 'm' : category.startsWith('t') ? 't' : 's'
            };
        }

        const transformedSteps = data.steps.map((stepCandidates) => {
            return {
                candidates: stepCandidates.map(candidate => {
                    const features = [];
                    if(candidate.top_feat_ids) {
                        for (let i = 0; i < candidate.top_feat_ids.length; i++) {
                            const featId = candidate.top_feat_ids[i];
                            const featureInfo = featureMap[featId] || { label: `ID ${featId}`, tier: 's' };
                            features.push({
                                id: featId,
                                label: featureInfo.label,
                                tier: featureInfo.tier,
                                logit_val: candidate.top_feat_contribs[i] 
                            });
                        }
                    }
                    return {
                        token: candidate.token,
                        prev_prob: candidate.value,
                        features: features
                    };
                })
            };
        });

        traceData = {
            weaponName: data.weapon?.name || "Unknown Weapon",
            weaponImageUrl: data.weapon?.internal_name ? `https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/weapon_flat/Path_Wst_${data.weapon.internal_name}.png` : '',
            beam_width: data.beam_width || 'N/A',
            trace: transformedSteps,
            builds: data.builds 
        };

        // Prepend an initial state to the data for clarity
        traceData.trace.unshift({ candidates: [] });
        traceData.builds.unshift({ mains: {}, subs: {} });

        currentStep = 0;
        currentCandidateIndex = 0;
        
        initializeUI();
        updateDisplay();

    } catch (error) {
        console.error('Error processing trace data:', error);
        const container = document.getElementById('main-content');
        container.innerHTML = `<div class="empty-state"><h2>Failed to Load Trace Data</h2><p>${error.message}</p></div>`;
    }
}

// --- UI Initialization and Rendering ---

function initializeUI() {
    try {
        document.getElementById('weapon-name').textContent = traceData.weaponName;
        document.getElementById('beam-width').textContent = `Beam width: ${traceData.beam_width}`;
        const weaponImageEl = document.getElementById('weapon-image');
        if (traceData.weaponImageUrl) {
            weaponImageEl.src = traceData.weaponImageUrl;
            weaponImageEl.alt = traceData.weaponName;
            weaponImageEl.style.display = 'inline-block';
        } else {
            weaponImageEl.style.display = 'none';
        }

        const container = document.getElementById('main-content');
        container.innerHTML = `
            <div class="timeline-container">
                <div class="timeline-header">Timeline</div>
                <div class="timeline" id="timeline"></div>
            </div>
            <div class="content-grid">
                <div class="build-summary">
                    <h2 id="build-summary-header">
                        <span id="build-summary-title-text">Build Summary</span>
                    </h2>
                    <div id="graphical-build"></div> 
                    <div class="abilities-table" id="abilities-table"></div>
                    <div class="slot-counters" id="slot-counters"></div>
                    <div class="constraint-warnings" id="constraint-warnings"></div>
                </div>
                <div class="candidate-inspector">
                    <div class="candidate-header" id="candidate-header"></div>
                    <div class="display-mode-container">
                        <button id="display-mode-btn" onclick="toggleDisplayMode()">Viewing: Logit Influence</button>
                    </div>
                    <div class="tier-filters">
                        <div class="tier-filter-item">
                            <button class="tier-btn m active" onclick="toggleTier('m')">M</button>
                            <span class="tier-label m">Mechanical</span>
                            <span class="tier-tooltip"><b>Mechanical:</b> Laser-focused, monosemantic features that have a very specific, direct effect on gameplay.</span>
                        </div>
                        <div class="tier-filter-item">
                            <button class="tier-btn t active" onclick="toggleTier('t')">T</button>
                            <span class="tier-label t">Tactical</span>
                            <span class="tier-tooltip"><b>Tactical:</b> Features that define build cores through interactions between multiple abilities.</span>
                        </div>
                        <div class="tier-filter-item">
                            <button class="tier-btn s active" onclick="toggleTier('s')">S</button>
                            <span class="tier-label s">Strategic</span>
                            <span class="tier-tooltip"><b>Strategic:</b> Massively complex, overarching features that define entire build archetypes.</span>
                        </div>
                    </div>
                    <div class="feature-chart" id="feature-chart"></div>
                </div>
            </div>
        `;
        renderTimeline();

        const buildSummaryContainer = container.querySelector('.build-summary');
        const buildSummaryHeader = buildSummaryContainer.querySelector('h2');
        
        buildSummaryHeader.innerHTML += '<span class="collapse-icon">[–]</span>';
        const collapseIcon = buildSummaryHeader.querySelector('.collapse-icon');

        buildSummaryHeader.addEventListener('click', () => {
            buildSummaryContainer.classList.toggle('collapsed');
            if (buildSummaryContainer.classList.contains('collapsed')) {
                collapseIcon.textContent = '[+]';
            } else {
                collapseIcon.textContent = '[–]';
            }
        });

        // Collapse the section by default if on a mobile device
        if (window.innerWidth <= 768) {
            buildSummaryContainer.classList.add('collapsed');
            collapseIcon.textContent = '[+]';
        }

    } catch (error) {
        console.error('Error initializing UI:', error);
        document.getElementById('main-content').innerHTML = `<div class="empty-state"><h2>Error initializing UI</h2><p>${error.message}</p></div>`;
    }
}

function renderTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    traceData.trace.forEach((step, index) => {
        const pill = document.createElement('div');
        pill.className = 'timeline-pill' + (index === currentStep ? ' active' : '');
        pill.textContent = index === 0 ? 'Initial' : `Step ${index}`;
        
        pill.onclick = () => selectStep(index);
        pill.addEventListener('mouseenter', (event) => showTooltip(event, index));
        pill.addEventListener('mouseleave', hideTooltip);
        timeline.appendChild(pill);
    });
}

// --- State and Display Updates ---

function selectStep(index) {
    currentStep = index;
    currentCandidateIndex = 0; 
    updateDisplay();
    document.querySelectorAll('.timeline-pill').forEach((pill, i) => {
        pill.classList.toggle('active', i === index);
    });
}

function updateDisplay() {
    if (!traceData) return;
    try {
        updateBuildSummary();
        updateCandidateInspector();
    } catch (error) {
        console.error('Error updating display:', error);
    }
}

function updateBuildSummary() {
    const build = traceData.builds[currentStep];
    if (!build) return;

    const buildTitle = document.getElementById('build-summary-title-text');
    if (currentStep === 0) {
        buildTitle.textContent = 'Initial Build';
    } else {
        buildTitle.textContent = `Build after Step ${currentStep}`;
    }


    const abilityUrl = (name) => `https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/${name || 'none'}.png`;

    const graphicalBuildContainer = document.getElementById('graphical-build');
    graphicalBuildContainer.innerHTML = '';

    const allSubs = [];
    if (build.subs) {
        for (const [ability, count] of Object.entries(build.subs)) {
            for (let i = 0; i < count; i++) {
                allSubs.push(ability);
            }
        }
    }
    while (allSubs.length < 9) {
        allSubs.push('none');
    }

    const gearOrder = ['head', 'clothes', 'shoes'];
    gearOrder.forEach((gearType, index) => {
        const mainAbility = build.mains ? (build.mains[gearType] || 'none') : 'none';
        const subsForPiece = allSubs.slice(index * 3, index * 3 + 3);

        const gearPieceEl = document.createElement('div');
        gearPieceEl.className = 'gear-piece';
        gearPieceEl.innerHTML = `
            <img src="${abilityUrl(mainAbility)}" class="main-ability-icon" alt="${mainAbility}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
            <div class="sub-abilities">
                <img src="${abilityUrl(subsForPiece[0])}" class="sub-ability-icon" alt="${subsForPiece[0]}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
                <img src="${abilityUrl(subsForPiece[1])}" class="sub-ability-icon" alt="${subsForPiece[1]}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
                <img src="${abilityUrl(subsForPiece[2])}" class="sub-ability-icon" alt="${subsForPiece[2]}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
            </div>
        `;
        graphicalBuildContainer.appendChild(gearPieceEl);
    });
    
    const abilitiesTable = document.getElementById('abilities-table');
    abilitiesTable.innerHTML = '';
    
    let mainSlots = 0;
    const abilityAP = {};

    if (build.mains) {
        Object.values(build.mains).forEach(ability => {
            if (ability) {
                mainSlots++;
                abilityAP[ability] = (abilityAP[ability] || 0) + 10;
            }
        });
    }

    let subSlots = 0;
    if (build.subs) {
        Object.entries(build.subs).forEach(([ability, count]) => {
            subSlots += count;
            abilityAP[ability] = (abilityAP[ability] || 0) + (count * 3);
        });
    }
    
    const sortedAbilities = Object.entries(abilityAP).sort((a, b) => b[1] - a[1]);
    sortedAbilities.forEach(([ability, ap]) => {
        const row = document.createElement('div');
        row.className = 'ability-row';
        row.innerHTML = `<span class="ability-name">${ability.replace(/_/g, ' ')}</span><span class="ability-ap">${ap} AP</span>`;
        abilitiesTable.appendChild(row);
    });

    document.getElementById('slot-counters').innerHTML = `
        <div class="slot-counter ${mainSlots > 3 ? 'error' : ''}">Main Slots: ${mainSlots}/3</div>
        <div class="slot-counter ${subSlots > 9 ? 'error' : ''}">Sub Slots: ${subSlots}/9</div>`;

    const warnings = document.getElementById('constraint-warnings');
    warnings.innerHTML = '';
    if (mainSlots > 3) warnings.innerHTML += '<div class="warning-badge">Too many main abilities</div>';
    if (subSlots > 9) warnings.innerHTML += '<div class="warning-badge">Too many sub abilities</div>';
}

function updateCandidateInspector() {
    const step = traceData.trace[currentStep];
    const header = document.getElementById('candidate-header');
    const chartContainer = document.getElementById('feature-chart');

    if (!step || !step.candidates || step.candidates.length === 0) {
        header.innerHTML = `<p>No candidates to inspect for this step.</p>`;
        chartContainer.innerHTML = '';
        return;
    }

    const totalCandidates = step.candidates.length;
    const candidateToInspect = step.candidates[currentCandidateIndex];
    
    header.innerHTML = `
        <div class="candidate-name">${candidateToInspect.token.replace(/_/g, ' ')}</div>
        <div class="candidate-controls">
            <div class="candidate-nav">
                <button id="prev-candidate-btn" ${currentCandidateIndex === 0 ? 'disabled' : ''}>&larr;</button>
                <span id="candidate-counter">${currentCandidateIndex + 1} of ${totalCandidates}</span>
                <button id="next-candidate-btn" ${currentCandidateIndex === totalCandidates - 1 ? 'disabled' : ''}>&rarr;</button>
            </div>
            <div class="candidate-confidence">Confidence: ${(candidateToInspect.prev_prob * 100).toFixed(1)}%</div>
        </div>`;
    
    document.getElementById('prev-candidate-btn').onclick = prevCandidate;
    document.getElementById('next-candidate-btn').onclick = nextCandidate;

    renderFeatureChart(candidateToInspect.features);
}

function renderFeatureChart(features) {
    const container = document.getElementById('feature-chart');
    d3.select(container).selectAll('*').remove(); 
    const width = container.clientWidth;
    if (width <= 0) return; 
    
    const barHeight = 30;
    const isMobile = width <= 768;
    const margin = { 
        top: 10, 
        right: 60,
        bottom: 10, 
        left: isMobile ? 120 : 200 
    };
    const filteredFeatures = features.filter(f => tierFilters[f.tier]);
    
    // Show empty state if no features are available
    if (filteredFeatures.length === 0) {
        container.innerHTML = '<div class="chart-empty-state">No features available for the selected filters</div>';
        return;
    }

    const displayFeatures = filteredFeatures.map(f => {
        let displayValue, displayLabel;
        if (chartDisplayMode === 'logit') {
            displayValue = f.logit_val;
            displayLabel = `${f.logit_val >= 0 ? '+' : ''}${f.logit_val.toFixed(2)}`;
        } else {
            displayValue = sigmoid(f.logit_val) - 0.5;
            displayLabel = `${displayValue > 0 ? '+' : ''}${(displayValue * 100).toFixed(1)}%`;
        }
        return { ...f, displayValue, displayLabel };
    }).sort((a, b) => Math.abs(b.displayValue) - Math.abs(a.displayValue));


    const height = displayFeatures.length * barHeight + margin.top + margin.bottom;
    const chartWidth = width - margin.left - margin.right;

    // FIX: Use a scalable viewBox instead of fixed width/height for a responsive SVG
    const svg = d3.select(container).append('svg')
              .attr('viewBox', `0 0 ${width} ${height}`) // scalable canvas
              .attr('preserveAspectRatio', 'xMinYMid')   // optional
              .classed('fluid-chart', true);             // just for CSS hook

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const maxValue = d3.max(displayFeatures, d => Math.abs(d.displayValue)) || 1;
    const xScale = d3.scaleLinear().domain([-maxValue, maxValue]).range([0, chartWidth]);

    const bars = g.selectAll('.feature-bar').data(displayFeatures).enter().append('g')
        .attr('class', 'feature-bar').attr('transform', (d, i) => `translate(0,${i * barHeight})`);

    const maxLabelLength = isMobile ? 20 : 30;

    bars.on('mouseenter', (event, d) => {
        if (d.label.length > maxLabelLength) {
            const tooltip = document.getElementById('global-tooltip');
            tooltip.innerHTML = d.label;
            tooltip.style.whiteSpace = 'normal';
            tooltip.style.maxWidth = '300px';
            tooltip.style.textAlign = 'left';

            const barRect = event.currentTarget.getBoundingClientRect();
            tooltip.style.left = `${barRect.left + barRect.width / 2}px`;
            tooltip.style.top = `${barRect.top + window.scrollY - 10}px`; 
            tooltip.style.transform = 'translate(-50%, -100%)';
            tooltip.style.opacity = '1';
        }
    })
    .on('mouseleave', hideTooltip);
    
    bars.append('rect').attr('x', 0).attr('y', 0).attr('width', chartWidth).attr('height', barHeight - 4).attr('fill', 'var(--bg-tertiary)').attr('opacity', 0.3);
    
    bars.append('rect').attr('x', d => d.displayValue >= 0 ? xScale(0) : xScale(d.displayValue)).attr('y', 2)
        .attr('width', d => Math.abs(xScale(d.displayValue) - xScale(0))).attr('height', barHeight - 8)
        .attr('fill', d => `var(--color-${d.tier})`).attr('opacity', 0.8);
    
    bars.append('text').attr('x', -10).attr('y', barHeight / 2).attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle').attr('class', 'feature-label')
        .text(d => {
            if (d.label.length > maxLabelLength) {
                return d.label.substring(0, maxLabelLength - 1) + '…';
            }
            return d.label;
        });
    
    bars.append('text')
        .attr('x', d => {
            if (d.displayValue >= 0) {
                return xScale(d.displayValue) + 5;
            } else {
                return xScale(d.displayValue) + 5;
            }
        })
        .attr('y', barHeight / 2)
        .attr('text-anchor', d => {
            if (d.displayValue >= 0) {
                return 'start';
            } else {
                return 'start';
            }
        })
        .attr('dominant-baseline', 'middle')
        .attr('class', 'feature-value')
        .style('fill', 'var(--text-primary)') 
        .text(d => d.displayLabel);

    g.append('line').attr('x1', xScale(0)).attr('x2', xScale(0)).attr('y1', 0).attr('y2', height - margin.top - margin.bottom).attr('stroke', 'var(--border-color)').attr('stroke-width', 2);
}

// --- Helpers and Event Listeners ---

function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

function toggleTier(tier) {
    tierFilters[tier] = !tierFilters[tier];
    document.querySelector(`.tier-btn.${tier}`).classList.toggle('active', tierFilters[tier]);
    if (traceData) updateCandidateInspector();
}

function nextCandidate() {
    const totalCandidates = traceData.trace[currentStep].candidates.length;
    if (currentCandidateIndex < totalCandidates - 1) {
        currentCandidateIndex++;
        updateCandidateInspector();
    }
}
function prevCandidate() {
     if (currentCandidateIndex > 0) {
        currentCandidateIndex--;
        updateCandidateInspector();
    }
}

function toggleDisplayMode() {
    const btn = document.getElementById('display-mode-btn');
    if (chartDisplayMode === 'logit') {
        chartDisplayMode = 'contribution';
        btn.textContent = 'Viewing: Contribution %';
    } else {
        chartDisplayMode = 'logit';
        btn.textContent = 'Viewing: Logit Influence';
    }
    if (traceData) updateCandidateInspector();
}

function showTooltip(event, stepIndex) {
    const tooltip = document.getElementById('global-tooltip');
    const build = traceData.builds[stepIndex];
    if (!build) return;

    let content = '';
    if (build.mains) Object.values(build.mains).forEach(ab => { if(ab) content += `${ab.replace(/_/g, ' ')} (Main)<br>`; });
    if (build.subs) Object.entries(build.subs).forEach(([ab, ct]) => content += `${ab.replace(/_/g, ' ')} x${ct}<br>`);
    if (content === '') content = 'Empty Build';
    
    tooltip.innerHTML = content;
    tooltip.style.whiteSpace = 'normal';
    tooltip.style.maxWidth = '300px';
    tooltip.style.textAlign = 'left';

    const pillRect = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${pillRect.left + pillRect.width / 2}px`;
    tooltip.style.top = `${pillRect.bottom + window.scrollY + 8}px`; 
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.opacity = '1';
}

function hideTooltip() {
    document.getElementById('global-tooltip').style.opacity = '0';
}

window.addEventListener('resize', () => {
    if (traceData) updateCandidateInspector();
    hideTooltip();
});

// Auto-load data on page load
window.addEventListener('DOMContentLoaded', function() {
    fetch('null_trace.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            processAndLoadData(data);
        })
        .catch(error => {
            console.error('Error loading trace data:', error);
            const container = document.getElementById('main-content');
            container.innerHTML = `<div class="empty-state"><h2>Failed to Load Trace Data</h2><p>${error.message}</p></div>`;
        });
}); 