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
                    <h2>Build Summary</h2>
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
        pill.textContent = index === 0 ? 'Start' : `Step ${index}`;
        
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
        <div class="candidate-title-area">
            <div class="candidate-name">${candidateToInspect.token.replace(/_/g, ' ')}</div>
            <div class="candidate-nav">
                <button id="prev-candidate-btn" ${currentCandidateIndex === 0 ? 'disabled' : ''}>&larr;</button>
                <span id="candidate-counter">${currentCandidateIndex + 1} of ${totalCandidates}</span>
                <button id="next-candidate-btn" ${currentCandidateIndex === totalCandidates - 1 ? 'disabled' : ''}>&rarr;</button>
            </div>
        </div>
        <div class="candidate-prob">Probability: ${(candidateToInspect.prev_prob * 100).toFixed(1)}%</div>`;
    
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
    const margin = { top: 10, right: 60, bottom: 10, left: 200 };
    const filteredFeatures = features.filter(f => tierFilters[f.tier]);
    if (filteredFeatures.length === 0) return;

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
    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const maxValue = d3.max(displayFeatures, d => Math.abs(d.displayValue)) || 1;
    const xScale = d3.scaleLinear().domain([-maxValue, maxValue]).range([0, chartWidth]);

    const bars = g.selectAll('.feature-bar').data(displayFeatures).enter().append('g')
        .attr('class', 'feature-bar').attr('transform', (d, i) => `translate(0,${i * barHeight})`);

    bars.append('rect').attr('x', 0).attr('y', 0).attr('width', chartWidth).attr('height', barHeight - 4).attr('fill', 'var(--bg-tertiary)').attr('opacity', 0.3);
    bars.append('rect').attr('x', d => d.displayValue >= 0 ? xScale(0) : xScale(d.displayValue)).attr('y', 2)
        .attr('width', d => Math.abs(xScale(d.displayValue) - xScale(0))).attr('height', barHeight - 8)
        .attr('fill', d => `var(--color-${d.tier})`).attr('opacity', 0.8);
    
    bars.append('text').attr('x', -10).attr('y', barHeight / 2).attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle').attr('class', 'feature-label').text(d => d.label);
    
    bars.append('text')
        .attr('x', d => d.displayValue >= 0 ? xScale(d.displayValue) - 5 : xScale(d.displayValue) + 5)
        .attr('y', barHeight / 2)
        .attr('text-anchor', d => d.displayValue >= 0 ? 'end' : 'start')
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
    // FIX: Embed data directly to avoid fetch/CORS errors.
    const embeddedData = {"weapon":{"name":"Splatana Stamper","internal_name":"Saber_Normal_00"},"beam_width":5,"steps":[[{"token":"stealth_jump","value":0.7042425870895386,"top_feat_ids":[959,1257,2021,501,1820,1072,110,1888,711,1376],"top_feat_contribs":[0.87,0.23,0.24,0.11,0.06,-0.05,-0.04,-0.04,-0.01,-0.01]},{"token":"quick_super_jump_3","value":0.6743161082267761,"top_feat_ids":[959,2021,501,1257,399,1072,1888,1322,110,711],"top_feat_contribs":[0.25,0.13,0.09,0.06,0.05,-0.05,-0.05,-0.03,-0.02,-0.02]},{"token":"swim_speed_up_6","value":0.65684974193573,"top_feat_ids":[2021,37,1257,1426,1820,1888,399,845,110,959],"top_feat_contribs":[0.07,0.06,0.04,0.03,0.02,-0.09,-0.08,-0.07,-0.03,-0.03]},{"token":"quick_respawn_3","value":0.5056751370429993,"top_feat_ids":[959,399,501,845,367,1072,1322,1888,236,823],"top_feat_contribs":[0.18,0.11,0.11,0.09,0.09,-0.03,-0.03,-0.01,-0.01,-0.01]},{"token":"ink_saver_main_3","value":0.5210029482841492,"top_feat_ids":[959,1257,2021,1132,1820,845,399,501,1322,1888],"top_feat_contribs":[0.11,0.09,0.09,0.05,0.03,-0.12,-0.04,-0.03,-0.03,-0.02]}],[{"token":"ink_saver_main_6","value":0.6992373466491699,"top_feat_ids":[381,1257,2039,24,996,1512,1881,1051,106,399],"top_feat_contribs":[0.96,0.35,0.27,0.18,0.16,-0.32,-0.29,-0.23,-0.11,-0.08]},{"token":"quick_respawn_12","value":0.5185980796813965,"top_feat_ids":[1051,1861,959,1257,106,381,871,65,1881,1512],"top_feat_contribs":[1.3,0.49,0.44,0.28,0.14,-0.26,-0.23,-0.17,-0.12,-0.06]},{"token":"comeback","value":0.6503883600234985,"top_feat_ids":[1257,959,2039,1051,1512,381,518,791,1842,1072],"top_feat_contribs":[0.42,0.39,0.32,0.25,0.17,-0.22,-0.04,-0.03,-0.02,-0.02]}],[{"token":"quick_respawn_3","value":0.9999198913574219,"top_feat_ids":[880,1861,572,1129,986,692,871,1566,65,1881],"top_feat_contribs":[6.18,1.41,0.77,0.41,0.37,-0.29,-0.16,-0.09,-0.09,-0.08]},{"token":"ink_saver_main_3","value":0.9998248219490051,"top_feat_ids":[692,996,2039,1129,24,880,540,1861,1881,1512],"top_feat_contribs":[7.32,0.51,0.36,0.35,0.26,-0.48,-0.32,-0.24,-0.2,-0.17]},{"token":"quick_respawn_15","value":0.7873517274856567,"top_feat_ids":[880,1861,1257,1630,1194,692,871,65,1566,1881],"top_feat_contribs":[2.76,1.09,0.4,0.37,0.28,-0.88,-0.35,-0.3,-0.26,-0.15]}],[{"token":"quick_respawn_12","value":0.9999713897705078,"top_feat_ids":[889,1861,1630,880,1194,692,871,1566,65,1881],"top_feat_contribs":[10.0,1.15,0.54,0.42,0.4,-0.71,-0.33,-0.26,-0.25,-0.13]}],[{"token":"sub_power_up_3","value":0.10684168338775635,"top_feat_ids":[2039,1257,1861,1024,996,889,692,540,1512,1881],"top_feat_contribs":[0.48,0.46,0.26,0.21,0.17,-0.8,-0.28,-0.18,-0.16,-0.15]}],[{"token":"sub_power_up_6","value":0.4569753110408783,"top_feat_ids":[1216,1024,1257,1350,2039,889,692,1842,540,871],"top_feat_contribs":[1.98,1.32,0.77,0.56,0.55,-1.04,-0.46,-0.24,-0.2,-0.19]},{"token":"sub_power_up_3","value":0.999484658241272,"top_feat_ids":[1024,1350,1216,2039,719,889,692,1322,1402,1881],"top_feat_contribs":[5.06,3.55,1.11,0.59,0.39,-0.75,-0.33,-0.25,-0.18,-0.15]}]],"builds":[{"mains":{"head":null,"clothes":null,"shoes":"stealth_jump"},"subs":{"quick_super_jump":1,"swim_speed_up":2,"quick_respawn":1,"ink_saver_main":1}},{"mains":{"head":"comeback","clothes":null,"shoes":"stealth_jump"},"subs":{"quick_super_jump":1,"swim_speed_up":2,"quick_respawn":4,"ink_saver_main":2}},{"mains":{"head":"comeback","clothes":"quick_respawn","shoes":"stealth_jump"},"subs":{"quick_super_jump":1,"swim_speed_up":2,"ink_saver_main":2,"quick_respawn":2}},{"mains":{"head":"comeback","clothes":"quick_respawn","shoes":"stealth_jump"},"subs":{"quick_super_jump":1,"swim_speed_up":2,"ink_saver_main":2,"quick_respawn":2}},{"mains":{"head":"comeback","clothes":"quick_respawn","shoes":"stealth_jump"},"subs":{"quick_super_jump":1,"swim_speed_up":2,"ink_saver_main":2,"quick_respawn":2,"sub_power_up":1}},{"mains":{"head":"comeback","clothes":"quick_respawn","shoes":"stealth_jump"},"subs":{"quick_super_jump":1,"swim_speed_up":2,"ink_saver_main":2,"quick_respawn":2,"sub_power_up":2}}],"feature_labels":{"feature_ids":[1861,1257,0,2,3,4,5,6,7,1,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,959,2021,501,1820,399,1072,110,1888,711,37,842,1426,1376,845,335,1322,1132,381,352,692,996,2035,698,1609,355,416,2039,1860,1217,1169,1773,629,1612,1512,1997,1572,1812,1172,944,1881,303,986,1793,540,1708,871,65,1531,1440,1002,1961,452,1266,645,528,1654,1088,791,1412,282,1583,1216,1350,1024,1269,1009,1944,1455,2046,1489,1673,367,236,823,1051,106,518,1842,880,572,1129,1566,1630,1194,889,719,1402],"feature_names":["Stamper QR","Stamper Balanced","Sub Spam Jr","Machine QR","Sorella QSJ12","Special Saver 12","Nocto","Tenta Beakon","Stamper Comeback No QR","Angle Shooter","Hydra Splatling","Aggressive Douser","","Dualie Squelchers","ISM/SSU","IRU12","Haunt","High RSU","51+","","Speed Sploosh","NS ISS38","Bomb Spam Inkbrush","Beakon Wiper","Painbrush Meta","Short Range Shooter Balanced","Stamper ISM","","BPU3","96 Deco Base","","Bloblobber Meta","Big Swig Express/Bloblobber Deco Base","QR Comeback","Heavy Edit Nouveau RSU29","Aerospray MG High SSU Base","Ink Hungry Weapons","","Stamper SJ QSJ CB Core","Stamper Basic","Mint Decav QR","Mint Decav Comeback SJ","Aggro Base","Midrange ISS38","Drop Roller","IRU21","High Investment (All)","SSU6","SSU3","Stamper Ninja Squid","Midrange Comeback Thermal","Dapple Dualies Comeback BPU6","Limit ISM/IRU","Object Shredder","Dynamo Base","ISM3","ISM3","Shooter ISM3/6","Splatana CB SJ Base","Midrange Comeback QSJ SJ","Shooter IRU12/15 SCU15","Shooter IA Base","Ink Hungry Midrange","Midrange Slow Base","Stamper CB SJ ISM","Stamper SSU SJ","Aggro Dualies Base","SRU21/29","HyperAggro CB QR","NS SSU","SBlast91 Base","General SJ Reinforce","Midrange SJ Reinforce","SSU3 Reinforce","Midrange- Base","Midrange- SJ Reinforce","Stamper CB SJ","QSJ Utility","QSJ3 Reinforce","Aggro QR21","Recycled Mk 1 Base","Comeback Base","Aggro CB SJ","Low Fix SSU QSJ ISM","Utility","ISM Mid-to-High","Stamper SJ ISM","Mobility Base","Stamper v/n CB Base","QRSJCB Core","SJ Midrange- Base","IRU Max","Moderate QR","Needs RES","Midrange+ OS","High QR","SJ High Investment","ISM Mid","IRU Mid-to-High","Utility BPU","Minor BPU","Round-out BPU","Stamper/Decav CB Balanced","Burst Bomb BPU","Utility SPU","Aggro Minor SPU","Mid SRU","Mid SRU","No SRU","QR3","RSU 38","High QSJ","QR Core","CB SJ Mid-QR","Ambush Base","Max Investment","QR12 Reinforce","QR6 Reinforce","Aggro QR Core","CB no QR","Aggro QR15 Reinforce","High QR Core","QR15 Reinforce","BPU Reinforce","High Investment Util Core"],"feature_categories":["none","tactical","tactical","tactical","tactical","mechanical","tactical","tactical","tactical","strategic","tactical","tactical","none","tactical","tactical","mechanical","mechanical","tactical","mechanical","none","tactical","tactical","tactical","tactical","tactical","strategic","tactical","none","mechanical","tactical","none","tactical","tactical","strategic","tactical","tactical","strategic","none","tactical","tactical","tactical","tactical","strategic","tactical","mechanical","mechanical","mechanical","mechanical","mechanical","tactical","strategic","tactical","tactical","tactical","tactical","tactical","mechanical","strategic","tactical","strategic","strategic","tactical","strategic","tactical","tactical","tactical","tactical","tactical","strategic","tactical","tactical","mechanical","mechanical","mechanical","tactical","mechanical","tactical","strategic","mechanical","strategic","tactical","tactical","tactical","mechanical","tactical","tactical","tactical","strategic","tactical","tactical","none","tactical","tactical","mechanical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","tactical","mechanical","mechanical","tactical","tactical","tactical","strategic","mechanical","mechanical","mechanical","strategic","tactical","tactical","tactical","mechanical","mechanical","strategic"],"feature_notes":["","","","Seems to push for Opening Gambit","Seems to work primarily to reduce probabilities","","It suggests Run Speed Up. Why","Entirely Beakon, mostly Tenta Brella","Comeback and Stealth Jump, no QR","Unsure what this could be truthfully","Seems to activate on the main weapon almost exclusively to suggest a ton of RSU","small amounts of ink resist tend to make some of the bins go up significantly","","","","","","","","","Adding any amount of QR kills this build","","","Seems to prefer not-57 sub power up","Looks like it uses a solid core","Some influence for short range shooters with minimal investment to get started","Prefers LDE but Comeback activates it strongly too","","","","","","","","","Seems to correct for high amounts of SSU by giving negative weights to SSU above 29","Extremely high activation values, encourages a reasonable amount of ISM and a strong push to including a stealth jump kit","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","Fill-in-the-hole","Penalizes BRU, Adds to QR and BPU","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""]}};
    processAndLoadData(embeddedData);
}); 