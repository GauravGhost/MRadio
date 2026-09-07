import channelManager from "../lib/channelManager.js";
import { generate256BitToken } from "../utils/crypto.js";
import SongQueueManager from "../utils/queue/songQueueManager.js";
import TokenManager from "../utils/queue/tokenManager.js";
import BlockListManager from "../utils/queue/blockListManager.js";
import { generatePlaylistMetadata, generateSongMetadata } from "./metadataFetcherService.js";
import { durationFormatter } from "../utils/utils.js";
import logger from "../utils/logger.js";
import { DEFAULT_QUEUE_SIZE } from "../utils/constant.js";
import Yts from "../lib/yts.js";
import DefaultPlaylistMetadataManager from "../utils/queue/defaultPlaylistMetadataManager.js";
import DefaultPlaylistManager from "../utils/queue/defaultPlaylistManager.js";

class Service {
    constructor() {
        this.blockListManager = new BlockListManager();
    }

    /**
    * ==========================================
    * Channel Management Services
    * ==========================================
    */

    async getAllChannels() {
        return channelManager.getAllChannels();
    }

    async createChannel(data) {
        return channelManager.createChannel(data);
    }

    async deleteChannel(id) {
        return channelManager.deleteChannel(id);
    }

    /**
    * ==========================================
    * Songs Related Services (Multi-Channel Capable)
    * ==========================================
    */

    async getCurrentSong(channelId = 'default') {
        const ch = channelManager.getChannel(channelId);
        if (!ch.currentTrack) {
            return { title: "No Track Playing", duration: "00:00", requestedBy: "system" };
        }
        const { title, duration, requestedBy } = ch.currentTrack;
        const formattedDuration = durationFormatter(duration);
        return { title, duration: formattedDuration, requestedBy };
    }

    async seekSong(seconds, channelId = 'default') {
        const ch = channelManager.getChannel(channelId);
        await ch.seek(seconds);
        return true;
    }

    async getQueueList(channelId = 'default') {
        const ch = channelManager.getChannel(channelId);
        const songQueue = new SongQueueManager();
        const trackList = ch.tracks;
        const queueSongList = songQueue.printQueue();

        const response = [...trackList, ...queueSongList].map((item, index) => {
            const formattedDuration = durationFormatter(item?.duration);
            return {
                id: index + 1,
                title: item.title,
                duration: formattedDuration,
                requestedBy: item.requestedBy
            };
        });
        return response;
    }

    async getUpcomingSong(channelId = 'default') {
        const ch = channelManager.getChannel(channelId);
        if (ch.tracks.length <= 1) {
            return { title: "None", duration: "00:00", requestedBy: "system" };
        }
        const { title, duration, requestedBy } = ch.tracks[(ch.index + 1) % ch.tracks.length];
        const formattedDuration = durationFormatter(duration);
        return { title, duration: formattedDuration, requestedBy };
    }

    async skip(channelId = 'default') {
        const ch = channelManager.getChannel(channelId);
        await ch.skip();
        return true;
    }

    async previous(channelId = 'default') {
        const ch = channelManager.getChannel(channelId);
        await ch.previous();
        return true;
    }

    async addSongToQueue({ songName, requestedBy = "anonymous", force, preference, channelId = 'default' }) {
        const metadata = await generateSongMetadata(songName, requestedBy, force, preference);
        const isBlocked = await this.isSongBlocked(metadata.title);
        if (isBlocked) {
            throw new Error("Song is blocked! You cannot play this song.");
        }
        const songQueue = new SongQueueManager();
        songQueue.addToQueue(metadata);
        return { title: metadata.title, duration: metadata.duration, requestedBy };
    }

    async addPlaylistToQueue({ source = "youtube", type = "playlist", playlistId, requestedBy = "anonymous", channelId = 'default' }) {
        const metadata = await generatePlaylistMetadata(playlistId, source, requestedBy);
        if (metadata.length <= 0) {
            throw new Error("No songs found in the playlist.");
        }
        const songQueue = new SongQueueManager();
        songQueue.addManyToQueue(metadata);
        return { added: true, total: metadata.length };
    }

    async addPlaylistToTop({ source = "youtube", type = "playlist", playlistId, requestedBy = "anonymous", channelId = 'default' }) {
        const metadata = await generatePlaylistMetadata(playlistId, source, requestedBy);
        if (metadata.length <= 0) {
            throw new Error("No songs found in the playlist.");
        }
        const songQueue = new SongQueueManager();
        songQueue.addManyToTop(metadata);
        return { added: true, total: metadata.length };
    }

    async addSongToTop({ songName, requestedBy = "anonymous", channelId = 'default' }) {
        const metadata = await generateSongMetadata(songName, requestedBy);
        const isBlocked = await this.isSongBlocked(metadata.title);
        if (isBlocked) {
            throw new Error("Song is blocked! You cannot play this song.");
        }
        const songQueue = new SongQueueManager();
        songQueue.addToFront(metadata);
        return { title: metadata.title, duration: metadata.duration, requestedBy };
    }

    async removeFromQueue({ index }) {
        if (index <= DEFAULT_QUEUE_SIZE) {
            throw new Error(`Cannot remove songs from positions 1 to ${DEFAULT_QUEUE_SIZE}`);
        }
        const songQueue = new SongQueueManager();
        const removedItem = songQueue.removeAtIndex(index - DEFAULT_QUEUE_SIZE);
        if (!removedItem) {
            throw new Error("Invalid index or queue is empty.");
        }
        return { title: removedItem.title, duration: removedItem.duration, requestedBy: removedItem.requestedBy };
    }

    async removeLastSongRequestedByUser({ requestedBy }) {
        if (!requestedBy) {
            throw new Error("Username is required");
        }
        const songQueue = new SongQueueManager();
        const removedItem = songQueue.removeLastSongRequestedByUser(requestedBy);
        
        if (!removedItem) {
            throw new Error(`No songs found in queue for User: @${requestedBy}`);
        }
        
        return { title: removedItem.title, duration: removedItem.duration, requestedBy: removedItem.requestedBy };
    }

    /**
     * ==========================================
     * Admin Related Services
     * ==========================================
     */
    async generateToken(username) {
        const token = generate256BitToken();
        const tokenManager = new TokenManager();
        tokenManager.addToken({ token, username });
        return { token, username };
    }

    /**
     * ==========================================
     * Block List Services
     * ==========================================
     */
    async blockCurrentSong(requestedBy = "anonymous", channelId = 'default') {
        try {
            const songDetail = await this.getCurrentSong(channelId);
            return await this.blockListManager.blockCurrentSong(songDetail.title, requestedBy);
        } catch (error) {
            logger.error("Error in blockCurrentSong service:", { error });
            throw error;
        }
    }

    async blockSongBySongName(songName, requestedBy) {
        try {
            return await this.blockListManager.blockSongBySongName(songName, requestedBy);
        } catch (error) {
            logger.error("Error in blockSongBySongName service:", { error });
            throw error;
        }
    }

    async unblockSongBySongName(songName) {
        try {
            return await this.blockListManager.unblockSongBySongName(songName);
        } catch (error) {
            logger.error("Error in unblockSongBySongName service:", { error });
            throw error;
        }
    }

    async unblockSongByIndex(index) {
        try {
            return await this.blockListManager.unblockSongByIndex(index);
        } catch (error) {
            logger.error("Error in unblockSongByIndex service:", { error });
            throw error;
        }
    }

    async clearBlockList() {
        try {
            return await this.blockListManager.clearBlockList();
        } catch (error) {
            logger.error("Error in clearBlockList service:", { error });
            throw error;
        }
    }

    async getAllBlockList() {
        try {
            return await this.blockListManager.getAllBlockList();
        } catch (error) {
            logger.error("Error in getAllBlockList service:", { error });
            return [];
        }
    }

    async isSongBlocked(songName) {
        try {
            return this.blockListManager.isSongBlocked(songName);
        } catch (error) {
            logger.error("Error in isSongBlocked service:", { error });
            return false;
        }
    }

    /**
    * ==========================================
    * Default Playlist Manager Service
    * ==========================================
    */
    async addDefaultPlaylist({ playlistId, title, source, requestedBy = "auto", isActive = true, genre = "mix" }) {
        try {
            const metadata = await generatePlaylistMetadata(playlistId, source, requestedBy);
            if (metadata.length <= 0) {
                throw new Error("No songs found in the playlist.");
            }
            const defaultPlaylistStore = new DefaultPlaylistManager();
            defaultPlaylistStore.add({
                playlistId,
                title,
                source,
                metadataUpdatedAt: new Date(),
                isActive: isActive,
                genre: genre
            });
            const metadataStore = new DefaultPlaylistMetadataManager();
            const updatedMetadata = metadata.map(data => ({ ...data, playlistId: playlistId }));
            metadataStore.addMany(updatedMetadata);
            return { added: true, total: metadata.length };
        } catch (error) {
            logger.error("Error in addDefaultPlaylist service:", { error });
            throw error;
        }
    }

    async removeDefaultPlaylist({ index }) {
        const defaultPlaylistStore = new DefaultPlaylistManager();
        const defaultPlaylistMetadataStore = new DefaultPlaylistMetadataManager();
        
        const len = defaultPlaylistStore.getLength();
        if (len <= 1) {
            throw new Error("Cannot remove default playlist. There should be at least one playlist.");
        }
        
        const removedPlaylist = defaultPlaylistStore.removeAtIndex(index);
        if (!removedPlaylist) {
            throw new Error("Failed to remove playlist");
        }

        const allMetadataEntries = defaultPlaylistMetadataStore.getAll();
        
        const indexesToRemove = allMetadataEntries
            .map((entry, idx) => entry.playlistId === removedPlaylist.playlistId ? idx + 1 : null)
            .filter(idx => idx !== null)
            .sort((a, b) => b - a);
        
        for (const idx of indexesToRemove) {
            defaultPlaylistMetadataStore.removeAtIndex(idx);
        }

        return removedPlaylist;
    }

    async getDefaultPlaylist() {
        const defaultPlaylistStore = new DefaultPlaylistManager();
        return defaultPlaylistStore.getAll();
    }

    async updatePlaylistStatus({ index, isActive }) {
        const defaultPlaylistStore = new DefaultPlaylistManager();
        const allPlaylists = defaultPlaylistStore.getAll();
        
        const actualIndex = index - 1;
        
        if (actualIndex < 0 || actualIndex >= allPlaylists.length) {
            throw new Error("Invalid playlist index");
        }

        if (!isActive) {
            const activePlaylistCount = allPlaylists.filter((playlist, idx) => 
                idx !== actualIndex && playlist.isActive
            ).length;
            
            if (activePlaylistCount === 0) {
                throw new Error("Cannot deactivate playlist: At least one playlist must remain active");
            }
        }

        const updatedPlaylist = {
            ...allPlaylists[actualIndex],
            isActive: isActive
        };

        defaultPlaylistStore.removeAtIndex(index);
        defaultPlaylistStore.add(updatedPlaylist);

        return updatedPlaylist;
    }
}

export default Service;
