import test from "node:test";
import assert from "node:assert/strict";

import {
    applyBuildEffects,
    getCitySustainabilityScore
} from "../src/city-economy.js";

const baseline = {
    green: 40,
    happiness: 60,
    pollution: 30,
    energy: 50,
    waste: 20,
    effectiveGreen: 40,
    effectivePollution: 30
};

test("solar panels improve energy and reduce pollution", () => {
    const next = applyBuildEffects(baseline, {
        green: 2,
        happiness: 1,
        pollution: -3,
        energy: 8,
        waste: 0
    });

    assert.equal(next.energy, 58);
    assert.equal(next.pollution, 27);
    assert.equal(next.green, 42);
});

test("factories consume energy and generate pollution and waste", () => {
    const next = applyBuildEffects(baseline, {
        green: 0,
        happiness: -3,
        pollution: 8,
        energy: -5,
        waste: 4
    });

    assert.equal(next.energy, 45);
    assert.equal(next.pollution, 38);
    assert.equal(next.waste, 24);
    assert.equal(next.happiness, 57);
});

test("removing a build reverses its resource effects", () => {
    const build = {
        green: 0,
        happiness: -3,
        pollution: 8,
        energy: -5,
        waste: 4
    };

    const placed = applyBuildEffects(baseline, build, 1);
    const removed = applyBuildEffects(placed, build, -1);

    assert.equal(removed.green, baseline.green);
    assert.equal(removed.happiness, baseline.happiness);
    assert.equal(removed.pollution, baseline.pollution);
    assert.equal(removed.energy, baseline.energy);
    assert.equal(removed.waste, baseline.waste);
});

test("resource indicators stay between zero and one hundred", () => {
    const next = applyBuildEffects(
        { ...baseline, energy: 98, waste: 99, pollution: 98 },
        { energy: 8, waste: 4, pollution: 8 }
    );

    assert.equal(next.energy, 100);
    assert.equal(next.waste, 100);
    assert.equal(next.pollution, 100);
});

test("sustainability score rewards effective greenery and clean energy", () => {
    const good = getCitySustainabilityScore({
        ...baseline,
        effectiveGreen: 80,
        effectivePollution: 15,
        energy: 90,
        waste: 10
    });

    const poor = getCitySustainabilityScore({
        ...baseline,
        effectiveGreen: 25,
        effectivePollution: 75,
        energy: 20,
        waste: 80
    });

    assert.ok(good > poor);
});

test("invalid resource effect direction is rejected", () => {
    assert.throws(
        () => applyBuildEffects(baseline, {}, 0),
        /direction must be 1 or -1/
    );
});
