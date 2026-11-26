// ============================================================
// ECOQUEST — DYNAMIC ENVIRONMENTAL CONSEQUENCES
// Transparent gameplay rules, not a trained prediction model.
// ============================================================

const clamp = (value, min, max) =>
    Math.max(min, Math.min(max, value));

const readPercent = (stats, key) => {
    const value = Number(stats?.[key]);
    return Number.isFinite(value)
        ? clamp(value, 0, 100)
        : 0;
};

const BUILD_IMPACTS = {
    house: { impervious: 8 },
    apartment: { impervious: 12 },
    factory: { impervious: 16, industrial: 5 },
    oak: { infiltration: 6 },
    pine: { infiltration: 6 },
    blossom: { infiltration: 6 },
    flower: { infiltration: 3 }
};

function countBuilds(placedItems = []) {
    const counts = {};

    for (const item of placedItems) {
        const type = typeof item === 'string' ? item : item?.type;
        if (!type) continue;
        counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
}

/**
 * Calculate the city's derived environmental indicators.
 *
 * The values are deliberately transparent game-balance weights:
 * - Houses, apartments and factories add impervious surface.
 * - Trees and gardens add infiltration capacity.
 * - Factories add ongoing industrial pressure.
 * - Rainfall, effective greenery, drainage and runoff combine
 *   to calculate the local simulated flood-risk score.
 *
 * These values are for the game simulation only. They are not
 * measurements of real land cover or a validated flood forecast.
 */
export function calculateEnvironmentalConsequences({
    stats = {},
    placedItems = [],
    selectedMLArea = stats.selectedMLArea || null
} = {}) {
    const counts = countBuilds(placedItems);

    const factoryCount = counts.factory || 0;

    let imperviousSurface = 0;
    let greenInfiltration = 0;

    for (const [type, impact] of Object.entries(BUILD_IMPACTS)) {
        const count = counts[type] || 0;
        imperviousSurface += count * (impact.impervious || 0);
        greenInfiltration += count * (impact.infiltration || 0);
    }

    imperviousSurface = clamp(imperviousSurface, 0, 100);
    greenInfiltration = clamp(greenInfiltration, 0, 60);

    const runoffPressure = clamp(
        imperviousSurface - greenInfiltration,
        0,
        100
    );

    const industryPressure = clamp(
        factoryCount * 5,
        0,
        40
    );

    const basePollution = readPercent(stats, 'pollution');
    const baseGreen = readPercent(stats, 'green');

    const effectivePollution = clamp(
        basePollution + industryPressure,
        0,
        100
    );

    const effectiveGreen = clamp(
        baseGreen - imperviousSurface * 0.2,
        0,
        100
    );

    const rainfall = readPercent(stats, 'rainfall');
    const drainage = readPercent(stats, 'drainage');

    const rainfallEffect = rainfall * 0.55;
    const greenEffect = (100 - effectiveGreen) * 0.15;
    const drainageEffect = (100 - drainage) * 0.15;
    const runoffEffect = runoffPressure * 0.15;

    const localRisk =
        rainfallEffect +
        greenEffect +
        drainageEffect +
        runoffEffect;

    let susceptibilityIndex = null;
    let susceptibilityMultiplier = 1;

    if (selectedMLArea) {
        const meanScore = clamp(
            Number(selectedMLArea.mean_score) || 0,
            0,
            1
        );

        const highShare = clamp(
            (Number(selectedMLArea.high_very_high_pct) || 0) / 100,
            0,
            1
        );

        susceptibilityIndex = (meanScore + highShare) / 2;
        susceptibilityMultiplier = 0.5 + susceptibilityIndex;
    }

    const floodRisk = clamp(
        Math.round(localRisk * susceptibilityMultiplier),
        0,
        100
    );

    const factors = [
        {
            name: 'Heavy rainfall',
            points: rainfallEffect,
            description: 'Rainfall increases water accumulation.'
        },
        {
            name: 'Low effective green coverage',
            points: greenEffect,
            description: 'Vegetation helps absorb and slow surface water.'
        },
        {
            name: 'Poor drainage',
            points: drainageEffect,
            description: 'Weak drainage makes runoff harder to manage.'
        },
        {
            name: 'Built-surface runoff',
            points: runoffEffect,
            description: 'Buildings add hard surfaces; trees and gardens offset some runoff pressure.'
        }
    ].sort((a, b) => b.points - a.points);

    return {
        factoryCount,
        imperviousSurface,
        greenInfiltration,
        runoffPressure,
        industryPressure,
        basePollution,
        effectivePollution,
        baseGreen,
        effectiveGreen,
        rainfall,
        drainage,
        rainfallEffect,
        greenEffect,
        drainageEffect,
        runoffEffect,
        localRisk: clamp(localRisk, 0, 100),
        floodRisk,
        selectedMLArea,
        susceptibilityIndex,
        susceptibilityMultiplier,
        factors
    };
}
