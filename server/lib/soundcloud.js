import ytdl from 'youtube-dl-exec';
import logger from "../utils/logger.js";
import { checkSimilarity, isCleanMatch } from "../utils/utils.js";
import { getYtDlpOptions } from '../utils/ytdlConfig.js';

class SoundCloud {
    async getSongBySongName(songName, retryCount = 1) {
        try {
            // Search using yt-dlp soundcloud site filter
            const query = `ytsearch5:${songName} site:soundcloud.com`;
            const options = getYtDlpOptions({
                dumpSingleJson: true,
                flatPlaylist: true,
            });
            
            logger.info(`Searching SoundCloud for: ${songName}`);
            const results = await ytdl(query, options);
            
            if (!results || !results.entries || results.entries.length === 0) {
                return;
            }

            // Filter out remixes/covers unless explicitly asked for, then find best match
            const cleanEntries = results.entries.filter(track => isCleanMatch(songName, track.title || track.fulltitle));
            const entriesToSearch = cleanEntries.length > 0 ? cleanEntries : results.entries;
            
            let songData = entriesToSearch.find(track => checkSimilarity(songName, track.title || track.fulltitle) > 60) || entriesToSearch[0];
            
            if (!songData) return;

            if (songData.duration && songData.duration > 600) {
                throw new Error("Song Duration is more than 10 minutes.");
            }

            return {
                title: songData.title || songData.fulltitle,
                url: songData.webpage_url || songData.url,
                duration: songData.duration || 0,
            };
        } catch (error) {
            logger.error(`SoundCloud search error: ${error.message}`);
            return;
        }
    }

    async fetchStreamUrl(url) {
        try {
            const options = getYtDlpOptions({
                format: 'bestaudio/best',
                getUrl: true
            });
            logger.info(`Fetching SoundCloud stream URL for: ${url}`);
            const streamUrl = await ytdl(url, options);
            return streamUrl;
        } catch (error) {
            logger.error(`SoundCloud fetch stream error: ${error.message}`);
            throw error;
        }
    }
}

export default SoundCloud;
