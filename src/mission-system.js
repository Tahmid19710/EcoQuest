// ============================================================
// ECOQUEST — ENVIRONMENTAL CHALLENGE & MISSION SYSTEM
// Missions are evaluated against the player's state when each
// mission starts. Progress is based on existing game mechanics.
// ============================================================

const clamp = (value, min, max) =>
    Math.max(min, Math.min(max, value));

const readNumber = (stats, key) => {
    const value = Number(stats?.[key]);
    return Number.isFinite(value) ? value : 0;
};

const readPreferredNumber = (stats, preferredKey, fallbackKey) => {
    const preferred = Number(stats?.[preferredKey]);
    return Number.isFinite(preferred)
        ? preferred
        : readNumber(stats, fallbackKey);
};

const snapshot = (stats) => ({
    green: readPreferredNumber(stats, 'effectiveGreen', 'green'),
    happiness: readNumber(stats, 'happiness'),
    rainfall: readNumber(stats, 'rainfall'),
    drainage: readNumber(stats, 'drainage'),
    pollution: readPreferredNumber(stats, 'effectivePollution', 'pollution'),
    waste: readNumber(stats, 'waste'),
    floodRisk: readNumber(stats, 'floodRisk')
});

const MISSIONS = [
    {
        id: 'green-recovery',
        title: 'Green Recovery',
        category: 'GREEN INFRASTRUCTURE',
        icon: '🌳',
        description: 'Restore green coverage in your city. Plant trees or gardens and observe how greenery supports public well-being.',
        insight: 'Green spaces improve the city’s Green Score and Happiness in this simulation. Different planting choices have different costs and effects.',
        reward: 50,
        objectives: [
            {
                label: 'Increase Green Score',
                key: 'green',
                unit: 'pts',
                target: 15,
                measure: (current, start) => current.green - start.green
            },
            {
                label: 'Increase Happiness',
                key: 'happiness',
                unit: 'pts',
                target: 6,
                measure: (current, start) => current.happiness - start.happiness
            }
        ]
    },
    {
        id: 'flood-readiness',
        title: 'Flood Readiness',
        category: 'CLIMATE RESILIENCE',
        icon: '🌧️',
        description: 'Observe the effect of rainfall, then strengthen the city’s drainage before water pressure increases further.',
        insight: 'Rainfall raises the simulated flood-risk indicator. Drainage investment reduces the drainage contribution to that indicator.',
        reward: 75,
        objectives: [
            {
                label: 'Reach rainfall level',
                key: 'rainfall',
                unit: '%',
                target: 25,
                measure: current => current.rainfall,
                isComplete: current => current.rainfall >= 25
            },
            {
                label: 'Reach drainage level',
                key: 'drainage',
                unit: '%',
                target: 70,
                measure: current => current.drainage,
                isComplete: current => current.drainage >= 70
            }
        ]
    },
    {
        id: 'clean-city',
        title: 'Clean City',
        category: 'POLLUTION & WASTE',
        icon: '♻️',
        description: 'Reduce pollution and waste through the city cleanup action. Check how the city’s well-being indicators respond.',
        insight: 'The existing cleanup action reduces Pollution by 8 points and Waste by 10 points, while increasing Happiness by 3 points.',
        reward: 60,
        objectives: [
            {
                label: 'Bring pollution to 30% or lower',
                key: 'pollution',
                unit: '%',
                target: 70,
                measure: current => 100 - current.pollution,
                isComplete: current => current.pollution <= 30,
                formatProgress: current => `${Math.round(current.pollution)}% / ≤30%`
            },
            {
                label: 'Bring waste to 20% or lower',
                key: 'waste',
                unit: '%',
                target: 80,
                measure: current => 100 - current.waste,
                isComplete: current => current.waste <= 20,
                formatProgress: current => `${Math.round(current.waste)}% / ≤20%`
            }
        ]
    }
];

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function createMissionSystem({
    stage,
    getStats,
    onReward = () => {},
    onMessage = () => {}
}) {
    if (!stage) {
        throw new Error('Mission System requires the game stage.');
    }

    if (typeof getStats !== 'function') {
        throw new Error('Mission System requires a getStats function.');
    }

    const previous = document.getElementById('eco-mission-panel');
    if (previous) previous.remove();

    if (!document.getElementById('eco-mission-styles')) {
        const style = document.createElement('style');
        style.id = 'eco-mission-styles';
        style.textContent = `
            .eco-mission-panel {
                position: absolute;
                z-index: 11;
                top: 100px;
                left: 12px;
                width: min(310px, calc(100% - 24px));
                max-height: 47%;
                overflow: auto;
                padding: 12px;
                border: 1px solid #66876a;
                border-radius: 11px;
                color: #edf6ed;
                background: rgba(14, 32, 22, .94);
                box-shadow: 0 10px 28px #0006;
                backdrop-filter: blur(9px);
                font-family: Arial, sans-serif;
            }

            .eco-mission-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
            }

            .eco-mission-eyebrow {
                color: #a9e4af;
                font-size: 9px;
                font-weight: 900;
                letter-spacing: 1.1px;
            }

            .eco-mission-title {
                margin: 4px 0 0;
                color: #f1f8ef;
                font-size: 15px;
                line-height: 1.25;
            }

            .eco-mission-toggle {
                flex: 0 0 auto;
                width: 27px;
                height: 27px;
                border: 1px solid #66876a;
                border-radius: 6px;
                background: #294633;
                color: white;
                cursor: pointer;
                font-size: 16px;
            }

            .eco-mission-body {
                margin-top: 10px;
            }

            .eco-mission-description {
                margin: 0 0 10px;
                color: #cfdfd0;
                font-size: 11px;
                line-height: 1.5;
            }

            .eco-mission-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                color: #b8d4bb;
                font-size: 9px;
                font-weight: 800;
            }

            .eco-mission-reward {
                color: #ffe09a;
                white-space: nowrap;
            }

            .eco-mission-progress-track {
                height: 7px;
                overflow: hidden;
                border-radius: 8px;
                background: #405448;
            }

            .eco-mission-progress-fill {
                height: 100%;
                border-radius: inherit;
                background: linear-gradient(90deg, #64b77b, #b6e58b);
                transition: width .25s ease;
            }

            .eco-mission-objectives {
                display: grid;
                gap: 7px;
                margin: 11px 0;
            }

            .eco-mission-objective {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                padding: 8px;
                border: 1px solid #3c6047;
                border-radius: 7px;
                background: #ffffff08;
                font-size: 10px;
            }

            .eco-mission-objective strong {
                color: #d7edc9;
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
            }

            .eco-mission-objective.done {
                border-color: #75b985;
                background: #2f704033;
            }

            .eco-mission-objective.done strong {
                color: #a9e4af;
            }

            .eco-mission-insight {
                padding: 9px;
                border-left: 3px solid #9bcf83;
                border-radius: 5px;
                background: #ffffff0b;
                color: #c7d9c8;
                font-size: 10px;
                line-height: 1.5;
            }

            .eco-mission-action {
                width: 100%;
                margin-top: 10px;
                padding: 9px 11px;
                border: 1px solid #b5d68d;
                border-radius: 7px;
                background: #b5d68d;
                color: #17301e;
                cursor: pointer;
                font-size: 10px;
                font-weight: 900;
            }

            .eco-mission-action:hover {
                background: #d0e9a8;
            }

            .eco-mission-complete {
                padding: 12px;
                border: 1px solid #6ea77b;
                border-radius: 8px;
                background: #2b694033;
                text-align: center;
            }

            .eco-mission-complete strong {
                display: block;
                margin-bottom: 5px;
                color: #b8e9a8;
                font-size: 13px;
            }

            .eco-mission-complete p {
                margin: 0;
                color: #d3e4d3;
                font-size: 10px;
                line-height: 1.5;
            }

            .eco-mission-finished {
                padding: 14px 8px;
                color: #d5e8d2;
                text-align: center;
                font-size: 11px;
                line-height: 1.6;
            }

            @media(max-width: 650px) {
                .eco-mission-panel {
                    top: 100px;
                    left: 8px;
                    width: min(285px, calc(100% - 16px));
                    max-height: 43%;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const panel = document.createElement('section');
    panel.id = 'eco-mission-panel';
    panel.className = 'eco-mission-panel';
    panel.setAttribute('aria-label', 'Environmental missions');
    stage.appendChild(panel);

    let completedCount = 0;
    let started = true;
    let baseline = snapshot(getStats());

    function getObjectiveProgress(mission, current) {
        return mission.objectives.map(objective => {
            const raw = Number(objective.measure(current, baseline)) || 0;
            const value = clamp(raw, 0, objective.target);
            return {
                ...objective,
                value,
                complete: objective.isComplete
                    ? objective.isComplete(current, baseline)
                    : raw >= objective.target,
                display: objective.formatProgress
                    ? objective.formatProgress(current, baseline)
                    : `${Math.floor(value)}/${objective.target} ${objective.unit}`
            };
        });
    }

    function render() {
        const toggleLabel = panel.classList.contains('collapsed') ? '+' : '−';

        if (completedCount >= MISSIONS.length) {
            panel.innerHTML = `
                <div class="eco-mission-header">
                    <div>
                        <div class="eco-mission-eyebrow">ECOQUEST CAMPAIGN</div>
                        <h3 class="eco-mission-title">All Missions Complete</h3>
                    </div>
                    <button class="eco-mission-toggle" type="button" aria-label="Collapse missions">${toggleLabel}</button>
                </div>
                <div class="eco-mission-body">
                    <div class="eco-mission-finished">
                        🏆 You completed all environmental challenges.<br>
                        Your city is ready for free-play improvement.
                    </div>
                </div>
            `;
            bindToggle();
            return;
        }

        const mission = started
            ? MISSIONS[completedCount]
            : MISSIONS[completedCount - 1];

        if (!started) {
            panel.innerHTML = `
                <div class="eco-mission-header">
                    <div>
                        <div class="eco-mission-eyebrow">CAMPAIGN COMPLETE</div>
                        <h3 class="eco-mission-title">✓ ${escapeHtml(mission.title)}</h3>
                    </div>
                    <button class="eco-mission-toggle" type="button" aria-label="Collapse missions">${toggleLabel}</button>
                </div>
                <div class="eco-mission-body">
                    <div class="eco-mission-complete">
                        <strong>Mission completed!</strong>
                        <p>${escapeHtml(mission.insight)}</p>
                        <p class="eco-mission-reward">Reward received: +${mission.reward} credits</p>
                    </div>
                    <button class="eco-mission-action" type="button" data-mission-continue>
                        Start Next Mission →
                    </button>
                </div>
            `;
            bindToggle();
            return;
        }

        const current = snapshot(getStats());
        const progress = getObjectiveProgress(mission, current);
        const total = progress.reduce((sum, item) => sum + item.value / item.target, 0);
        const percent = Math.round((total / progress.length) * 100);
        const currentRisk = Math.round(readNumber(current, 'floodRisk'));

        panel.innerHTML = `
            <div class="eco-mission-header">
                <div>
                    <div class="eco-mission-eyebrow">MISSION ${completedCount + 1} / ${MISSIONS.length} · ${escapeHtml(mission.category)}</div>
                    <h3 class="eco-mission-title">${mission.icon} ${escapeHtml(mission.title)}</h3>
                </div>
                <button class="eco-mission-toggle" type="button" aria-label="Collapse missions">${toggleLabel}</button>
            </div>

            <div class="eco-mission-body">
                <p class="eco-mission-description">${escapeHtml(mission.description)}</p>

                <div class="eco-mission-meta">
                    <span>OBJECTIVES ${progress.filter(item => item.complete).length}/${progress.length}</span>
                    <span class="eco-mission-reward">🏅 +${mission.reward} credits</span>
                </div>

                <div class="eco-mission-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
                    <div class="eco-mission-progress-fill" style="width:${percent}%"></div>
                </div>

                <div class="eco-mission-objectives">
                    ${progress.map(item => `
                        <div class="eco-mission-objective ${item.complete ? 'done' : ''}">
                            <span>${item.complete ? '✓' : '○'} ${escapeHtml(item.label)}</span>
                            <strong>${escapeHtml(item.display)}</strong>
                        </div>
                    `).join('')}
                </div>

                <div class="eco-mission-insight">
                    <strong>Learning insight</strong><br>
                    ${escapeHtml(mission.insight)}
                    <br><br>Current simulated flood risk: <strong>${currentRisk}%</strong>
                </div>
            </div>
        `;

        bindToggle();

        const isComplete = progress.every(item => item.complete);
        if (isComplete) {
            completeMission(mission);
        }
    }

    function bindToggle() {
        const toggle = panel.querySelector('.eco-mission-toggle');
        const body = panel.querySelector('.eco-mission-body');

        if (body) {
            body.hidden = panel.classList.contains('collapsed');
        }

        if (toggle) {
            toggle.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
                const body = panel.querySelector('.eco-mission-body');
                if (body) {
                    body.hidden = panel.classList.contains('collapsed');
                }
                toggle.textContent = panel.classList.contains('collapsed') ? '+' : '−';
            });
        }

        const continueButton = panel.querySelector('[data-mission-continue]');
        if (continueButton) {
            continueButton.addEventListener('click', () => {
                baseline = snapshot(getStats());
                started = true;
                onMessage(`Mission started: ${MISSIONS[completedCount].title}.`);
                render();
            });
        }
    }

    function completeMission(mission) {
        if (!started) return;

        started = false;
        completedCount += 1;

        onReward(mission.reward, mission);
        onMessage(`Mission complete: ${mission.title}. You earned ${mission.reward} credits.`);

        render();
    }

    function update() {
        if (!started || completedCount >= MISSIONS.length) return;
        render();
    }

    function reset() {
        completedCount = 0;
        started = true;
        baseline = snapshot(getStats());
        render();
        onMessage('Environmental missions restarted.');
    }

    function getSaveData() {
        return {
            completedCount,
            started,
            baseline: { ...baseline }
        };
    }

    function loadSaveData(saved) {
        if (!saved || typeof saved !== 'object') {
            reset();
            return;
        }

        const count = Number(saved.completedCount);
        completedCount = Number.isInteger(count)
            ? clamp(count, 0, MISSIONS.length)
            : 0;

        started = (saved.started === true || completedCount === 0)
            && completedCount < MISSIONS.length;

        const source = saved.baseline && typeof saved.baseline === 'object'
            ? saved.baseline
            : getStats();

        baseline = snapshot(source);

        if (completedCount < MISSIONS.length && !started) {
            // Keep the completed mission screen until the player continues.
            render();
            return;
        }

        render();
    }

    render();

    return {
        update,
        reset,
        getSaveData,
        loadSaveData,
        dispose() {
            panel.remove();
        }
    };
}
