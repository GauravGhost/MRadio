import { getQueueListJson, saveQueueListJson, durationFormatter } from "../utils.js";
import BaseQueueManager from "./baseQueueManager.js";
import logger from "../logger.js";
import { DEFAULT_CHANNEL_ID } from "../constant.js";


class SongQueueManager extends BaseQueueManager {
    constructor(channelId = DEFAULT_CHANNEL_ID) {
        super({
            readFunction: () => {
                const queue = getQueueListJson();
                return queue.map(item => ({
                    ...item,
                    duration: item.duration ? durationFormatter(item.duration) : "00:00"
                }));
            },
            validateFunction: (item) => {
                return typeof item === "object" && item.title && item.url;
            },
            formatFunction: (item) => ({
                ...item,
                duration: item.duration ? durationFormatter(item.duration) : "00:00"
            }),
            duplicateCheckKey: "url"
        });

        this.channelId = channelId;
        // Scope the inherited in-memory view to this channel only.
        this.items = this.items.filter(item => item.channelId === this.channelId);
    }

    // Merge this channel's items back into the shared file, preserving all other channels' entries.
    saveItems() {
        try {
            const others = getQueueListJson().filter(item => item.channelId !== this.channelId);
            const mine = this.items.map(item => ({ ...item, channelId: this.channelId }));
            saveQueueListJson([...others, ...mine]);
        } catch (error) {
            logger.error("Error saving queue items:", { message: error.message, stack: error.stack });
        }
    }

    // Alias methods to match existing API
    addToQueue(item) {
        return this.add(item);
    }

    getFirstFromQueue() {
        return this.getFirst();
    }

    getLastFromQueue() {
        return this.getLast();
    }

    printQueue() {
        return this.getAll();
    }

    addManyToQueue(items) {
        return this.addMany(items, false);
    }

    addManyToTop(items) {
        return this.addMany(items, true);
    }

    // Additional song-specific methods can be added here
    removeLastSongRequestedByUser(requestedBy) {
        const index = [...this.items].reverse().findIndex(item => item.requestedBy === requestedBy);
        if (index !== -1) {
            const actualIndex = this.items.length - 1 - index;
            return this.removeAtIndex(actualIndex + 1); // +1 because removeAtIndex is 1-based
        }
        return null;
    }
}

export default SongQueueManager;
