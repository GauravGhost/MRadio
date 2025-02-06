import YouTubeDownloader from "../lib/download.js";
import JioSavan from "../lib/jiosavan.js";
import SongQueueManager from "../utils/queue/songQueueManager.js";
import cacheManager from "../lib/cacheManager.js";
import logger from "../utils/logger.js";


/**
 * @description Fetch the song when song queue is empty.
 * @returns 
 */
const emptySongQueueHandler = async () => {
    const jio = new JioSavan();
    const song = await jio.getRandomFromTop50();
    return song;
}

/**
 * @description Download song from youtube
 * @param {*} songData 
 * @returns 
 */
const downloadFromYoutube = async (songData) => {
    const yt = new YouTubeDownloader();
    const { url } = await yt.downloadVideo(songData.url, songData.title);
    return { url: url, title: songData.title };
}

/**
 * @description Download song from jiosavan, just return the url.
 * @param {*} songData 
 * @returns 
 */
const downloadFromJioSavan = async (songData) => {
    const yt = new YouTubeDownloader();
    const { url } = await yt.downloadFromUrl(songData.url, songData.title);
    return { url: url, title: songData.title };
}

/**
 * @description Fetching song file by the source type.
 * @param {*} songData 
 * @returns 
 */
const fetchByUrlType = async (songData) => {
    switch (songData.urlType) {
        case 'youtube':
            return await downloadFromYoutube(songData);
        case 'jiosavan':
            return await downloadFromJioSavan(songData);
    }
}

/**
 * @description Next song Fetch Logic
 * @returns 
 */
export const fetchNextTrack = async () => {
    // Fetch queue list from json.
    const songQueue = new SongQueueManager();
    try {
        let songResult;
        const getFirst = songQueue.getFirstFromQueue();

        // If Queue is empty, fetch next track randomly from hit songs.
        if (!getFirst) {
            songResult = await emptySongQueueHandler();
            return songResult;
        }

        // Check if song exists in cache first
        const cachedPath = cacheManager.getFromCache(getFirst.title);
        if (cachedPath) {
            logger.info(`Using cached version of: ${getFirst.title}`);
            songQueue.removeFromFront();
            return {
                url: cachedPath, 
                title: getFirst.title,
                requestedBy: getFirst.requestedBy 
            };
        }

        // If not in cache, fetch next track from given URL type
        songResult = await fetchByUrlType(getFirst);
        songQueue.removeFromFront();
        return { ...songResult, requestedBy: getFirst.requestedBy };
    } catch (error) {
        logger.error('Error fetching next track:', error);
        songQueue.removeFromFront();
        throw error;
    }
}
