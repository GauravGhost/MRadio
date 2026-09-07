import path from 'path';
import { Channel } from './channel.js';
import fsHelper from '../utils/helper/fs-helper.js';
import logger from '../utils/logger.js';
import { DEFAULT_TRACKS_LOCATION } from '../utils/constant.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'channels.json');

class ChannelManager {
    constructor() {
        this.channels = new Map();
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // 1. Create Default Channel
        const defaultChannel = new Channel('default', 'Default Radio', 'all');
        this.channels.set('default', defaultChannel);

        // 2. Load stored custom channels from data/channels.json if present
        this.loadChannelsFromDisk();

        // 3. Start default channel audio loading
        try {
            await defaultChannel.loadTracks(DEFAULT_TRACKS_LOCATION);
            defaultChannel.play();
            logger.info('[ChannelManager] Default channel initialized successfully');
        } catch (err) {
            logger.error('[ChannelManager] Failed to load tracks for default channel:', err);
        }

        this.initialized = true;
    }

    loadChannelsFromDisk() {
        try {
            if (fsHelper.exists(DATA_FILE)) {
                const data = JSON.parse(fsHelper.read(DATA_FILE));
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item.id && item.id !== 'default' && !this.channels.has(item.id)) {
                            const channel = new Channel(item.id, item.name || item.id, item.genre || 'all');
                            this.channels.set(item.id, channel);
                            // Lazy load track queue for custom channels
                            channel.loadTracks(DEFAULT_TRACKS_LOCATION).then(() => {
                                channel.play();
                            }).catch(err => {
                                logger.error(`Failed to load tracks for channel ${item.id}:`, err);
                            });
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('[ChannelManager] Error loading channels from disk:', error);
        }
    }

    saveChannelsToDisk() {
        try {
            const list = [];
            for (const [id, ch] of this.channels.entries()) {
                if (id !== 'default') {
                    list.push({
                        id: ch.id,
                        name: ch.name,
                        genre: ch.genre
                    });
                }
            }
            const dataDir = path.dirname(DATA_FILE);
            if (!fsHelper.exists(dataDir)) {
                fsHelper.makeDir(dataDir);
            }
            fsHelper.write(DATA_FILE, JSON.stringify(list, null, 2));
        } catch (error) {
            logger.error('[ChannelManager] Error saving channels to disk:', error);
        }
    }

    getChannel(id = 'default') {
        const channel = this.channels.get(id);
        if (!channel) {
            // Fall back to default if channel not found
            return this.channels.get('default');
        }
        return channel;
    }

    async createChannel({ id, name, genre }) {
        if (!id) throw new Error('Channel ID is required');
        const cleanId = id.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
        if (!cleanId) throw new Error('Invalid Channel ID');
        if (this.channels.has(cleanId)) throw new Error(`Channel '${cleanId}' already exists`);

        const channel = new Channel(cleanId, name || cleanId, genre || 'all');
        this.channels.set(cleanId, channel);
        this.saveChannelsToDisk();

        await channel.loadTracks(DEFAULT_TRACKS_LOCATION);
        channel.play();

        logger.info(`[ChannelManager] Created new channel: ${cleanId}`);
        return channel.getStatus();
    }

    async deleteChannel(id) {
        if (id === 'default') throw new Error('Cannot delete default channel');
        const channel = this.channels.get(id);
        if (!channel) throw new Error(`Channel '${id}' not found`);

        await channel.cleanupCurrentStream();
        this.channels.delete(id);
        this.saveChannelsToDisk();

        logger.info(`[ChannelManager] Deleted channel: ${id}`);
        return { deleted: true, id };
    }

    async updateChannel(id, { name, genre }) {
        const channel = this.channels.get(id);
        if (!channel) throw new Error(`Channel '${id}' not found`);
        if (name) channel.name = name;
        if (genre) channel.genre = genre;
        this.saveChannelsToDisk();
        logger.info(`[ChannelManager] Updated channel: ${id}`);
        return channel.getStatus();
    }

    async restartChannel(id) {
        const channel = this.channels.get(id);
        if (!channel) throw new Error(`Channel '${id}' not found`);
        await channel.restart();
        return channel.getStatus();
    }

    getAllChannels() {
        const result = [];
        for (const ch of this.channels.values()) {
            result.push(ch.getStatus());
        }
        return result;
    }
}

const channelManager = new ChannelManager();
export default channelManager;
