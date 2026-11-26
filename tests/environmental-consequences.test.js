import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateEnvironmentalConsequences
} from '../src/environmental-consequences.js';

const baseStats = {
    pollution: 38,
    green: 32,
    rainfall: 0,
    drainage: 55
};

test('baseline city has no added building pressure', () => {
    const result = calculateEnvironmentalConsequences({
        stats: baseStats,
        placedItems: []
    });

    assert.equal(result.factoryCount, 0);
    assert.equal(result.industryPressure, 0);
    assert.equal(result.runoffPressure, 0);
    assert.equal(result.effectivePollution, 38);
    assert.equal(result.effectiveGreen, 32);
    assert.equal(result.floodRisk, 17);
});

test('a player-built factory adds industrial and runoff pressure', () => {
    const result = calculateEnvironmentalConsequences({
        stats: baseStats,
        placedItems: [{ type: 'factory' }]
    });

    assert.equal(result.factoryCount, 1);
    assert.equal(result.industryPressure, 5);
    assert.equal(result.imperviousSurface, 16);
    assert.equal(result.runoffPressure, 16);
    assert.equal(result.effectivePollution, 43);
    assert.equal(result.effectiveGreen, 28.8);
    assert.equal(result.floodRisk, 20);
});

test('green infrastructure offsets built-surface runoff', () => {
    const result = calculateEnvironmentalConsequences({
        stats: { ...baseStats, pollution: 45, green: 35 },
        placedItems: [
            { type: 'factory' },
            { type: 'oak' }
        ]
    });

    assert.equal(result.imperviousSurface, 16);
    assert.equal(result.greenInfiltration, 6);
    assert.equal(result.runoffPressure, 10);
    assert.equal(result.effectivePollution, 50);
    assert.equal(result.floodRisk, 18);
});

test('higher drainage and green coverage reduce simulated flood risk', () => {
    const poor = calculateEnvironmentalConsequences({
        stats: { ...baseStats, rainfall: 75 },
        placedItems: [{ type: 'apartment' }, { type: 'factory' }]
    });

    const improved = calculateEnvironmentalConsequences({
        stats: {
            ...baseStats,
            rainfall: 75,
            green: 65,
            drainage: 90
        },
        placedItems: [
            { type: 'apartment' },
            { type: 'factory' },
            { type: 'oak' },
            { type: 'pine' }
        ]
    });

    assert.ok(improved.floodRisk < poor.floodRisk);
});

test('historical susceptibility modifier adjusts the game risk', () => {
    const local = calculateEnvironmentalConsequences({
        stats: { ...baseStats, rainfall: 50 },
        placedItems: []
    });

    const adjusted = calculateEnvironmentalConsequences({
        stats: { ...baseStats, rainfall: 50 },
        placedItems: [],
        selectedMLArea: {
            mean_score: 1,
            high_very_high_pct: 100
        }
    });

    assert.equal(adjusted.susceptibilityMultiplier, 1.5);
    assert.equal(adjusted.floodRisk, Math.min(100, Math.round(local.localRisk * 1.5)));
});

test('derived indicators are clamped to their valid ranges', () => {
    const result = calculateEnvironmentalConsequences({
        stats: {
            pollution: 99,
            green: 100,
            rainfall: 100,
            drainage: 0
        },
        placedItems: Array.from({ length: 20 }, () => ({ type: 'factory' }))
    });

    assert.equal(result.effectivePollution, 100);
    assert.ok(result.floodRisk >= 0 && result.floodRisk <= 100);
    assert.ok(result.runoffPressure >= 0 && result.runoffPressure <= 100);
});
