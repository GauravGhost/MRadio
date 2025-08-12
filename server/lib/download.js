import ytdl from 'youtube-dl-exec';
import yts from 'yt-search'
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import ffmpeg from 'fluent-ffmpeg';
import { getFfmpegPath, getCookiesPath } from '../utils/utils.js';
import axios from 'axios';
import cacheManager from './cacheManager.js';
import fsHelper from '../utils/helper/fs-helper.js';
import { DEFAULT_TRACKS_LOCATION } from '../utils/constant.js';
import SoundCloud from './soundcloud.js';
import { createDownloadLinks } from '../utils/crypto.js';

ffmpeg.setFfmpegPath(getFfmpegPath());
class MyDownloader {
    
    async testCookies() {
        try {
            const cookiesPath = getCookiesPath();
            logger.info('Testing YouTube cookies...');
            
            // Test with a known age-restricted video that requires authentication
            const testUrl = 'https://www.youtube.com/watch?v=tPx-7Grk_UY';
            const result = await ytdl(testUrl, {
                dumpSingleJson: true,
                cookies: cookiesPath,
                verbose: true
            });
            
            logger.info('YouTube cookies are working correctly');
            return true;
        } catch (error) {
            logger.error('YouTube cookie test failed:', error);
            return false;
        }
    }

    async getVideoDetail(name, artistName) {
        try {
            const r = await yts({ query: `${name} - ${artistName} official audio song music`, category: 'music' });
            if (r.videos?.length === 0) {
                throw new Error('No video found for the given name and artist');
            }

            return r.videos[0];
        } catch (error) {
            logger.error("Error getting details: " + error.message);
            throw error;
        }
    }

    async downloadVideo(url, title, outputPath = DEFAULT_TRACKS_LOCATION) {
        // Check if song exists in cache first
        const cachedPath = cacheManager.getFromCache(title);
        if (cachedPath) {
            logger.info(`Using cached version of: ${title}`);
            return { url: cachedPath };
        }

        // Ensure tracks directory exists
        if (!fsHelper.exists(outputPath)) {
            fsHelper.createDirectory(outputPath);
            logger.info(`Created directory: ${outputPath}`);
        }

        // Get consistent file path
        const outputFilePath = cacheManager.getOriginalPath(title);
        logger.info(`Downloading ${title} to ${outputFilePath}`);
        try {
            const cookiesPath = getCookiesPath();
            
            // Check if cookies exist and are valid
            let useCookies = false;
            if (fs.existsSync(cookiesPath)) {
                const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
                const cookieLines = cookiesContent.split('\n').filter(line => 
                    line.trim() && !line.startsWith('#') && line.includes('.youtube.com')
                );

                if (cookieLines.length > 0) {
                    logger.info(`Found ${cookieLines.length} YouTube cookies, will try with cookies first`);
                    useCookies = true;
                } else {
                    logger.warn('No valid YouTube cookies found in cookies.txt');
                }
            } else {
                logger.warn('No cookies.txt file found');
            }

            // Try different download methods in order of preference
            const downloadMethods = [
                // Method 1: Without cookies (often works better for public videos)
                {
                    name: 'without cookies',
                    options: {
                        output: outputFilePath,
                        extractAudio: true,
                        audioFormat: 'mp3',
                        audioQuality: 6,
                        noCallHome: true,
                        noCheckCertificate: true,
                        preferFreeFormats: true,
                        ffmpegLocation: getFfmpegPath(),
                        verbose: false // Reduce verbosity for cleaner logs
                    }
                },
                // Method 2: With cookies (if available)
                ...(useCookies ? [{
                    name: 'with cookies',
                    options: {
                        output: outputFilePath,
                        extractAudio: true,
                        audioFormat: 'mp3',
                        audioQuality: 6,
                        noCallHome: true,
                        noCheckCertificate: true,
                        preferFreeFormats: true,
                        ffmpegLocation: getFfmpegPath(),
                        cookies: cookiesPath,
                        verbose: false
                    }
                }] : [])
            ];

            let downloadSuccessful = false;
            let lastError = null;

            // Try each download method
            for (const method of downloadMethods) {
                try {
                    logger.info(`Attempting download of ${title} ${method.name}`);
                    await ytdl(url, method.options);
                    logger.info(`Successfully downloaded ${title} using ${method.name}`);
                    downloadSuccessful = true;
                    break;
                } catch (error) {
                    logger.warn(`Download failed ${method.name}: ${error.message}`);
                    lastError = error;
                    continue;
                }
            }

            if (!downloadSuccessful) {
                throw new Error(`All download methods failed. Last error: ${lastError?.message}`);
            }

            return { url: outputFilePath }

        } catch (error) {
            logger.error(`Error downloading ${title}:`, error);
            throw error;
        }
    }

    async downloadFromUrl(url, title, outputPath = DEFAULT_TRACKS_LOCATION) {
        // Check if song exists in cache first
        const cachedPath = cacheManager.getFromCache(title);
        if (cachedPath) {
            logger.info(`Using cached version of: ${title}`);
            return { url: cachedPath };
        }

        // Ensure tracks directory exists
        if (!fsHelper.exists(outputPath)) {
            fsHelper.createDirectory(outputPath);
            logger.info(`Created directory: ${outputPath}`);
        }

        // Get consistent file paths
        const outputFilePath = cacheManager.getOriginalPath(title);
        const safeTitle = title.replace(/[<>:"/\\|?*]/g, '');
        const tempFile = path.join(outputPath, `temp_${safeTitle}.mp3`);
        logger.info(`Downloading ${title} to ${outputFilePath}`);

        try {
            logger.info(`Downloading ${title} from URL to ${outputFilePath}`);
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(tempFile);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            await new Promise((resolve, reject) => {
                ffmpeg(tempFile)
                    .toFormat('mp3')
                    .audioQuality(6)
                    .on('end', () => {
                        fs.unlink(tempFile, (err) => {
                            if (err) logger.error('Error deleting temp file:', err);
                        });
                        logger.info(`Successfully downloaded ${title} to ${outputFilePath}`);
                        resolve();
                    })
                    .on('error', (err) => {
                        fs.unlink(tempFile, () => {
                            reject(err);
                        });
                    })
                    .save(outputFilePath);
            });

            return { url: outputFilePath };
        } catch (error) {
            logger.error(`Error downloading ${title}:`, error);
            if (fsHelper.exists(tempFile)) {
                fsHelper.delete(tempFile);
                logger.info(`Cleaned up temp file: ${tempFile}`);
            }
            throw error;
        }
    }

    async downloadSoundCloud(url, title){
        const download = new SoundCloud();
        const streamUrl = await download.fetchStreamUrl(url);
        return await this.downloadFromUrl(streamUrl, title)
    }

    async downloadJioSaavn(url, title){
        const streamUrl = createDownloadLinks(url)[3].url;
        return await this.downloadFromUrl(streamUrl, title)
    }
}

export default MyDownloader;
