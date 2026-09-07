import { v4 as uuid } from "uuid";
import { PassThrough } from "stream";
import Throttle from "throttle";
import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import path from 'path';
import { fetchNextTrack } from "../services/nextTrackFetcherService.js";
import fsHelper from "../utils/helper/fs-helper.js";
import logger from "../utils/logger.js";
import { getFfmpegPath, durationFormatter } from "../utils/utils.js";
import cacheManager from "./cacheManager.js";
import { DEFAULT_QUEUE_SIZE, DEFAULT_TRACKS_LOCATION } from "../utils/constant.js";
import socketManager from "./socketManager.js";
import IcecastStreamer from "./icecastStreamer.js";
import SilenceGenerator from "./silenceGenerator.js";

ffmpeg.setFfmpegPath(getFfmpegPath());

export class Channel {
    constructor(id = "default", name = "Default Radio Channel", genre = "all") {
        this.id = id;
        this.name = name;
        this.genre = genre;
        this.tracks = [];
        this.index = 0;
        this.clients = new Map();
        this.currentTrack = null;
        this.playing = false;
        this.stream = null;
        this.throttle = null;
        this.ffmpegProcess = null;
        this.isDownloading = false;
        this.minQueueSize = DEFAULT_QUEUE_SIZE;
        this.previousTrack = null;
        this.startTime = null;
        this.progressInterval = null;
        this.icecastStreamer = null;
        this.useIcecast = false;
        this.isIdle = false;
        this.idleTimeout = null;
        this.virtualElapsedSeconds = 0;
    }

    initializeIcecast(config) {
        if (!config || !config.host || !config.port || !config.password) {
            logger.error(`[Channel:${this.id}] Invalid Icecast configuration`);
            return false;
        }

        try {
            this.icecastStreamer = new IcecastStreamer(config);
            this.useIcecast = true;
            
            this.icecastStreamer.connect().then(() => {
                logger.info(`[Channel:${this.id}] Successfully initialized Icecast streaming`);
            }).catch(err => {
                logger.error(`[Channel:${this.id}] Failed to connect to Icecast on initialization:`, err);
            });
            
            return true;
        } catch (error) {
            logger.error(`[Channel:${this.id}] Failed to initialize Icecast streamer:`, error);
            this.useIcecast = false;
            return false;
        }
    }

    async previous() {
        if (!this.previousTrack || this.isTransitioning) {
            logger.info(`[Channel:${this.id}] No previous track available`);
            return;
        }

        this.isTransitioning = true;

        try {
            this.playing = false;
            logger.info(`[Channel:${this.id}] Going to previous track:`, this.previousTrack?.title || 'Unknown');

            await this.cleanupCurrentStream();

            if (this.previousTrack?.url) {
                if (this.previousTrack.url.startsWith(`${DEFAULT_TRACKS_LOCATION}/`)) {
                    const cachedPath = cacheManager.getFromCache(this.previousTrack?.title);
                    if (cachedPath) {
                        this.previousTrack.url = cachedPath;
                    } else {
                        logger.info(`[Channel:${this.id}] Previous track ${this.previousTrack?.title || 'Unknown'} not found in cache`);
                        return;
                    }
                }
            } else {
                logger.info(`[Channel:${this.id}] Previous track URL is missing`);
                return;
            }

            const temp = this.currentTrack;
            this.currentTrack = this.previousTrack;
            this.previousTrack = temp;

            this.playing = true;
            await this.play(false);

        } catch (error) {
            logger.error(`[Channel:${this.id}] Error during previous:`, { error });
            this.playing = false;
        } finally {
            this.isTransitioning = false;
        }
    }

    async ensureQueueSize() {
        if (this.isDownloading) {
            return;
        }
        this.isDownloading = true;

        Promise.resolve().then(async () => {
            try {
                while (this.tracks.length < this.minQueueSize) {
                    const song = await fetchNextTrack(this.id, this.genre);
                    if (this.tracks.length < this.minQueueSize) {
                        const songBitrate = await this.getTrackBitrate(song.url);
                        this.tracks.push({
                            url: song.url,
                            bitrate: songBitrate,
                            title: song.title,
                            duration: song?.duration ? durationFormatter(song.duration) : "00:00",
                            requestedBy: song?.requestedBy ?? "anonymous"
                        });
                        logger.info(`[Channel:${this.id}] Added track: ${song.title}`);
                    }
                }
            } catch (error) {
                logger.error(`[Channel:${this.id}] Error ensuring queue size:`, { error });
            } finally {
                this.isDownloading = false;
            }
        });
    }

    current() {
        return this.tracks[this.index];
    }

    broadcast(chunk) {
        if (this.useIcecast && this.icecastStreamer) {
            this.icecastStreamer.write(chunk);
        }
        
        this.clients.forEach((client) => {
            if (!client.destroyed) {
                client.write(chunk);
            }
        });
    }

    addClient() {
        const id = uuid();
        const client = new PassThrough();

        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }

        client.on('error', (err) => {
            logger.error(`[Channel:${this.id}] Client ${id} disconnected: ${err.message}`);
            this.removeClient(id);
        });

        if (this.currentTrack) {
            const metadata = {
                type: 'metadata',
                track: this.currentTrack?.url ? this.currentTrack.url.split('/').pop() : null,
                index: this.index
            };
            client.write(JSON.stringify(metadata));
        }

        this.clients.set(id, client);

        // Resume active FFmpeg stream if coming out of idle
        if (this.isIdle && this.playing) {
            logger.info(`[Channel:${this.id}] Listener connected. Waking channel from idle mode...`);
            this.isIdle = false;
            const currentElapsed = Math.floor((Date.now() - this.startTime) / 1000);
            this.loadTrackStream(currentElapsed);
            this.start();
        }

        return { id, client };
    }

    removeClient(id) {
        const client = this.clients.get(id);
        if (client) {
            client.end();
            client.destroy();
            this.clients.delete(id);
        }

        // On-demand RAM optimization: If 0 listeners and no Icecast, go idle after 5s
        if (this.clients.size === 0 && !this.useIcecast && this.playing && !this.isIdle) {
            this.idleTimeout = setTimeout(() => {
                if (this.clients.size === 0 && !this.useIcecast && this.playing) {
                    logger.info(`[Channel:${this.id}] 0 listeners active. Pausing FFmpeg to save RAM & CPU.`);
                    this.isIdle = true;
                    if (this.ffmpegProcess) {
                        this.cleanupFFmpegOnly();
                    }
                }
            }, 5000);
        }
    }

    cleanupFFmpegOnly() {
        if (this.ffmpegProcess) {
            this.ffmpegProcess.removeAllListeners();
            try {
                process.kill(this.ffmpegProcess.pid, 'SIGKILL');
            } catch (e) {}
            this.ffmpegProcess = null;
        }
        if (this.stream) {
            this.stream.removeAllListeners();
            this.stream.destroy();
            this.stream = null;
        }
        if (this.throttle) {
            this.throttle.removeAllListeners();
            this.throttle.destroy();
            this.throttle = null;
        }
    }

    getAllQueueList() {
        return this.tracks;
    }

    clearQueue() {
        this.tracks = [];
        logger.info(`[Channel:${this.id}] Cleared queue`);
        return true;
    }

    async loadTracks(dir) {
        try {
            this.tracks = [];
            this.index = 0;
            this.currentTrack = null;
            this.isDownloading = false;

            logger.info(`[Channel:${this.id}] Cleaning up tracks directory...`);
            const tracksDir = path.join(process.cwd(), dir);
            if (fsHelper.exists(tracksDir)) {
                const files = fsHelper.listFiles(tracksDir);
                for (const file of files) {
                    const filePath = path.join(tracksDir, file);
                    try {
                        const success = cacheManager.moveToCache(filePath, path.basename(file, '.mp3'));
                        if (!success) {
                            fsHelper.delete(filePath);
                        }
                    } catch (error) {
                        logger.error(`[Channel:${this.id}] Error processing file ${file}:`, error);
                    }
                }
            }

            logger.info(`[Channel:${this.id}] Loading initial tracks...`);

            const song = await fetchNextTrack(this.id, this.genre);
            const songBitrate = await this.getTrackBitrate(song.url);
            this.tracks.push({ 
                url: song.url, 
                bitrate: songBitrate, 
                title: song.title, 
                duration: song?.duration ? durationFormatter(song.duration) : "00:00", 
                requestedBy: song?.requestedBy ?? "anonymous" 
            });

            this.ensureQueueSize();
        } catch (error) {
            logger.error(`[Channel:${this.id}] Error loading tracks: ${error.message}`);
            this.tracks = [];
            throw error;
        }
    }

    async getTrackBitrate(url) {
        return new Promise((resolve) => {
            ffmpeg.ffprobe(url, (err, metadata) => {
                if (err || !metadata?.format?.bit_rate) {
                    return resolve(128000);
                }
                resolve(metadata.format.bit_rate);
            });
        });
    }

    async cleanupCurrentStream() {
        this.playing = false;
        this.startTime = null;
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        return new Promise((resolve) => {
            if (this.useIcecast && this.icecastStreamer && this.icecastStreamer.isConnected) {
                const silence = SilenceGenerator.generateSilence(50);
                this.broadcast(silence);
            }

            const cleanup = () => {
                this.cleanupFFmpegOnly();
                resolve();
            };

            setTimeout(cleanup, 10);
        });
    }

    getNextTrack() {
        if (this.tracks.length === 0) return null;

        this.index = Math.min(this.index, this.tracks.length - 1);
        this.currentTrack = this.tracks[this.index];

        const metadata = {
            type: 'metadata',
            track: this.currentTrack?.url ? this.currentTrack.url.split('/').pop() : null,
            title: this.currentTrack?.title || '',
            index: this.index
        };
        this.broadcast(Buffer.from(JSON.stringify(metadata)));

        logger.info(`[Channel:${this.id}] Now playing: ${this.currentTrack?.title || 'Unknown'}`);
        return this.currentTrack;
    }

    async skip() {
        if (this.tracks.length === 0 || this.isTransitioning) {
            return;
        }

        this.isTransitioning = true;

        try {
            this.playing = false;
            logger.info(`[Channel:${this.id}] Skipping song:`, this.currentTrack?.title || 'Unknown');

            const hasNextTrack = this.tracks.length > 1;

            await this.cleanupCurrentStream();

            if (this.currentTrack) {
                this.previousTrack = { ...this.currentTrack };
            }

            const currentTrack = this.tracks[0];
            if (currentTrack?.url) {
                const normalizedPath = currentTrack.url.replace(/\\/g, '/');
                if (normalizedPath.includes('cache')) {
                } else if (!normalizedPath.startsWith(`${DEFAULT_TRACKS_LOCATION}/`)) {
                } else if (fsHelper.exists(currentTrack.url)) {
                    const title = currentTrack.title || path.basename(currentTrack.url, '.mp3');
                    if (title) {
                        setTimeout(() => {
                            cacheManager.moveToCache(currentTrack.url, title);
                        }, 100);
                    }
                }
            }

            this.tracks.shift();
            this.index = 0;

            if (hasNextTrack) {
                this.playing = true;
                await this.play(true);
            } else {
                const maxWaitTime = 2000;
                const startTime = Date.now();

                while (this.tracks.length === 0) {
                    if (Date.now() - startTime > maxWaitTime) {
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                if (this.tracks.length > 0) {
                    this.playing = true;
                    await this.play(true);
                }
            }
            this.ensureQueueSize();
        } catch (error) {
            logger.error(`[Channel:${this.id}] Error during skip:`, { error });
            this.playing = false;
        } finally {
            this.isTransitioning = false;
        }
    }

    pause() {
        if (!this.started() || !this.playing) return;
        this.playing = false;
        this.cleanupCurrentStream();
        logger.info(`[Channel:${this.id}] Paused`);
    }

    resume() {
        if (!this.started() || this.playing) return;
        logger.info(`[Channel:${this.id}] Resumed`);
        this.play(false);
    }

    async restart() {
        logger.info(`[Channel:${this.id}] Restarting channel stream`);
        await this.cleanupCurrentStream();
        if (this.tracks.length > 0) {
            await this.play(true);
        } else {
            await this.ensureQueueSize();
            await this.play(true);
        }
        return true;
    }

    started() {
        return this.currentTrack !== null;
    }

    async play(useNewTrack = false) {
        if (this.tracks.length === 0) {
            logger.error(`[Channel:${this.id}] No tracks in queue`);
            this.playing = false;
            return;
        }

        try {
            if (useNewTrack || !this.currentTrack) {
                this.getNextTrack();
            }

            await this.cleanupCurrentStream();
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Check if active listeners exist or icecast is enabled
            if (this.clients.size === 0 && !this.useIcecast) {
                logger.info(`[Channel:${this.id}] Starting track in idle mode (0 listeners, FFmpeg delayed until connection)`);
                this.isIdle = true;
                this.playing = true;
                this.startTime = Date.now();
                this.setupProgressTimer();
            } else {
                this.isIdle = false;
                this.loadTrackStream();
                this.start();
            }

            const songData = {
                channelId: this.id,
                title: this.currentTrack?.title || 'Unknown',
                duration: this.currentTrack?.duration || '00:00',
                requestedBy: this.currentTrack?.requestedBy || 'anonymous'
            };
            socketManager.emitToRoom(`channel:${this.id}`, 'newSong', songData);
            socketManager.emit('newSong', songData); // Also emit globally for dashboard listeners
        } catch (error) {
            logger.error(`[Channel:${this.id}] Error during play:`, { error });
            this.playing = false;
        }
    }

    loadTrackStream(seekTime = 0) {
        const track = this.currentTrack;
        if (!track) return;

        if (this.ffmpegProcess) {
            this.cleanupFFmpegOnly();
        }

        const ffmpegArgs = [
            '-hide_banner',
            '-loglevel', 'error',
            '-ss', Math.max(0, seekTime).toString(),
            '-i', track.url,
            '-vn',
            '-acodec', 'libmp3lame',
            '-ab', '128k',
            '-ac', '2',
            '-ar', '44100',
            '-f', 'mp3',
            '-fflags', '+nobuffer+genpts',
            '-flags', '+low_delay',
            '-err_detect', 'ignore_err',
            '-max_error_rate', '1.0',
            'pipe:1'
        ];

        this.ffmpegProcess = spawn(getFfmpegPath(), ffmpegArgs, {
            windowsHide: true
        });

        this.stream = this.ffmpegProcess.stdout;

        this.ffmpegProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString().toLowerCase();
            if (!errorMsg.includes('config') && !errorMsg.includes('version')) {
                logger.error(`[Channel:${this.id}] FFmpeg error: ${data.toString()}`);
            }
        });

        this.ffmpegProcess.once('close', async (code) => {
            if (code !== 0 && 
                this.playing && 
                !this.isTransitioning && 
                this.tracks.length > 0 && 
                this.tracks[0]?.url === this.currentTrack?.url) {
                logger.error(`[Channel:${this.id}] FFmpeg process exited with code ${code}`);
                this.play(true);
            }
        });

        this.stream.on('error', (error) => {
            logger.error(`[Channel:${this.id}] Stream error:`, { error });
            if (this.playing && !this.isTransitioning) {
                this.play(true);
            }
        });
    }

    async handleTrackEnd() {
        if (!this.playing || this.isTransitioning) return;

        logger.info(`[Channel:${this.id}] Track ended, managing queue...`);
        this.isTransitioning = true;

        try {
            if (this.currentTrack) {
                this.previousTrack = { ...this.currentTrack };
            }

            const currentTrack = this.tracks[0];
            if (currentTrack?.url && fsHelper.exists(currentTrack.url)) {
                const title = currentTrack.title || path.basename(currentTrack.url, '.mp3');
                if (title) {
                    setTimeout(() => {
                        cacheManager.moveToCache(currentTrack.url, title);
                    }, 100);
                }
            }

            this.tracks.shift();
            this.index = 0;
            await this.ensureQueueSize();

            const maxWaitTime = 5000;
            const startTime = Date.now();

            while (this.tracks.length === 0) {
                if (Date.now() - startTime > maxWaitTime) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (this.tracks.length > 0) {
                this.play(true);
            } else {
                this.playing = false;
            }
        } catch (error) {
            logger.error(`[Channel:${this.id}] Error handling track end:`, { error });
            this.playing = false;
        } finally {
            this.isTransitioning = false;
        }
    }

    async seek(seconds) {
        if (!this.currentTrack || !this.playing || this.isTransitioning) {
            return;
        }

        this.isTransitioning = true;

        try {
            const seekOffset = parseInt(seconds, 10);
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const [totalMinutes, totalSeconds] = this.currentTrack.duration.split(':').map(Number);
            const totalInSeconds = (totalMinutes * 60) + totalSeconds;
            
            const newPosition = Math.max(0, Math.min(totalInSeconds, elapsed + seekOffset));
            
            if (newPosition >= totalInSeconds) {
                await this.handleTrackEnd();
                return;
            }

            if (!this.isIdle) {
                await this.cleanupCurrentStream();
                this.loadTrackStream(newPosition);
            }

            this.startTime = Date.now() - (newPosition * 1000);
            this.playing = true;
            if (!this.isIdle) {
                this.start();
            }

            const seekPayload = {
                channelId: this.id,
                position: newPosition,
                duration: totalInSeconds
            };
            socketManager.emitToRoom(`channel:${this.id}`, 'seeked', seekPayload);

        } catch (error) {
            logger.error(`[Channel:${this.id}] Error during seek:`, { error });
            this.play(false);
        } finally {
            this.isTransitioning = false;
        }
    }

    calculateProgress() {
        if (!this.startTime || !this.playing || !this.currentTrack?.duration) {
            return { elapsed: "00:00", total: this.currentTrack?.duration || "00:00", percent: 0 };
        }

        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const [totalMinutes, totalSeconds] = this.currentTrack.duration.split(':').map(Number);
        const totalInSeconds = (totalMinutes * 60) + totalSeconds;
        
        if (totalInSeconds > 0 && elapsed >= totalInSeconds && this.isIdle) {
            // Track finished while idle - trigger track transition
            this.handleTrackEnd();
        }

        const percent = Math.min((elapsed / totalInSeconds) * 100, 100);
        const elapsedMinutes = Math.floor(elapsed / 60);
        const elapsedSeconds = elapsed % 60;
        
        return {
            channelId: this.id,
            elapsed: `${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSeconds).padStart(2, '0')}`,
            total: this.currentTrack.duration,
            percent: Math.round(percent)
        };
    }

    setupProgressTimer() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        this.progressInterval = setInterval(() => {
            const progress = this.calculateProgress();
            socketManager.emitToRoom(`channel:${this.id}`, 'playbackProgress', progress);
        }, 10000);
    }

    start() {
        const track = this.currentTrack;
        if (!track) return;

        const bitrate = 128000;
        this.playing = true;
        if (!this.startTime) {
            this.startTime = Date.now();
        }
        this.throttle = new Throttle(bitrate / 8);

        this.setupProgressTimer();

        if (this.stream) {
            const pipeline = this.stream.pipe(this.throttle);

            pipeline.on("data", (chunk) => {
                if (this.playing) {
                    try {
                        this.broadcast(chunk);
                    } catch (error) {
                        logger.error(`[Channel:${this.id}] Broadcast error:`, { error });
                    }
                }
            });

            pipeline.on("end", () => this.handleTrackEnd());

            pipeline.on("error", (err) => {
                logger.error(`[Channel:${this.id}] Stream error:`, { err });
                if (this.playing && !this.isTransitioning) {
                    this.play(true);
                }
            });
        }
    }

    getIcecastStatus() {
        if (!this.useIcecast || !this.icecastStreamer) {
            return { enabled: false };
        }
        return {
            enabled: true,
            ...this.icecastStreamer.getStatus()
        };
    }

    getStatus() {
        const icecast = this.getIcecastStatus();
        return {
            id: this.id,
            name: this.name,
            genre: this.genre,
            playing: this.playing,
            isIdle: this.isIdle,
            listeners: this.clients.size,
            currentTrack: this.currentTrack ? {
                title: this.currentTrack.title,
                duration: this.currentTrack.duration,
                requestedBy: this.currentTrack.requestedBy
            } : null,
            queueLength: this.tracks.length,
            useIcecast: this.useIcecast,
            icecast: icecast.enabled ? {
                connected: !!icecast.connected,
                mount: icecast.config?.mount || (this.id === 'default' ? '/radio.mp3' : `/${this.id}.mp3`),
                streamUrl: icecast.config?.host ? `http://${icecast.config.host}:${icecast.config.port}${icecast.config.mount}` : null,
                name: icecast.config?.name || `${this.name} Radio`,
            } : null,
        };
    }

}
