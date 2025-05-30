import { getQueueListJson, saveQueueListJson, durationFormatter } from "../utils.js";
import BaseQueueManager from "./baseQueueManager.js";

class SongQueueManager extends BaseQueueManager {
    constructor() {
        super({
            readFunction: () => {
                const queue = getQueueListJson();
                return queue.map(item => ({
                    ...item,
                    duration: item.duration ? durationFormatter(item.duration) : "00:00"
                }));
            },
            saveFunction: (items) => saveQueueListJson(items),
            validateFunction: (item) => {
                return typeof item === "object" && item.title && item.url;
            },
            formatFunction: (item) => ({
                ...item,
                duration: item.duration ? durationFormatter(item.duration) : "00:00"
            }),
            duplicateCheckKey: "url"
        });
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
            return this.removeAtIndex(actualIndex + 1); // +1 because removeAtIndex expects 1-based index
        }
        return null;
    }
}

export default SongQueueManager;
