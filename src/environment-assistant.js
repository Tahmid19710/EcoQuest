
// ============================================================
// ECOQUEST — EXPLAINABLE ENVIRONMENTAL RISK ASSISTANT
// Rule-based simulation, not a trained ML model
// ============================================================

import {
    calculateEnvironmentalConsequences
} from './environmental-consequences.js';

function calculateRisk(stats) {

    const result = calculateEnvironmentalConsequences({
        stats,
        placedItems: stats.placedItems || [],
        selectedMLArea: stats.selectedMLArea || null
    });

    let level = 'Low';
    let color = '#63c98a';

    if (result.floodRisk >= 70) {
        level = 'Critical';
        color = '#ff7777';
    } else if (result.floodRisk >= 40) {
        level = 'High';
        color = '#ffc66d';
    } else if (result.floodRisk >= 20) {
        level = 'Moderate';
        color = '#a7db78';
    }

    return {
        ...result,
        risk: result.floodRisk,
        level,
        color,
        green: result.effectiveGreen,
        pollution: result.effectivePollution,
        selectedArea: result.selectedMLArea
    };
}
function getRecommendations(result) {

    const recommendations = [];

    if (result.drainage < 80) {
        recommendations.push(
            'Upgrade drainage to reduce water accumulation.'
        );
    }

    if (result.green < 70) {
        recommendations.push(
            'Plant more trees and protect green spaces.'
        );
    }

    if (result.rainfall >= 50) {
        recommendations.push(
            'Prepare for heavy rainfall and monitor flood risk.'
        );
    }

    if (result.runoffPressure >= 15) {
        recommendations.push(
            'Reduce built-surface runoff by protecting green spaces and adding trees or gardens.'
        );
    }

    if (result.industryPressure >= 10 || result.pollution >= 60) {
        recommendations.push(
            'Review further factory expansion and consider cleaner infrastructure such as solar panels.'
        );
    }

    if (result.energy < 50) {
        recommendations.push(
            'Improve the city energy balance with solar panels and more efficient infrastructure.'
        );
    }

    if (result.waste >= 50) {
        recommendations.push(
            'Prioritize waste reduction and use the city cleanup action before expanding further.'
        );
    }

    if (result.susceptibilityIndex !== null && result.susceptibilityIndex >= 0.7) {
        recommendations.push(
            'This selected Upazila has high historical susceptibility. Prioritize drainage and green infrastructure.'
        );
    }

    if (result.risk >= 70) {
        recommendations.push(
            'Prioritize drainage and green infrastructure before new construction.'
        );
    }

    if (recommendations.length === 0) {
        recommendations.push(
            'Current simulated conditions are relatively favorable. Maintain drainage and greenery.'
        );
    }

    return recommendations;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function projectAction(stats, action) {

    const next = {
        ...stats,
        rainfall: stats.rainfall,
        drainage: stats.drainage,
        green: stats.green,
        placedItems: Array.isArray(stats.placedItems)
            ? stats.placedItems.map(item => ({ ...item }))
            : [],
        selectedMLArea: stats.selectedMLArea || null
    };

    if (action === 'drainage') {
        next.drainage = Math.min(100, next.drainage + 15);
    }

    if (action === 'trees') {
        // One Oak Tree adds 3 Green Score points and infiltration capacity.
        next.green = Math.min(100, next.green + 3);
        next.placedItems.push({ type: 'oak' });
    }

    return calculateRisk(next);
}

// ============================================================
// PUBLIC FUNCTION
// ============================================================

export function createEnvironmentAssistant({ getStats }) {

    if (typeof getStats !== 'function') {
        throw new Error(
            'Environment Assistant requires a getStats function.'
        );
    }

    const stage = document.querySelector('.game-stage');

    if (!stage) {
        throw new Error('EcoQuest game stage not found.');
    }

    // Avoid duplicate panels.
    const previous = document.getElementById(
        'eco-environment-assistant'
    );

    if (previous) previous.remove();

    if (!document.getElementById('eco-assistant-styles')) {

        const style = document.createElement('style');
        style.id = 'eco-assistant-styles';

        style.textContent = `
             .eco-ai-panel {
                 position: absolute;
                 z-index: 12;
                 bottom: 52px;
                 right: 12px;
                 width: min(330px, calc(100% - 24px));
                 max-height: 67%;
                 overflow: auto;
                 padding: 13px;
                 border: 1px solid #5a8269;
                 border-radius: 12px;
                 color: #edf6ed;
                 background: rgba(13, 30, 22, 0.94);
                 box-shadow: 0 12px 30px #0007;
                 font-family: Arial, sans-serif;
                 backdrop-filter: blur(10px);
             }

             .eco-ai-panel h3 {
                 margin: 0;
                 font-size: 14px;
             }

             .eco-ai-header {
                 display: flex;
                 justify-content: space-between;
                 align-items: center;
                 gap: 8px;
             }

             .eco-ai-toggle {
                 cursor: pointer;
                 padding: 6px 9px;
                 color: white;
                 border: 1px solid #66866b;
                 border-radius: 6px;
                 background: #294936;
             }

             .eco-ai-panel.collapsed {
                 width: auto;
                 max-width: calc(100% - 24px);
             }

             .eco-ai-panel.collapsed .eco-ai-body {
                 display: none;
             }

             .eco-ai-description {
                 margin: 10px 0;
                 color: #c2d5c7;
                 font-size: 10px;
                 line-height: 1.5;
             }

             .eco-ai-risk-line {
                 display: flex;
                 justify-content: space-between;
                 align-items: center;
                 margin-top: 10px;
             }

             .eco-ai-risk-value {
                 font-size: 27px;
                 font-weight: 900;
             }

             .eco-ai-risk-level {
                 font-weight: 800;
                 font-size: 12px;
             }

             .eco-ai-track {
                 height: 8px;
                 overflow: hidden;
                 margin: 9px 0 14px;
                 border-radius: 8px;
                 background: #435047;
             }

             .eco-ai-fill {
                 height: 100%;
                 border-radius: 8px;
                 transition: width 0.3s ease;
             }

             .eco-ai-section {
                 margin-top: 12px;
                 font-size: 11px;
                 font-weight: 800;
                 color: #a9e4af;
             }

             .eco-ai-factor {
                 display: flex;
                 justify-content: space-between;
                 gap: 12px;
                 padding: 7px 0;
                 border-bottom: 1px solid #ffffff16;
                 font-size: 11px;
             }

             .eco-ai-factor strong {
                 white-space: nowrap;
             }

             .eco-ai-list {
                 margin: 8px 0 0;
                 padding-left: 18px;
                 color: #e0eee2;
                 font-size: 11px;
                 line-height: 1.65;
             }

             .eco-ai-actions {
                 display: flex;
                 gap: 6px;
                 flex-wrap: wrap;
                 margin-top: 10px;
             }

             .eco-ai-action {
                 cursor: pointer;
                 padding: 8px;
                 border: 1px solid #63856b;
                 border-radius: 7px;
                 color: white;
                 background: #315f40;
                 font-size: 10px;
             }

             .eco-ai-action:hover {
                 background: #438457;
             }

             .eco-ai-projection {
                 margin-top: 10px;
                 padding: 10px;
                 border-radius: 7px;
                 background: #ffffff10;
                 color: #dcf0df;
                 font-size: 11px;
                 line-height: 1.6;
             }

             .eco-ai-area-context {
                 margin: 10px 0;
                 padding: 9px;
                 border: 1px solid #456b53;
                 border-radius: 7px;
                 background: #ffffff0b;
                 color: #dceee0;
                 font-size: 10px;
                 line-height: 1.6;
             }

             .eco-ai-area-context strong {
                 color: #a9e4af;
             }

             .eco-ai-apply-row {
                 display: flex;
                 gap: 6px;
                 flex-wrap: wrap;
                 margin-top: 7px;
             }

             .eco-ai-apply {
                 cursor: pointer;
                 padding: 8px;
                 border: 1px solid #9baf70;
                 border-radius: 7px;
                 color: #102417;
                 background: #b8d88a;
                 font-size: 10px;
                 font-weight: 800;
             }

             .eco-ai-apply:hover {
                 background: #d0e8a8;
             }

             .eco-ai-note {
                 margin-top: 11px;
                 color: #aabdb1;
                 font-size: 9px;
                 line-height: 1.5;
             }

             @media (max-width: 650px) {
                 .eco-ai-panel {
                     max-height: 55%;
                     bottom: 48px;
                 }
             }
         `;

        document.head.appendChild(style);
    }

    const panel = document.createElement('section');

    panel.id = 'eco-environment-assistant';
    panel.className = 'eco-ai-panel';

    panel.innerHTML = `
         <div class="eco-ai-header">
             <h3>🧠 Environmental Assistant</h3>
             <button
                 type="button"
                 class="eco-ai-toggle"
                 aria-expanded="true"
                 aria-label="Minimize environmental assistant"
             >−</button>
         </div>

         <div class="eco-ai-body">

             <p class="eco-ai-description">
                 Explainable city simulation based on rainfall,
                 greenery, drainage and player-built surfaces.
             </p>

             <div id="eco-ai-results"></div>

             <div class="eco-ai-section">
                 🔮 What-if Simulation
             </div>

             <div class="eco-ai-actions">
                 <button
                     type="button"
                     class="eco-ai-action"
                     data-scenario="drainage"
                 >Preview +15 Drainage</button>

                 <button
                     type="button"
                     class="eco-ai-action"
                     data-scenario="trees"
                 >Preview +3 Green (1 Oak)</button>
             </div>

             <div class="eco-ai-section">
                 🎮 Apply a Game Action
             </div>

             <div class="eco-ai-apply-row">
                 <button
                     type="button"
                     class="eco-ai-apply"
                     data-apply-action="drainage"
                 >Apply Drainage (20 credits)</button>

                 <button
                     type="button"
                     class="eco-ai-apply"
                     data-apply-action="trees"
                 >Select Oak Tree (8 credits)</button>
             </div>

             <div
                 id="eco-ai-projection"
                 class="eco-ai-projection"
                 aria-live="polite"
             >
                 Select a scenario to preview its impact.
             </div>

             <p class="eco-ai-note">
                 Game risk is a transparent simulation of rainfall, effective greenery,
                 drainage and built-surface runoff, adjusted by the selected Upazila's
                 historical susceptibility layer.
                 The XGBoost classifier predicts its historical 2022 target from 11
                 geospatial features; it is not a live flood forecast. Preview buttons
                 do not change the city. Apply buttons use the actual game controls.
             </p>
         </div>
     `;

    stage.appendChild(panel);

    const results = panel.querySelector('#eco-ai-results');
    const projection = panel.querySelector('#eco-ai-projection');
    const toggle = panel.querySelector('.eco-ai-toggle');

    let selectedScenario = null;

    // ========================================================
    // UPDATE ASSISTANT FROM CURRENT GAME STATE
    // ========================================================

    function update() {

        const currentStats = getStats();
        const result = calculateRisk(currentStats);
        const recommendations = getRecommendations(result);

        results.innerHTML = `
             <div class="eco-ai-risk-line">
                 <span
                     class="eco-ai-risk-value"
                     style="color:${result.color}"
                 >${result.risk}%</span>

                 <span
                     class="eco-ai-risk-level"
                     style="color:${result.color}"
                 >${result.level} Risk</span>
             </div>

             <div class="eco-ai-track">
                 <div
                     class="eco-ai-fill"
                     style="
                         width:${result.risk}%;
                         background:${result.color};
                     "
                 ></div>
             </div>

             ${result.selectedArea ? `
             <div class="eco-ai-area-context">
                 <strong>Historical susceptibility context</strong><br>
                 ${escapeHtml(result.selectedArea.upazila)}, ${escapeHtml(result.selectedArea.district)}<br>
                 Mean susceptibility: ${(Number(result.selectedArea.mean_score) * 100).toFixed(2)}%<br>
                 High + Very High area: ${Number(result.selectedArea.high_very_high_pct).toFixed(2)}%<br>
                 Game modifier: ${result.susceptibilityMultiplier.toFixed(2)}×
             </div>
             ` : `
             <div class="eco-ai-area-context">
                 No Upazila selected. The game is using local simulated conditions only.
             </div>
             `}
             <div class="eco-ai-area-context">
                 <strong>Live city pressures</strong><br>
                 Effective pollution: ${result.effectivePollution}%<br>
                 Industry pressure: ${result.industryPressure}%<br>
                 Built surface: ${result.imperviousSurface}%<br>
                 Green infiltration: ${result.greenInfiltration}%<br>
                 Surface runoff pressure: ${result.runoffPressure}%<br>
                 Energy balance: ${result.energy}%<br>
                 Waste level: ${result.waste}%
             </div>

             <div class="eco-ai-section">
                 📊 Local flood-risk drivers
             </div>

             ${result.factors.map(factor => `
                 <div class="eco-ai-factor">
                     <span>${escapeHtml(factor.name)}</span>
                     <strong>
                         ${factor.points.toFixed(1)} points
                     </strong>
                 </div>
             `).join('')}

             <div class="eco-ai-section">
                 💡 Recommended Actions
             </div>

             <ul class="eco-ai-list">
                 ${recommendations.map(item => `
                     <li>${escapeHtml(item)}</li>
                 `).join('')}
             </ul>
         `;

        if (selectedScenario) {

            const future = projectAction(
                currentStats,
                selectedScenario
            );

            const improvement = result.risk - future.risk;

            const label = selectedScenario === 'drainage'
                ? '+15 Drainage'
                : '+15 Green Score';

            projection.innerHTML = `
                 <strong>${label}</strong>
                 <div>
                     Current game risk: ${result.risk}%
                 </div>
                 <div>
                     Projected game risk:
                     <strong>${future.risk}%</strong>
                 </div>
                 <div style="color:#9fe8ae">
                     Estimated reduction:
                     ${Math.max(0, improvement)} percentage points
                 </div>
             `;
        }
    }

    // ========================================================
    // WHAT-IF BUTTON HANDLERS
    // ========================================================

    panel.querySelectorAll('[data-scenario]').forEach(button => {

        button.addEventListener('click', () => {

            selectedScenario = button.dataset.scenario;

            update();
        });
    });

    // ========================================================
    // APPLY REAL GAME ACTIONS THROUGH EXISTING GAME CONTROLS
    // ========================================================

    panel.querySelectorAll('[data-apply-action]').forEach(button => {

        button.addEventListener('click', () => {

            const action = button.dataset.applyAction;
            const before = getStats();

            if (action === 'drainage') {
                const control = document.querySelector('[data-action="drainage"]');

                if (!control) {
                    projection.textContent = 'Drainage control is unavailable.';
                    return;
                }

                control.click();

                const after = getStats();
                selectedScenario = null;

                projection.textContent = after.drainage > before.drainage
                    ? 'Drainage improved by 15 points. The game risk has been recalculated.'
                    : 'Drainage did not change. Check available credits or whether drainage is already at maximum.';
                update();
                return;
            }

            if (action === 'trees') {
                const control = document.querySelector('[data-tool="oak"]');

                if (!control) {
                    projection.textContent = 'Oak Tree tool is unavailable.';
                    return;
                }

                control.click();
                selectedScenario = null;
                projection.textContent = 'Oak Tree selected. Click an empty city tile to plant it. The green score and game risk will update after placement.';
            }
        });
    });

    // ========================================================
    // COLLAPSE / EXPAND
    // ========================================================

    toggle.addEventListener('click', () => {

        const collapsed = panel.classList.toggle('collapsed');

        toggle.textContent = collapsed ? '+' : '−';
        toggle.setAttribute(
            'aria-expanded',
            String(!collapsed)
        );
        toggle.setAttribute(
            'aria-label',
            collapsed
                ? 'Expand environmental assistant'
                : 'Minimize environmental assistant'
        );
    });

    // First render.
    update();

    console.log(
        'EcoQuest Environmental Assistant initialized.'
    );

    return {
        update,

        getReport() {
            return calculateRisk(getStats());
        },

        dispose() {
            panel.remove();
        }
    };
}
