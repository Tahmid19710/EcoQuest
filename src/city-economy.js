const clamp = (value, min = 0, max = 100) =>
    Math.max(min, Math.min(max, Number(value) || 0));

/**
 * Apply the same construction effects when an object is placed (+1)
 * or removed (-1). Credits/refunds are intentionally handled by the
 * game controller, not this environmental resource helper.
 */
export function applyBuildEffects(stats, build, direction = 1) {
    if (direction !== 1 && direction !== -1) {
        throw new Error("Build effect direction must be 1 or -1.");
    }

    return {
        ...stats,
        green: clamp(stats.green + direction * (build.green || 0)),
        happiness: clamp(stats.happiness + direction * (build.happiness || 0)),
        pollution: clamp(stats.pollution + direction * (build.pollution || 0)),
        energy: clamp(stats.energy + direction * (build.energy || 0)),
        waste: clamp(stats.waste + direction * (build.waste || 0))
    };
}

/**
 * A transparent educational game score. Higher green, happiness and
 * energy improve the score; higher effective pollution and waste lower it.
 * It is a game-balance indicator, not a validated sustainability index.
 */
export function getCitySustainabilityScore(stats) {
    const green = stats.effectiveGreen ?? stats.green;
    const pollution = stats.effectivePollution ?? stats.pollution;

    return (
        Number(green || 0) +
        Number(stats.happiness || 0) +
        (100 - Number(pollution || 0)) +
        Number(stats.energy || 0) +
        (100 - Number(stats.waste || 0))
    ) / 5;
}
