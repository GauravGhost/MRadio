import { getDefaultPlaylistJson, saveDefaultPlaylistJson } from "../utils.js";
import BaseQueueManager from "./baseQueueManager.js";

class DefaultPlaylistManager extends BaseQueueManager {
    constructor() {
        super({
            readFunction: getDefaultPlaylistJson,
            saveFunction: saveDefaultPlaylistJson,
            validateFunction: (item) => {
                return typeof item === "object" && item.title && item.playlistId && item.source;
            },
            formatFunction: (item) => ({
                ...item,
                metadataUpdatedAt: item.metadataUpdatedAt || new Date().toISOString()
            })
        });
    }

    // A playlist is only a duplicate within the same scope (global pool or a single channel).
    isDuplicate(item) {
        return this.items.some(existing =>
            existing.playlistId === item.playlistId &&
            (existing.channelId ?? null) === (item.channelId ?? null)
        );
    }
}

export default DefaultPlaylistManager;