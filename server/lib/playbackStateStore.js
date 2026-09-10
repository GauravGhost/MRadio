import fs from "node:fs";
import path from "node:path";
import logger from "../utils/logger.js";
import fsHelper from "../utils/helper/fs-helper.js";
import { PLAYBACK_STATE_LOCATION } from "../utils/constant.js";

/**
 * Persists per-channel playback sessions so a restarted process can resume
 */
class PlaybackStateStore {
    constructor(baseDir = PLAYBACK_STATE_LOCATION) {
        this.baseDir = path.join(process.cwd(), baseDir);
    }

    getFilePath(channelId = "default") {
        const safeId = String(channelId).replace(/[^a-zA-Z0-9_-]/g, "") || "default";
        return path.join(this.baseDir, `${safeId}.json`);
    }

    read(channelId = "default") {
        try {
            const filePath = this.getFilePath(channelId);
            if (!fsHelper.exists(filePath)) return null;

            const raw = fs.readFileSync(filePath, "utf8");
            if (!raw.trim()) return null;

            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (error) {
            logger.warn(`[PlaybackStateStore] Ignoring unreadable state for channel "${channelId}": ${error.message}`);
            return null;
        }
    }

    write(channelId = "default", state) {
        try {
            if (!fsHelper.exists(this.baseDir)) {
                fsHelper.createDirectory(this.baseDir);
            }

            const filePath = this.getFilePath(channelId);
            const tempPath = `${filePath}.tmp`;

            fs.writeFileSync(tempPath, JSON.stringify(state), "utf8");
            fs.renameSync(tempPath, filePath);
            return true;
        } catch (error) {
            logger.error(`[PlaybackStateStore] Failed to persist state for channel "${channelId}": ${error.message}`);
            return false;
        }
    }

    clear(channelId = "default") {
        try {
            const filePath = this.getFilePath(channelId);
            if (fsHelper.exists(filePath)) {
                fs.unlinkSync(filePath);
            }
            return true;
        } catch (error) {
            logger.error(`[PlaybackStateStore] Failed to clear state for channel "${channelId}": ${error.message}`);
            return false;
        }
    }
}

const playbackStateStore = new PlaybackStateStore();
export default playbackStateStore;
