import ytdl from 'youtube-dl-exec';
import yts from 'yt-search'
import logger from '../utils/logger.js';
import { checkSimilarity, getCookiesPath, isCleanMatch } from '../utils/utils.js';

class Yts {
    async getVideoDetail(name, artistName) {
        try {
            const query = artistName ? `${name} - ${artistName} official audio song music` : `${name} official audio song music`;
            const r = await yts({ query, category: 'music' });
            if (!r?.videos || r.videos.length === 0) {
                return;
            }
            const cleanVideos = r.videos.filter(track => isCleanMatch(name, track.title));
            const videosToSearch = cleanVideos.length > 0 ? cleanVideos : r.videos;

            const result = videosToSearch.find(track => checkSimilarity(name, track.title) > 60) || videosToSearch[0];
            return result;
        } catch (error) {
            logger.error("Error getting details: " + error.message);
            return;
        }
    }

    async getVideoDetailByUrl(videoId) {
        try {
            const r = await yts({ videoId: videoId });
            if (r.videos?.length === 0) {
                return;
            }
            return r;
        } catch (error) {
            logger.error("Error getting details: " + error.message);
            throw error;
        }
    }

    async validateVideo(url) {
        try {
            const { getYtDlpOptions } = await import('../utils/ytdlConfig.js');
            const options = getYtDlpOptions({
                dumpSingleJson: true,
                ignoreErrors: true
            });
            
            logger.info(`Trying video extraction for ${url}`);
            const info = await ytdl(url, options);

            // If all methods failed, return error
            if (!info?.duration) {
                return { 
                    status: false, 
                    message: 'Unable to extract video information. The video might be private, unavailable, or region-locked.'
                };
            }

            const duration = parseInt(info.duration);

            if (duration > 600) {
                return { status: false, message: 'Video duration exceeds 10 minutes' };
            }

            const categories = info.categories || [];
            const tags = info.tags || [];
            const isMusicCategory =
                categories.some(cat => cat.toLowerCase().includes('music')) ||
                tags.some(tag => tag.toLowerCase().includes('music')) ||
                Boolean(info.track || info.artist);

            // Allow if under 10 minutes even if YouTube uploader used another category (e.g. Entertainment)
            if (!isMusicCategory && duration > 600) {
                return { status: false, message: 'Video duration exceeds limits' };
            }

            return { 
                status: true, 
                message: `Successful (using yt-dlp config)`,
                extractionMethod: 'yt-dlp config' 
            };
            
        } catch (error) {
            logger.error('Video validation error:', error);
            return { 
                status: false, 
                message: `Video validation error: ${error.message}`
            }
        }
    }
    async getPlaylistDetail(listId) {
        try {
            const r = await yts({ listId });
            if (r.videos?.length === 0) {
                throw new Error('No video found for the given name and artist');
            }

            return r.videos;
        } catch (error) {
            logger.error("Error getting details: " + error.message);
            throw error;
        }
    }

    async checkVideoAvailability(url) {
        try {
            const { getYtDlpOptions } = await import('../utils/ytdlConfig.js');
            const options = getYtDlpOptions({
                dumpSingleJson: true,
                extractFlat: true,
                ignoreErrors: false
            });
            
            // Quick availability check without downloading
            const info = await ytdl(url, options);
            
            return { available: true, info };
        } catch (error) {
            logger.warn(`Video availability check failed for ${url}:`, error.message);
            return { 
                available: false, 
                error: error.message.includes('Private video') ? 'Video is private' :
                       error.message.includes('unavailable') ? 'Video is unavailable' :
                       error.message.includes('region') ? 'Video is region-locked' :
                       'Video is not accessible'
            };
        }
    }

    async debugVideoFormats(url) {
        try {
            const cookiesPath = getCookiesPath();
            
            // List available formats for debugging
            const formats = await ytdl(url, {
                listFormats: true,
                noWarnings: true,
                cookies: cookiesPath
            });
            
            logger.info(`Available formats for ${url}:`, formats);
            return formats;
        } catch (error) {
            logger.error(`Could not list formats for ${url}:`, error.message);
            return null;
        }
    }
}

export default Yts;
