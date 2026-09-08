import MyDownloader from "../lib/download.js";
import SongQueueManager from "../utils/queue/songQueueManager.js";
import cacheManager from "../lib/cacheManager.js";
import logger from "../utils/logger.js";
import DefaultPlaylistMetadataManager from "../utils/queue/defaultPlaylistMetadataManager.js";
import { getRandomNumber } from "../utils/utils.js";
import { extname, join } from "path";
import { COMMON_CONFIG_KEYS, DEFAULT_FALLBACK_LOCATION } from "../utils/constant.js";
import fsHelper from "../utils/helper/fs-helper.js";
import commonConfigService from "./commonConfigService.js";
import Service from "./apiService.js";
import DefaultPlaylistManager from "../utils/queue/defaultPlaylistManager.js";


/**
 * @description Fetch the song when song queue is empty.
 * @returns 
 */
const getFallbackTrack = async (dir = DEFAULT_FALLBACK_LOCATION) => {
    try {
        const files = fsHelper.listFiles(dir);
        const musicFiles = files.filter(file => extname(file) === '.mp3');

        if (musicFiles.length === 0) {
            throw new Error(`No fallback tracks available in directory: ${dir}`);
        }

        const randomTrack = musicFiles[getRandomNumber(0, musicFiles.length - 1)];

        return {
            title: randomTrack.replace('.mp3', ''),
            url: join(dir, randomTrack),
            urlType: 'fallback',
            duration: 0,
            requestedBy: 'fallback'
        };
    } catch (error) {
        logger.error('Fallback mechanism failed:', error);
        throw error;
    }
}

const checkAndRefreshMetadata = async (playlist) => {
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const metadataDate = new Date(playlist.metadataUpdatedAt);
    const now = new Date();

    if (now - metadataDate > TWO_DAYS_MS) {
        logger.info("Updating the metadata for : " + playlist.title);
        const apiService = new Service();
        // First remove old metadata
        await apiService.removeDefaultPlaylist({ index: playlist.index });
        // Then add fresh metadata
        await apiService.addDefaultPlaylist({
            playlistId: playlist.playlistId,
            title: playlist.title,
            source: playlist.source,
            isActive: playlist.isActive,
            genre: playlist.genre
        });
    }
}

const emptySongQueueHandler = async () => {
    try {
        const defaultPlaylistMetadata = new DefaultPlaylistMetadataManager();
        const defaultPlaylistStore = new DefaultPlaylistManager();
        const genre = await commonConfigService.get(COMMON_CONFIG_KEYS.defaultPlaylistGenre);

        const filter = {
            isActive: true,
            genre: genre === "all" ? undefined : genre,
        }

        const activePlaylists = defaultPlaylistStore.getAll()
            .map((playlist, index) => ({ ...playlist, index: index + 1 }))
            .filter(p => p.isActive && (genre === "all" || p.genre === genre));

        await Promise.all(activePlaylists.map(playlist => checkAndRefreshMetadata(playlist)));

        const defaultPlaylistArr = defaultPlaylistMetadata.getAll(filter);
        if (!defaultPlaylistArr.length) {
            return getFallbackTrack();
        }

        return defaultPlaylistArr[getRandomNumber(0, defaultPlaylistArr.length - 1)];
    } catch (error) {
        logger.error('Error in emptySongQueueHandler:', error);
        return getFallbackTrack();
    }
}

const createTrackResponse = (song, cachedPath = null) => {
    return {
        url: cachedPath || song.url,
        title: song.title,
        duration: song.duration,
        requestedBy: song.requestedBy,
        urlType: song.urlType
    };
}

/**
 * @description Download song from youtube
 * @param {*} songData 
 * @returns 
 */
const downloadFromYoutube = async (songData) => {
    const yt = new MyDownloader();
    const { url } = await yt.downloadVideo(songData.url, songData.title);
    return { url: url, title: songData.title };
}

/**
 * @description Download song from jiosaavn, just return the url.
 * @param {*} songData 
 * @returns 
 */
const downloadFromJioSaavn = async (songData) => {
    const yt = new MyDownloader();
    const { url } = await yt.downloadJioSaavn(songData.url, songData.title);
    return { url: url, title: songData.title };
}

/**
 * @description Download song from jiosaavn, just return the url.
 * @param {*} songData 
 * @returns 
 */
const downloadFromSoundCloud = async (songData) => {
    const yt = new MyDownloader();
    const { url } = await yt.downloadSoundCloud(songData.url, songData.title);
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
        case 'jiosaavn':
            return await downloadFromJioSaavn(songData);
        case 'soundcloud':
            return await downloadFromSoundCloud(songData);
        case 'fallback':
            return { url: songData.url, title: songData.title };
        default:
            throw new Error(`Unsupported URL type: ${songData.urlType}`);
    }
}

/**
 * @description Next song Fetch Logic
 * @returns 
 */
export const fetchNextTrack = async (channelId = 'default', genre = 'all') => {
    const songQueue = new SongQueueManager();
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const tryFetchTrack = async () => {
        try {
            const currentTrack = songQueue.getFirstFromQueue();
            let songResult;

            const trackToProcess = currentTrack ?? await emptySongQueueHandler();

            const cachedPath = cacheManager.getFromCache(trackToProcess.title);
            if (cachedPath) {
                logger.info(`Using cached version of: ${trackToProcess.title}`);
                if (currentTrack) songQueue.removeFromFront();
                return createTrackResponse(trackToProcess, cachedPath);
            }

            songResult = await fetchByUrlType(trackToProcess);
            if (currentTrack) songQueue.removeFromFront();
            return createTrackResponse({
                ...songResult,
                requestedBy: trackToProcess.requestedBy,
                duration: trackToProcess.duration,
                urlType: trackToProcess.urlType
            });

        } catch (error) {
            const errorInfo = {
                message: error.message,
                code: error.code,
                retry: retryCount + 1
            };
            logger.error('Error fetching track:', errorInfo);

            songQueue.removeFromFront();
            retryCount++;

            if (retryCount >= MAX_RETRIES) {
                throw new Error(`Failed to fetch track after ${MAX_RETRIES} attempts`);
            }

            return tryFetchTrack();
        }
    };

    return tryFetchTrack();
}
