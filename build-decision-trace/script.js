// Global variable to store the loaded data
let rawData = null;

// Load data and initialize visualization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load the JSON data from external file
        const response = await fetch('null_trace.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        rawData = await response.json();
        
        // Transform and render the tree
        const treeData = transformData(rawData);
        renderTree(treeData);
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('tree-container').innerHTML = 
            '<div style="color: var(--error); padding: 2rem; text-align: center;">Error loading data. Please check that null_trace.json exists.</div>';
    }
});

/**
 * Transforms the flat JSON data into a hierarchical structure for D3.
 * @param {object} data - The raw JSON data.
 * @returns {object} A hierarchical data object.
 */
function transformData(data) {
    const { probs_keys, ...nodesData } = data;
    const nodeMap = new Map();

    // Create a new true root node for the empty build
    const trueRoot = {
        id: '(true-root)',
        addedAbility: 'Initial Build',
        build: { mains: {}, subs: {} },
        abilities: [],
        probs: null,
        children: []
    };
    nodeMap.set(trueRoot.id, trueRoot);

    // Prepare all nodes from JSON and add to map
    for (const key in nodesData) {
        nodeMap.set(key, {
            id: key,
            ...nodesData[key],
            children: []
        });
    }

    // Link nodes
    nodeMap.forEach((node, key) => {
        if (key === '(true-root)') return; // Skip our new root

        if (key === '(root)') {
            // Link the original root to our new true root
            const parent = nodeMap.get('(true-root)');
            node.addedAbility = '+ Initial Core';
            parent.children.push(node);
        } else {
            // Link other nodes to their parents
            const lastDotIndex = key.lastIndexOf('.');
            const parentKey = lastDotIndex === -1 ? '(root)' : key.substring(0, lastDotIndex);
            
            const parent = nodeMap.get(parentKey);
            if (parent) {
                const parentAbilities = new Set(parent.abilities);
                const added = node.abilities.find(ab => !parentAbilities.has(ab)) || 'unknown';
                node.addedAbility = `+ ${added.replace(/_/g, ' ')}`;
                parent.children.push(node);
            }
        }
    });
    
    return nodeMap.get('(true-root)');
}

/**
 * Renders the D3 tree.
 * @param {object} treeData - The hierarchical data for the tree.
 */
function renderTree(treeData) {
    const container = d3.select("#tree-container");
    const width = container.node().clientWidth;
    const height = container.node().clientHeight;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().on("zoom", (event) => g.attr("transform", event.transform)))
        .append("g");
        
    // Adjust the initial transform to better center the tree
    const g = svg.append("g").attr("transform", "translate(100, 50)");

    const tooltip = d3.select("#tooltip");

    // Reduce the horizontal spacing to make children less wide
    const treeLayout = d3.tree().nodeSize([50, 150]);
    
    const root = d3.hierarchy(treeData, d => d.children);
    
    // Ensure the tree has proper initial positions
    treeLayout(root);
    
    // Set initial positions for animation
    root.x0 = root.x || height / 2;
    root.y0 = root.y || 0;
    
    // Start with the tree collapsed after the first level
    if(root.children) {
        root.children.forEach(collapse);
    }

    update(root);

    function collapse(d) {
        if(d.children) {
            d._children = d.children
            d._children.forEach(collapse)
            d.children = null
        }
    }
    
    function update(source) {
        const duration = 250;
        
        // Recalculate the tree layout
        treeLayout(root);
        const nodes = root.descendants();
        const links = root.links();
        
        // Validate that we have valid positions for all nodes
        nodes.forEach(d => {
            if (isNaN(d.x) || isNaN(d.y)) {
                console.warn('Invalid position for node:', d.data.id, 'x:', d.x, 'y:', d.y);
                d.x = d.x0 || 0;
                d.y = d.y0 || 0;
            }
        });
        
        // Validate links to ensure source and target have valid positions
        links.forEach(link => {
            if (isNaN(link.source.x) || isNaN(link.source.y) || 
                isNaN(link.target.x) || isNaN(link.target.y)) {
                console.warn('Invalid link positions:', {
                    source: { id: link.source.data.id, x: link.source.x, y: link.source.y },
                    target: { id: link.target.data.id, x: link.target.x, y: link.target.y }
                });
                // Fix invalid positions
                if (isNaN(link.source.x)) link.source.x = link.source.x0 || 0;
                if (isNaN(link.source.y)) link.source.y = link.source.y0 || 0;
                if (isNaN(link.target.x)) link.target.x = link.target.x0 || 0;
                if (isNaN(link.target.y)) link.target.y = link.target.y0 || 0;
            }
        });
        
        // Update nodes
        const node = g.selectAll('g.node')
            .data(nodes, d => d.data.id);

        const nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${source.y0 || 0},${source.x0 || 0})`)
            .on('click', click)
            .on('mouseover', (event, d) => {
                tooltip.style('visibility', 'visible').style('opacity', 1);
                renderTooltipContent(tooltip, d.data);
            })
            .on('mousemove', (event) => {
                tooltip.style('top', (event.pageY + 15) + 'px')
                       .style('left', (event.pageX + 15) + 'px');
            })
            .on('mouseout', () => {
                tooltip.style('visibility', 'hidden').style('opacity', 0);
            });
        
        const isBranch = d => d.children || d._children;
        
        nodeEnter.append('circle')
            .attr('r', 1e-6);

        nodeEnter.append('text')
            .attr('dy', '0.31em')
            .attr('x', d => isBranch(d) ? -25 : 25)
            .attr('text-anchor', d => isBranch(d) ? 'end' : 'start')
            .text(d => d.data.addedAbility);
        
        const nodeUpdate = nodeEnter.merge(node);
        
        nodeUpdate.transition().duration(duration)
            .attr('transform', d => `translate(${d.y || 0},${d.x || 0})`);
        
        nodeUpdate.select('circle')
            .attr('r', 12)
            .style('fill', d => isBranch(d) ? 'var(--bg-primary)' : 'var(--color-t)')
            .attr('stroke', d => isBranch(d) ? 'var(--accent)' : 'var(--color-t)');

        const nodeExit = node.exit().transition().duration(duration)
            .attr('transform', d => `translate(${source.y || 0},${source.x || 0})`)
            .remove();
        
        nodeExit.select('circle').attr('r', 1e-6);
        nodeExit.select('text').style('fill-opacity', 1e-6);

        // Update links with additional safety checks
        const link = g.selectAll('path.link')
            .data(links, d => d.target.data.id);
        
        const linkEnter = link.enter().insert('path', 'g')
            .attr('class', 'link')
            .attr('d', d => {
                const o = {x: source.x0 || 0, y: source.y0 || 0};
                return d3.linkHorizontal()({source: o, target: o});
            });
        
        const linkUpdate = linkEnter.merge(link);

        linkUpdate.transition().duration(duration)
            .attr('d', d => {
                // Additional safety check for link path generation
                const sourceX = d.source.x || d.source.x0 || 0;
                const sourceY = d.source.y || d.source.y0 || 0;
                const targetX = d.target.x || d.target.x0 || 0;
                const targetY = d.target.y || d.target.y0 || 0;
                
                if (isNaN(sourceX) || isNaN(sourceY) || isNaN(targetX) || isNaN(targetY)) {
                    console.warn('NaN detected in link path generation:', {
                        source: { x: sourceX, y: sourceY },
                        target: { x: targetX, y: targetY }
                    });
                    return '';
                }
                
                return d3.linkHorizontal().x(d => d.y || 0).y(d => d.x || 0)(d);
            });

        link.exit().transition().duration(duration)
            .attr('d', d => {
                const o = {x: source.x || 0, y: source.y || 0};
                return d3.linkHorizontal()({source: o, target: o});
            })
            .remove();

        nodes.forEach(d => {
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    function click(event, d) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else {
            d.children = d._children;
            d._children = null;
        }
        
        // Force a complete tree recalculation after structure change
        treeLayout(root);
        
        // Ensure all nodes have valid positions after the change
        const allNodes = root.descendants();
        allNodes.forEach(node => {
            if (isNaN(node.x) || isNaN(node.y)) {
                console.warn('Invalid position after click for node:', node.data.id, 'x:', node.x, 'y:', node.y);
                node.x = node.x0 || 0;
                node.y = node.y0 || 0;
            }
        });
        
        update(d);
    }
}

/**
 * Renders the content inside the tooltip.
 * @param {d3.Selection} tooltip - The D3 selection for the tooltip element.
 * @param {object} nodeData - The data object for the hovered node.
 */
function renderTooltipContent(tooltip, nodeData) {
    const { build, addedAbility, probs, abilities } = nodeData;
    
    let contentHtml = `<h3>${addedAbility}</h3>`;
    contentHtml += '<h4>Build Summary</h4>';
    contentHtml += renderBuild(build);
    
    if (probs && rawData) {
        contentHtml += '<h4>Probability Distribution</h4>';
        contentHtml += renderProbsChart(probs, rawData.probs_keys, addedAbility.substring(2), abilities);
    }

    tooltip.html(contentHtml);
}

/**
 * Generates HTML for the graphical build display.
 * @param {object} build - The build data object.
 * @returns {string} HTML string for the build.
 */
function renderBuild(build) {
     if (!build) return '<p>No build data available.</p>';

    const abilityUrl = (name) => `https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/${name || 'none'}.png`;

    let graphicalBuildHtml = '<div class="graphical-build">';
    const allSubs = [];
    if (build.subs) {
        for (const [ability, count] of Object.entries(build.subs)) {
            for (let i = 0; i < count; i++) allSubs.push(ability);
        }
    }
    while (allSubs.length < 9) allSubs.push('none');

    const gearOrder = ['head', 'clothes', 'shoes'];
    gearOrder.forEach((gearType, index) => {
        const mainAbility = build.mains ? (build.mains[gearType] || 'none') : 'none';
        const subsForPiece = allSubs.slice(index * 3, index * 3 + 3);

        graphicalBuildHtml += `
            <div class="gear-piece">
                <img src="${abilityUrl(mainAbility)}" class="main-ability-icon" alt="${mainAbility}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
                <div class="sub-abilities">
                    <img src="${abilityUrl(subsForPiece[0])}" class="sub-ability-icon" alt="${subsForPiece[0]}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
                    <img src="${abilityUrl(subsForPiece[1])}" class="sub-ability-icon" alt="${subsForPiece[1]}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
                    <img src="${abilityUrl(subsForPiece[2])}" class="sub-ability-icon" alt="${subsForPiece[2]}" onerror="this.onerror=null;this.src='https://splat-top.nyc3.cdn.digitaloceanspaces.com/assets/abilities/none.png';">
                </div>
            </div>`;
    });
    graphicalBuildHtml += '</div>';

    return graphicalBuildHtml;
}

/**
 * Generates an HTML histogram for the probabilities.
 * @param {number[]} probs - Array of probabilities.
 * @param {string[]} keys - Array of ability names (keys for probs).
 * @param {string} addedAbilityName - The name of the ability added in this step.
 * @param {string[]} currentAbilities - Array of abilities already in the build.
 * @returns {string} HTML string for the probabilities chart.
 */
function renderProbsChart(probs, keys, addedAbilityName, currentAbilities) {
    if (!probs) return '<p>No probability data.</p>';
    
    const currentAbilitiesSet = new Set(currentAbilities || []);
    const probData = keys.map((key, i) => ({ name: key, prob: probs[i] }))
        .filter(d => d.name !== '<PAD>' && d.name !== '<NULL>')
        .sort((a,b) => b.prob - a.prob); // Sort from high to low

    const maxProb = probData.length > 0 ? probData[0].prob : 0;
    const scale = maxProb > 0 ? 70 / maxProb : 0; // 70 is max height in px

    let chartHtml = '<div class="prob-histogram-container">';
    probData.forEach(d => {
        const displayName = d.name.replace(/_/g, ' ');
        const cleanedAddedName = addedAbilityName.trim();
        
        let barClass = '';
        if (displayName === cleanedAddedName) {
            barClass = 'highlight'; // This was the ability that created the node
        } else if (currentAbilitiesSet.has(d.name)) {
            barClass = 'in-build'; // This ability is already in the build
        }

        const height = d.prob * scale;

        chartHtml += `<div class="prob-hist-bar ${barClass}" 
                           style="height: ${height}px;"
                           title="${displayName}: ${(d.prob * 100).toFixed(2)}%"></div>`;
    });
    chartHtml += '</div>';

    return chartHtml;
} 