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
        this.icecastConfig = null;
        this.registerShutdownFlush();
    }

    /**
     * Flush pending session writes on shutdown so a redeploy resumes exactly
     */
    registerShutdownFlush() {
        const flush = () => {
            for (const channel of this.channels.values()) {
                try {
                    channel.writeStateNow();
                } catch (error) {
                    logger.error(`[ChannelManager] Failed to flush state for channel "${channel.id}":`, error);
                }
            }
            process.exit(0);
        };

        process.on('SIGTERM', flush);
        process.on('SIGINT', flush);
    }

    setIcecastConfig(config) {
        this.icecastConfig = config;
        for (const channel of this.channels.values()) {
            this.attachIcecastToChannel(channel);
        }
    }

    attachIcecastToChannel(channel) {
        if (!this.icecastConfig || !this.icecastConfig.host || !this.icecastConfig.port || !this.icecastConfig.password) {
            return;
        }
        if (channel.useIcecast && channel.icecastStreamer) {
            return;
        }

        const mount = channel.id === 'default'
            ? (this.icecastConfig.mount || '/radio.mp3')
            : `/${channel.id}.mp3`;

        const channelConfig = {
            ...this.icecastConfig,
            mount,
            name: `${channel.name} Radio`,
            description: `${channel.name} - Multi-channel stream`,
            genre: channel.genre || 'Various',
        };

        const success = channel.initializeIcecast(channelConfig);
        if (success) {
            logger.info(`[ChannelManager] Attached Icecast to channel "${channel.id}" at mount "${mount}"`);
        }
    }

    async init() {
        if (this.initialized) return;

        const defaultChannel = new Channel('default', 'Default Radio', 'all');
        this.channels.set('default', defaultChannel);

        this.attachIcecastToChannel(defaultChannel);
        this.loadChannelsFromDisk();

        await this.startChannel(defaultChannel);

        this.initialized = true;
    }

    /**
     * Resume the persisted session.
     */
    async startChannel(channel) {
        try {
            const resumed = await channel.restoreSession(DEFAULT_TRACKS_LOCATION);

            if (resumed) {
                logger.info(`[ChannelManager] Resumed previous session for channel "${channel.id}"`);
            } else {
                await channel.loadTracks(DEFAULT_TRACKS_LOCATION);
                logger.info(`[ChannelManager] Started a fresh session for channel "${channel.id}"`);
            }

            channel.play();
        } catch (err) {
            logger.error(`[ChannelManager] Failed to start channel "${channel.id}":`, err);
        }
    }

    /**
     * Liveness of every channel's stream engine for health check.
     */
    getHealthReport() {
        const channels = [];
        const unhealthy = [];

        for (const channel of this.channels.values()) {
            const streamAlive = channel.isStreamAlive();
            channels.push({
                id: channel.id,
                playing: channel.playing,
                isIdle: channel.isIdle,
                listeners: channel.clients.size,
                streamAlive,
            });
            if (!streamAlive) {
                unhealthy.push(channel.id);
            }
        }

        return { channels, unhealthy, healthy: unhealthy.length === 0 };
    }

    loadChannelsFromDisk() {
        try {
            if (fsHelper.exists(DATA_FILE)) {
                const data = fsHelper.readFromJson(DATA_FILE, []);
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item.id && item.id !== 'default' && !this.channels.has(item.id)) {
                            const channel = new Channel(item.id, item.name || item.id, item.genre || 'all');
                            this.channels.set(item.id, channel);
                            this.attachIcecastToChannel(channel);
                            // Lazy load track queue for custom channels
                            this.startChannel(channel);
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
            fsHelper.writeToJson(DATA_FILE, list);
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

        // Attach Icecast relay stream if Icecast is configured
        this.attachIcecastToChannel(channel);

        await channel.loadTracks(DEFAULT_TRACKS_LOCATION);
        channel.play();

        logger.info(`[ChannelManager] Created new channel: ${cleanId}`);
        return channel.getStatus();
    }

    async deleteChannel(id) {
        if (id === 'default') throw new Error('Cannot delete default channel');
        const channel = this.channels.get(id);
        if (!channel) throw new Error(`Channel '${id}' not found`);

        if (channel.icecastStreamer) {
            try {
                channel.icecastStreamer.disconnect();
            } catch (err) {
                logger.warn(`[ChannelManager] Error disconnecting Icecast for channel ${id}:`, err);
            }
        }

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
