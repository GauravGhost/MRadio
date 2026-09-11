import channelManager from "../lib/channelManager.js";
import { generate256BitToken } from "../utils/crypto.js";
import SongQueueManager from "../utils/queue/songQueueManager.js";
import TokenManager from "../utils/queue/tokenManager.js";
import BlockListManager from "../utils/queue/blockListManager.js";
import { generatePlaylistMetadata, generateSongMetadata } from "./metadataFetcherService.js";
import { durationFormatter } from "../utils/utils.js";
import logger from "../utils/logger.js";
import { DEFAULT_TOKEN_ROLE, TOKEN_ROLES } from "../utils/constant.js";
import DefaultPlaylistMetadataManager from "../utils/queue/defaultPlaylistMetadataManager.js";
import DefaultPlaylistManager from "../utils/queue/defaultPlaylistManager.js";

const playlistNotFoundError = () => {
    const error = new Error("Playlist not found");
    error.statusCode = 404;
    return error;
};

const playlistScopeError = (channelId) => {
    const error = new Error(channelId
        ? `Forbidden: playlist does not belong to channel '${channelId}'`
        : "Forbidden: playlist is not part of the global pool");
    error.statusCode = 403;
    return error;
};

class Service {
    constructor() {
        this.blockListManager = new BlockListManager();
    }

    resolveChannel(channelId) {
        const channel = channelManager.getChannel(channelId);
        if (!channel) {
            throw new Error(`Channel '${channelId}' not found`);
        }
        return channel;
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

    async updateChannel(id, { name, genre }) {
        return channelManager.updateChannel(id, { name, genre });
    }

    async restartChannel(id) {
        return channelManager.restartChannel(id);
    }

    /**
     * ==========================================
     * Playback & Track Services (Multi-Channel Capable)
     * ==========================================
     */

    async getCurrentSong(channelId) {
        const ch = this.resolveChannel(channelId);
        if (!ch.currentTrack) {
            return { channelId: ch.id, title: "No Track Playing", duration: "00:00", requestedBy: "system" };
        }
        const { title, duration, requestedBy } = ch.currentTrack;
        const formattedDuration = durationFormatter(duration);
        return { channelId: ch.id, title, duration: formattedDuration, requestedBy };
    }

    async getUpcomingSong(channelId) {
        const ch = this.resolveChannel(channelId);
        if (ch.tracks.length <= 1) {
            return { channelId: ch.id, title: "None", duration: "00:00", requestedBy: "system" };
        }
        const { title, duration, requestedBy } = ch.tracks[(ch.index + 1) % ch.tracks.length];
        const formattedDuration = durationFormatter(duration);
        return { channelId: ch.id, title, duration: formattedDuration, requestedBy };
    }

    async seekSong(seconds, channelId) {
        const ch = this.resolveChannel(channelId);
        await ch.seek(seconds);
        return true;
    }

    async skip(channelId) {
        const ch = this.resolveChannel(channelId);
        await ch.skip();
        return true;
    }

    async previous(channelId) {
        const ch = this.resolveChannel(channelId);
        await ch.previous();
        return true;
    }

    async pauseSong(channelId) {
        const ch = this.resolveChannel(channelId);
        ch.pause();
        return ch.getStatus();
    }

    async resumeSong(channelId) {
        const ch = this.resolveChannel(channelId);
        ch.resume();
        return ch.getStatus();
    }

    /**
     * ==========================================
     * Queue Management Services
     * ==========================================
     */

    async getQueueList(channelId) {
        const ch = this.resolveChannel(channelId);
        const songQueue = new SongQueueManager(channelId);
        const trackList = ch.tracks;
        const queueSongList = songQueue.printQueue();

        return [...trackList, ...queueSongList].map((item, index) => {
            const formattedDuration = durationFormatter(item?.duration);
            return {
                id: index + 1,
                title: item.title,
                duration: formattedDuration,
                requestedBy: item.requestedBy || "anonymous",
                source: item.urlType || "Unknown"
            };
        });
    }

    async addSongToQueue({ songName, requestedBy = "anonymous", force, preference, channelId }) {
        const metadata = await generateSongMetadata(songName, requestedBy, force, preference);
        const isBlocked = await this.isSongBlocked(metadata.title);
        if (isBlocked) {
            throw new Error("Song is blocked! You cannot play this song.");
        }
        const songQueue = new SongQueueManager(channelId);
        songQueue.addToQueue(metadata);
        
        const ch = this.resolveChannel(channelId);
        ch.clearSystemTracksFromBuffer();
        
        return { channelId, title: metadata.title, duration: metadata.duration, requestedBy };
    }

    async addSongToTop({ songName, requestedBy = "anonymous", force, preference, channelId }) {
        const metadata = await generateSongMetadata(songName, requestedBy, force, preference);
        const isBlocked = await this.isSongBlocked(metadata.title);
        if (isBlocked) {
            throw new Error("Song is blocked! You cannot play this song.");
        }
        const songQueue = new SongQueueManager(channelId);
        songQueue.addToFront(metadata);

        const ch = this.resolveChannel(channelId);
        ch.clearSystemTracksFromBuffer();
        
        return { channelId, title: metadata.title, duration: metadata.duration, requestedBy };
    }

    async addPlaylistToQueue({ source = "youtube", type = "playlist", playlistId, requestedBy = "anonymous", channelId }) {
        const metadata = await generatePlaylistMetadata(playlistId, source, requestedBy);
        if (metadata.length <= 0) {
            throw new Error("No songs found in the playlist.");
        }
        const songQueue = new SongQueueManager(channelId);
        songQueue.addManyToQueue(metadata);
        
        const ch = this.resolveChannel(channelId);
        ch.clearSystemTracksFromBuffer();
        
        return { channelId, added: true, total: metadata.length };
    }

    async addPlaylistToTop({ source = "youtube", type = "playlist", playlistId, requestedBy = "anonymous", channelId }) {
        const metadata = await generatePlaylistMetadata(playlistId, source, requestedBy);
        if (metadata.length <= 0) {
            throw new Error("No songs found in the playlist.");
        }
        const songQueue = new SongQueueManager(channelId);
        songQueue.addManyToTop(metadata);
        
        const ch = this.resolveChannel(channelId);
        ch.clearSystemTracksFromBuffer();
        
        return { channelId, added: true, total: metadata.length };
    }

    async removeFromQueue({ index, channelId }) {
        const ch = this.resolveChannel(channelId);
        const trackList = ch.tracks || [];
        if (index <= trackList.length) {
            throw new Error(`Cannot remove actively buffered track #${index}. Use skip to advance.`);
        }
        const songQueue = new SongQueueManager(channelId);
        const removedItem = songQueue.removeAtIndex(index - trackList.length);
        if (!removedItem) {
            throw new Error("Invalid index or queue is empty.");
        }
        return { channelId, title: removedItem.title, duration: removedItem.duration, requestedBy: removedItem.requestedBy };
    }

    async removeLastSongRequestedByUser({ requestedBy, channelId }) {
        if (!requestedBy) {
            throw new Error("Username is required");
        }
        const songQueue = new SongQueueManager(channelId);
        const removedItem = songQueue.removeLastSongRequestedByUser(requestedBy);
        
        if (!removedItem) {
            throw new Error(`No songs found in queue for User: @${requestedBy}`);
        }
        
        return { channelId, title: removedItem.title, duration: removedItem.duration, requestedBy: removedItem.requestedBy };
    }

    async clearQueue(channelId) {
        const ch = this.resolveChannel(channelId);
        ch.clearQueue();
        const songQueue = new SongQueueManager(channelId);
        songQueue.clear();
        await ch.ensureQueueSize();
        return { cleared: true, channelId };
    }

    /**
     * ==========================================
     * Admin & Token Services
     * ==========================================
     */

    validateChannels(channels) {
        if (!Array.isArray(channels) || channels.length === 0) {
            throw new Error("'channels' must be a non-empty array");
        }
        const existing = new Set(channelManager.getAllChannels().map(channel => channel.id));
        const unknown = channels.filter(channel => !existing.has(channel));
        if (unknown.length) {
            throw new Error(`Unknown channel(s): ${unknown.join(", ")}`);
        }
        return [...new Set(channels)];
    }

    async generateToken(username, role = DEFAULT_TOKEN_ROLE, channels) {
        if (!Object.values(TOKEN_ROLES).includes(role)) {
            throw new Error(`Invalid role '${role}'. Allowed roles: ${Object.values(TOKEN_ROLES).join(", ")}`);
        }
        const tokenChannels = this.validateChannels(channels);
        const token = generate256BitToken();
        const tokenManager = new TokenManager();
        tokenManager.addToken({ token, username, role, channels: tokenChannels });
        return { token, username, role, channels: tokenChannels };
    }

    async getAllTokens() {
        const tokenManager = new TokenManager();
        return tokenManager.printQueue();
    }

    async removeTokenByUsername(username) {
        const tokenManager = new TokenManager();
        const removed = tokenManager.removeTokenByUsername(username);
        if (!removed) {
            throw new Error(`Failed to revoke token: no token found for username '${username}'`);
        }
        return removed;
    }

    async updateTokenChannels(username, channels) {
        const tokenChannels = this.validateChannels(channels);
        const tokenManager = new TokenManager();
        const updated = tokenManager.updateTokenChannels(username, tokenChannels);
        if (!updated) {
            throw new Error(`Failed to update token: no token found for username '${username}'`);
        }
        return updated;
    }

    /**
     * ==========================================
     * Block List Services
     * ==========================================
     */

    async blockCurrentSong(requestedBy = "anonymous", channelId) {
        try {
            const songDetail = await this.getCurrentSong(channelId);
            return await this.blockListManager.blockCurrentSong(songDetail.title, requestedBy);
        } catch (error) {
            logger.error("Error in blockCurrentSong service:", { error: error.message });
            throw error;
        }
    }

    async blockSongBySongName(songName, requestedBy) {
        try {
            return await this.blockListManager.blockSongBySongName(songName, requestedBy);
        } catch (error) {
            logger.error("Error in blockSongBySongName service:", { error: error.message });
            throw error;
        }
    }

    async unblockSongBySongName(songName) {
        try {
            return await this.blockListManager.unblockSongBySongName(songName);
        } catch (error) {
            logger.error("Error in unblockSongBySongName service:", { error: error.message });
            throw error;
        }
    }

    async unblockSongByIndex(index) {
        try {
            return await this.blockListManager.unblockSongByIndex(index);
        } catch (error) {
            logger.error("Error in unblockSongByIndex service:", { error: error.message });
            throw error;
        }
    }

    async clearBlockList() {
        try {
            return await this.blockListManager.clearBlockList();
        } catch (error) {
            logger.error("Error in clearBlockList service:", { error: error.message });
            throw error;
        }
    }

    async getAllBlockList() {
        try {
            return await this.blockListManager.getAllBlockList();
        } catch (error) {
            logger.error("Error in getAllBlockList service:", { error: error.message });
            return [];
        }
    }

    async isSongBlocked(songName) {
        try {
            return this.blockListManager.isSongBlocked(songName);
        } catch (error) {
            logger.error("Error in isSongBlocked service:", { error: error.message });
            return false;
        }
    }

    /**
     * ==========================================
     * Default Playlist Manager Services
     * ==========================================
     */

    async addDefaultPlaylist({ playlistId, title, source, requestedBy = "auto", isActive = true, genre = "mix", channelId = null }) {
        try {
            if (channelId) {
                this.validateChannels([channelId]);
            }
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
                isActive,
                genre,
                channelId: channelId || null
            });
            const metadataStore = new DefaultPlaylistMetadataManager();
            const updatedMetadata = metadata.map(data => ({ ...data, playlistId, channelId: channelId || null }));
            metadataStore.addMany(updatedMetadata);
            return { added: true, total: metadata.length };
        } catch (error) {
            logger.error("Error in addDefaultPlaylist service:", { error: error.message });
            throw error;
        }
    }

    async removeDefaultPlaylist({ index, playlistId, channelId = null }) {
        const defaultPlaylistStore = new DefaultPlaylistManager();
        const defaultPlaylistMetadataStore = new DefaultPlaylistMetadataManager();

        const allPlaylists = defaultPlaylistStore.getAll();
        const position = playlistId
            ? allPlaylists.findIndex(p => p.playlistId === playlistId && (p.channelId ?? null) === (channelId ?? null))
            : index - 1;
        const target = allPlaylists[position];
        if (!target) {
            throw playlistNotFoundError();
        }
        if ((target.channelId ?? null) !== (channelId ?? null)) {
            throw playlistScopeError(channelId);
        }

        const scopeCount = allPlaylists.filter(p => (p.channelId ?? null) === (channelId ?? null)).length;
        if (channelId === null && scopeCount <= 1) {
            throw new Error("Cannot remove default playlist. There must be at least one global default playlist.");
        }

        const removedPlaylist = defaultPlaylistStore.removeAtIndex(position + 1);
        if (!removedPlaylist) {
            throw new Error("Failed to remove playlist");
        }

        const allMetadataEntries = defaultPlaylistMetadataStore.getAll();

        const indexesToRemove = allMetadataEntries
            .map((entry, idx) => (
                entry.playlistId === removedPlaylist.playlistId &&
                (entry.channelId ?? null) === (removedPlaylist.channelId ?? null)
                    ? idx + 1
                    : null
            ))
            .filter(idx => idx !== null)
            .sort((a, b) => b - a);

        for (const idx of indexesToRemove) {
            defaultPlaylistMetadataStore.removeAtIndex(idx);
        }

        return removedPlaylist;
    }

    async getDefaultPlaylist({ channelId } = {}) {
        const defaultPlaylistStore = new DefaultPlaylistManager();
        const withIndex = defaultPlaylistStore.getAll().map((playlist, idx) => ({ ...playlist, index: idx + 1 }));
        if (channelId === undefined) {
            return withIndex;
        }
        return withIndex.filter(playlist => (playlist.channelId ?? null) === (channelId ?? null));
    }

    async updatePlaylistStatus({ index, isActive, channelId = null }) {
        const defaultPlaylistStore = new DefaultPlaylistManager();
        const allPlaylists = defaultPlaylistStore.getAll();

        const actualIndex = index - 1;
        const target = allPlaylists[actualIndex];
        if (!target) {
            throw playlistNotFoundError();
        }
        if ((target.channelId ?? null) !== (channelId ?? null)) {
            throw playlistScopeError(channelId);
        }

        if (!isActive) {
            const activePlaylistCount = allPlaylists.filter((playlist, idx) =>
                idx !== actualIndex &&
                (playlist.channelId ?? null) === (channelId ?? null) &&
                playlist.isActive
            ).length;

            if (activePlaylistCount === 0) {
                throw new Error("Cannot deactivate playlist: At least one playlist must remain active");
            }
        }

        const updatedPlaylist = {
            ...allPlaylists[actualIndex],
            isActive
        };

        defaultPlaylistStore.removeAtIndex(index);
        defaultPlaylistStore.add(updatedPlaylist);

        return updatedPlaylist;
    }
}

export default Service;
