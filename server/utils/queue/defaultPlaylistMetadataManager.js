import { durationFormatter, getDefaultPlaylistMetadataJson, saveDefaultPlaylistMetadataJson, getDefaultPlaylistJson } from "../utils.js";
import BaseQueueManager from "./baseQueueManager.js";

class DefaultPlaylistMetadataManager extends BaseQueueManager {
    constructor() {
        super({
            readFunction: () => {
                const queue = getDefaultPlaylistMetadataJson();
                return queue.map(item => ({
                    ...item,
                    duration: item.duration ? durationFormatter(item.duration) : "00:00"
                }));
            },
            saveFunction: (items) => saveDefaultPlaylistMetadataJson(items),
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

    getFilteredData(filters = {}) {
        const allData = super.getAll();
        if (!Object.keys(filters).length) return allData;

        const needsPlaylist = filters.isActive !== undefined || filters.genre || filters.channelId !== undefined;

        return allData.filter(item => {
            let matches = true;

            // Filter by song metadata
            if (filters.urlType && item.urlType !== filters.urlType) matches = false;
            if (filters.playlistId && item.playlistId !== filters.playlistId) matches = false;

            // Filter by playlist metadata - requires checking against playlist data
            if (needsPlaylist) {
                const playlist = this.getPlaylistMetadata(item.playlistId);

                if (playlist) {
                    if (filters.isActive !== undefined && playlist.isActive !== filters.isActive) matches = false;
                    if (filters.genre && playlist.genre !== filters.genre) matches = false;
                    // channelId null/undefined means the global pool
                    if (filters.channelId !== undefined && (playlist.channelId ?? null) !== (filters.channelId ?? null)) matches = false;
                } else {
                    matches = false;
                }
            }
            return matches;
        });
    }

    getPlaylistMetadata(playlistId) {
        try {
            const playlists = getDefaultPlaylistJson();
            return playlists.find(p => p.playlistId === playlistId);
        } catch (error) {
            console.error('Error getting playlist metadata:', error);
            return null;
        }
    }

    getAll(filters = {}) {

        const res = this.getFilteredData(filters);
         return res;
    }

    addManyToQueue(items) {
        return this.addMany(items, false);
    }

    addManyToTop(items) {
        return this.addMany(items, true);
    }
}

export default DefaultPlaylistMetadataManager;
