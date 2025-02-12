import logger from "../logger.js";
import { getQueueListJson, saveQueueListJson, durationFormatter } from "../utils.js";

class SongQueueManager {
    constructor() {
        this.queue = this.readSongQueue() || [];
    }

    readSongQueue() {
        const queue = getQueueListJson();
        // Format durations when loading from JSON
        return queue.map(item => ({
            ...item,
            duration: item.duration ? durationFormatter(item.duration) : "00:00"
        }));
    }

    saveSongQueue() {
        saveQueueListJson(this.queue);
    }

    isDuplicate(url) {
        return this.queue.some(item => item.url === url);
    }

    addToQueue(item) {
        if (typeof item === "object" && item.title && item.url) {
            if (this.isDuplicate(item.url)) {
                console.warn(`Duplicate item not added: ${item.url}`);
            } else {
                // Format duration before adding to queue
                const formattedItem = {
                    ...item,
                    duration: item.duration ? durationFormatter(item.duration) : "00:00"
                };
                this.queue.push(formattedItem);
                this.saveSongQueue();
            }
        } else {
            console.error("Invalid input. Item must be an object with 'title' and 'url'.");
        }
    }


    getFirstFromQueue() {
        if (this.queue.length > 0) {
            return this.queue[0];
        } else {
            logger.info("Queue is empty!")
        }

    }

    getLastFromQueue() {
        if (this.queue.length > 0) {
            return this.queue[this.queue.length - 1];
        } else {
            logger.info("Queue is empty!")
        }
    }

    addToFront(item) {
        if (typeof item === "object" && item.title && item.url) {
            if (this.isDuplicate(item.url)) {
                console.warn(`Duplicate item not added: ${item.url}`);
            } else {
                // Format duration before adding to queue
                const formattedItem = {
                    ...item,
                    duration: item.duration ? durationFormatter(item.duration) : "00:00"
                };
                this.queue.unshift(formattedItem);
                this.saveSongQueue();
            }
        } else {
            console.error("Invalid input. Item must be an object with 'title' and 'url'.");
        }
    }

    removeFromFront() {
        if (this.queue.length > 0) {
            const removedItem = this.queue.shift();
            this.saveSongQueue();
            return removedItem;
        } else {
            console.error("Queue is empty.");
        }
    }

    removeFromBack() {
        if (this.queue.length > 0) {
            const removedItem = this.queue.pop();
            this.saveSongQueue();
            return removedItem;
        } else {
            console.error("Queue is empty.");
        }
    }

    removeAtIndex(index) {
        index = index - 1;
        if (index >= 0 && index < this.queue.length) {
            const removedItem = this.queue.splice(index, 1)[0];
            this.saveSongQueue();
            return removedItem;
        } else {
            console.error("Invalid index or queue is empty.");
            return null;
        }
    }

    printQueue() {
        return this.queue;
    }

    addManyToQueue(items) {
        if (!Array.isArray(items)) {
            console.error("Invalid input. Items must be an array of objects.");
            return;
        }

        let addedCount = 0;
        items.forEach(item => {
            if (typeof item === "object" && item.title && item.url) {
                if (this.isDuplicate(item.url)) {
                    console.warn(`Duplicate item not added: ${item.url}`);
                } else {
                    const formattedItem = {
                        ...item,
                        duration: item.duration ? durationFormatter(item.duration) : "00:00"
                    };
                    this.queue.push(formattedItem);
                    addedCount++;
                }
            } else {
                console.error("Invalid item skipped. Item must be an object with 'title' and 'url'.");
            }
        });

        if (addedCount > 0) {
            this.saveSongQueue();
        }
        return addedCount;
    }

    addManyToTop(items) {
        if (!Array.isArray(items)) {
            console.error("Invalid input. Items must be an array of objects.");
            return;
        }

        let addedCount = 0;
        const validItems = [];
        items.forEach(item => {
            if (typeof item === "object" && item.title && item.url) {
                if (this.isDuplicate(item.url)) {
                    console.warn(`Duplicate item not added: ${item.url}`);
                } else {
                    const formattedItem = {
                        ...item,
                        duration: item.duration ? durationFormatter(item.duration) : "00:00"
                    };
                    validItems.unshift(formattedItem);
                    addedCount++;
                }
            } else {
                console.error("Invalid item skipped. Item must be an object with 'title' and 'url'.");
            }
        });

        if (addedCount > 0) {
            this.queue.unshift(...validItems);
            this.saveSongQueue();
        }
        return addedCount;
    }
}

export default SongQueueManager;
