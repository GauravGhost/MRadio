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
            const { getYtDlpOptions } = await import('../utils/ytdlConfig.js');
            const options = getYtDlpOptions({
                output: outputFilePath,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 6,
                preferFreeFormats: true,
                ffmpegLocation: getFfmpegPath(),
                verbose: false
            });

            try {
                logger.info(`Attempting download of ${title} using yt-dlp config`);
                await ytdl(url, options);
                logger.info(`Successfully downloaded ${title}`);
            } catch (error) {
                logger.warn(`Download failed: ${error.message}`);
                throw new Error(`Download method failed. Last error: ${error.message}`);
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
