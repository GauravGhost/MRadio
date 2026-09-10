/**
 * Logic for resuming playback after a restart.
 */

export const RESUME_FRESH_REASONS = {
    NOT_PLAYING: "not-playing",
    NO_TIMING: "no-timing",
    GAP_TOO_LONG: "gap-too-long",
    INVALID_INDEX: "invalid-index",
    CURRENT_UNAVAILABLE: "current-unavailable",
    UNAVAILABLE: "unavailable",
    PASSED_BUFFER_END: "passed-buffer-end",
};

export const durationToSeconds = (duration) => {
    if (typeof duration === "number") {
        return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0;
    }

    if (typeof duration !== "string" || !duration.includes(":")) {
        return 0;
    }

    const parts = duration.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) {
        return 0;
    }

    return parts.reduce((total, part) => total * 60 + part, 0);
};

/**
 * Decide whether a persisted session can be resumed, and where to resume it.
 *
 * @param {object} state Persisted playback state.
 * @param {object} options
 * @param {number} options.now Current epoch ms.
 * @param {number} options.maxGapMs Downtime beyond which a fresh session starts.
 * @param {number} options.minRemainingSeconds Skip a track that is this close to finishing.
 * @param {Array<{track: object, durationSeconds: number, available: boolean}>} options.tracks
 *        Restorable buffer, honouring state.index.
 * @returns {{action: 'resume', index: number, seekSeconds: number, skipped: number}
 *          | {action: 'fresh', reason: string}}
 */
export function decideResume(state, options = {}) {
    const {
        now = Date.now(),
        maxGapMs = 0,
        minRemainingSeconds = 5,
        tracks = [],
    } = options;

    if (!state || state.playing !== true) {
        return { action: "fresh", reason: RESUME_FRESH_REASONS.NOT_PLAYING };
    }

    if (!Number.isFinite(state.savedAt) || !Number.isFinite(state.startTime)) {
        return { action: "fresh", reason: RESUME_FRESH_REASONS.NO_TIMING };
    }

    const gapMs = now - state.savedAt;
    if (gapMs > maxGapMs) {
        return { action: "fresh", reason: RESUME_FRESH_REASONS.GAP_TOO_LONG };
    }

    const startIndex = Number.isInteger(state.index) ? state.index : 0;
    if (startIndex < 0 || startIndex >= tracks.length) {
        return { action: "fresh", reason: RESUME_FRESH_REASONS.INVALID_INDEX };
    }
    if (!tracks[startIndex]?.available) {
        return { action: "fresh", reason: RESUME_FRESH_REASONS.CURRENT_UNAVAILABLE };
    }

    let elapsed = Math.max(0, state.savedAt - state.startTime) / 1000;
    elapsed += Math.max(0, gapMs) / 1000;

    let index = startIndex;
    while (true) {
        const { durationSeconds = 0 } = tracks[index] || {};

        if (durationSeconds <= 0 || elapsed < durationSeconds - minRemainingSeconds) {
            break;
        }

        elapsed -= durationSeconds;
        index += 1;

        if (index >= tracks.length) {
            return { action: "fresh", reason: RESUME_FRESH_REASONS.PASSED_BUFFER_END };
        }
        if (!tracks[index].available) {
            return { action: "fresh", reason: RESUME_FRESH_REASONS.UNAVAILABLE };
        }
    }

    return {
        action: "resume",
        index,
        seekSeconds: Math.max(0, Math.floor(elapsed)),
        skipped: index - startIndex,
    };
}
