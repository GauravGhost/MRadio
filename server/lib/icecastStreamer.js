import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import logger from '../utils/logger.js';
import { getFfmpegPath } from '../utils/utils.js';

class IcecastStreamer {
    constructor(config) {
        this.config = {
            host: config.host,
            port: config.port,
            password: config.password,
            mount: config.mount,
            name: config.name,
            description: config.description,
            genre: config.genre,
            bitrate: config.bitrate || '128',
            sampleRate: config.sampleRate || '44100',
            channels: config.channels || '2'
        };
        
        this.ffmpegProcess = null;
        this.inputStream = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.reconnectTimer = null;
        this.isReconnecting = false;
        this.buffer = [];
        this.bufferSize = 0;
        this.maxBufferSize = 1024 * 1024; // 1MB buffer
    }

    connect() {
        // Return existing connection promise if already connecting
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = new Promise((resolve, reject) => {
            if (this.isConnected) {
                logger.info('Already connected to Icecast server');
                this.connectionPromise = null;
                return resolve();
            }

            if (this.isReconnecting) {
                logger.info('Already attempting to reconnect to Icecast server');
                this.connectionPromise = null;
                return resolve();
            }

            const icecastUrl = `icecast://source:${this.config.password}@${this.config.host}:${this.config.port}${this.config.mount}`;
            
            logger.info(`Connecting to Icecast server at ${this.config.host}:${this.config.port}${this.config.mount}`);

            // FFmpeg arguments for Icecast streaming
            const ffmpegArgs = [
                '-hide_banner',
                '-loglevel', 'warning',
                // Input from stdin with re-sync on errors
                '-f', 'mp3',
                '-i', 'pipe:0',
                // Error recovery options
                '-err_detect', 'ignore_err',
                '-fflags', '+genpts+discardcorrupt',
                '-max_error_rate', '1.0',
                // Re-encode for consistent output
                '-acodec', 'libmp3lame',
                '-ab', `${this.config.bitrate}k`,
                '-ar', this.config.sampleRate,
                '-ac', this.config.channels,
                // Metadata
                '-metadata', `title="${this.config.name}"`,
                '-metadata', `artist="${this.config.description}"`,
                '-metadata', `genre="${this.config.genre}"`,
                // Output format with reconnect options
                '-f', 'mp3',
                '-reconnect', '1',
                '-reconnect_at_eof', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5',
                // Icecast specific settings
                '-content_type', 'audio/mpeg',
                '-ice_name', this.config.name,
                '-ice_description', this.config.description,
                '-ice_genre', this.config.genre,
                '-ice_public', '1',
                // Output to Icecast
                icecastUrl
            ];

            this.ffmpegProcess = spawn(getFfmpegPath(), ffmpegArgs, {
                windowsHide: true
            });

            this.inputStream = new PassThrough({ highWaterMark: 64 * 1024 });
            this.inputStream.pipe(this.ffmpegProcess.stdin);

            this.flushBuffer();

            this.ffmpegProcess.stderr.on('data', (data) => {
                const message = data.toString();

                if (message.includes('Header missing') || 
                    message.includes('Invalid data found when processing input')) {
                    logger.debug(`FFmpeg warning (ignored during transition): ${message}`);
                    return;
                }
                
                if (message.includes('error') || message.includes('Error')) {
                    if (message.includes('403 Forbidden') && this.isConnected) {
                        logger.debug('Received 403 during active connection, ignoring');
                        return;
                    }
                    logger.error(`FFmpeg Icecast error: ${message}`);
                    if (!this.isReconnecting) {
                        this.handleConnectionError();
                    }
                } else if (message.includes('Connected')) {
                    logger.info('Successfully connected to Icecast server');
                    this.isConnected = true;
                    this.isReconnecting = false;
                    this.reconnectAttempts = 0;
                    resolve();
                } else {
                    logger.debug(`FFmpeg Icecast: ${message}`);
                }
            });

            this.ffmpegProcess.on('error', (error) => {
                logger.error('FFmpeg process error:', error);
                if (!this.isReconnecting) {
                    this.handleConnectionError();
                }
                if (!this.isConnected) {
                    reject(error);
                }
            });

            this.ffmpegProcess.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    logger.error(`FFmpeg process exited with code ${code}`);
                }
                this.isConnected = false;
                if (!this.isReconnecting) {
                    this.handleConnectionError();
                }
            });

            // Consider connected after a short delay if no errors
            setTimeout(() => {
                if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                    this.isConnected = true;
                    this.isReconnecting = false;
                    this.reconnectAttempts = 0;
                    logger.info('FFmpeg Icecast streaming initialized');
                    this.connectionPromise = null;
                    resolve();
                }
            }, 2000);
        }).finally(() => {
            this.connectionPromise = null;
        });

        return this.connectionPromise;
    }

    handleConnectionError() {
        if (this.isReconnecting) {
            return;
        }
        
        this.isConnected = false;
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        } else {
            logger.error('Max reconnection attempts reached for Icecast');
        }
    }

    scheduleReconnect() {
        if (this.isReconnecting) {
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000);
        
        logger.info(`Scheduling Icecast reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectTimer = setTimeout(() => {
            this.isReconnecting = false;
            this.reconnectTimer = null;
            
            this.cleanup();
            
            this.connect().catch(err => {
                logger.error('Icecast reconnection failed:', err);
                this.isReconnecting = false;
            });
        }, delay);
    }

    flushBuffer() {
        if (this.buffer.length > 0 && this.inputStream && !this.inputStream.destroyed) {
            try {
                for (const chunk of this.buffer) {
                    this.inputStream.write(chunk);
                }
                this.buffer = [];
                this.bufferSize = 0;
                logger.debug('Flushed audio buffer to stream');
            } catch (error) {
                logger.error('Error flushing buffer:', error);
            }
        }
    }

    write(chunk) {
        if (!chunk || chunk.length === 0) return;

        if (this.isConnected && this.inputStream && !this.inputStream.destroyed) {
            try {
                if (this.buffer.length > 0) {
                    this.flushBuffer();
                }
                
                const success = this.inputStream.write(chunk);
                if (!success) {
                    this.inputStream.once('drain', () => {
                        logger.debug('Icecast stream drained');
                    });
                }
            } catch (error) {
                logger.error('Error writing to Icecast stream:', error);
                this.addToBuffer(chunk);
                if (!this.isReconnecting) {
                    this.handleConnectionError();
                }
            }
        } else {
            this.addToBuffer(chunk);
            
            if (!this.isConnected && !this.isReconnecting && this.reconnectAttempts === 0) {
                this.connect().catch(err => {
                    logger.error('Failed to connect to Icecast:', err);
                });
            }
        }
    }

    addToBuffer(chunk) {
        if (this.bufferSize + chunk.length <= this.maxBufferSize) {
            this.buffer.push(chunk);
            this.bufferSize += chunk.length;
        } else {
            while (this.bufferSize + chunk.length > this.maxBufferSize && this.buffer.length > 0) {
                const removed = this.buffer.shift();
                this.bufferSize -= removed.length;
            }
            this.buffer.push(chunk);
            this.bufferSize += chunk.length;
        }
    }

    cleanup() {
        if (this.inputStream) {
            try {
                this.inputStream.end();
                this.inputStream.destroy();
            } catch (error) {
                logger.debug('Error cleaning up input stream:', error);
            }
            this.inputStream = null;
        }

        if (this.ffmpegProcess) {
            try {
                this.ffmpegProcess.stdin.end();
                this.ffmpegProcess.kill('SIGTERM');
            } catch (error) {
                logger.debug('Error cleaning up FFmpeg process:', error);
            }
            this.ffmpegProcess = null;
        }
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.cleanup();
        
        this.isConnected = false;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.buffer = [];
        this.bufferSize = 0;
        
        logger.info('Disconnected from Icecast server');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            reconnecting: this.isReconnecting,
            reconnectAttempts: this.reconnectAttempts,
            bufferSize: this.bufferSize,
            config: {
                host: this.config.host,
                port: this.config.port,
                mount: this.config.mount,
                name: this.config.name
            }
        };
    }
}

export default IcecastStreamer;
