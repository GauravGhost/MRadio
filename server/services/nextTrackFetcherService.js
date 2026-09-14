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

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

const isMetadataStale = (playlist) => {
    const metadataDate = new Date(playlist.metadataUpdatedAt);
    if (Number.isNaN(metadataDate.getTime())) {
        return true;
    }
    return Date.now() - metadataDate.getTime() > TWO_DAYS_MS;
}

let refreshChain = Promise.resolve();
const inFlightRefreshes = new Map();

const checkAndRefreshMetadata = async (playlist) => {
    if (!isMetadataStale(playlist)) {
        return;
    }

    const inFlight = inFlightRefreshes.get(playlist.playlistId);
    if (inFlight) {
        return inFlight;
    }

    const refreshTask = refreshChain
        .catch(() => {})
        .then(async () => {
            logger.info("Updating the metadata for : " + playlist.title);
            const apiService = new Service();
            await apiService.refreshDefaultPlaylist({ playlistId: playlist.playlistId });
        })
        .catch((error) => {
            logger.warn("Failed to refresh default playlist metadata:", {
                playlistId: playlist.playlistId,
                message: error.message
            });
        })
        .finally(() => {
            inFlightRefreshes.delete(playlist.playlistId);
        });

    refreshChain = refreshTask;
    inFlightRefreshes.set(playlist.playlistId, refreshTask);

    return refreshTask;
}

const emptySongQueueHandler = async (channelId) => {
    try {
        const defaultPlaylistStore = new DefaultPlaylistManager();

        const allPlaylists = defaultPlaylistStore.getAll()
            .map((playlist, index) => ({ ...playlist, index: index + 1 }));
        const channelPlaylists = allPlaylists.filter(p => p.channelId === channelId);
       
        const hasOwnPlaylists = channelPlaylists.length > 0;

        let genre = "all";
        if (!hasOwnPlaylists) {
            genre = await commonConfigService.get(COMMON_CONFIG_KEYS.defaultPlaylistGenre);
        }

        const activePlaylists = (hasOwnPlaylists ? channelPlaylists : allPlaylists)
            .filter(p => hasOwnPlaylists
                ? p.channelId === channelId && p.isActive
                : !p.channelId && p.isActive && (genre === "all" || p.genre === genre));

        for (const playlist of activePlaylists) {
            await checkAndRefreshMetadata(playlist);
        }

        const filter = {
            isActive: true,
            genre: genre === "all" ? undefined : genre,
            channelId: hasOwnPlaylists ? channelId : null,
        };

        // Read after the refresh so any regenerated metadata is picked up immediately.
        const defaultPlaylistMetadata = new DefaultPlaylistMetadataManager();
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
 * @description Download song from soundcloud, just return the url.
 * @param {*} songData 
 * @returns 
 */
const downloadFromSoundCloud = async (songData) => {
    const yt = new MyDownloader();
    const { url } = await yt.downloadSoundCloud(songData.url, songData.title);
    return { url: url, title: songData.title };
}

/**
 * @description Download song from gaana, just return the url.
 * @param {*} songData 
 * @returns 
 */
const downloadFromGaana = async (songData) => {
    const yt = new MyDownloader();
    const { url } = await yt.downloadGaana(songData.url, songData.title);
    return { url: url, title: songData.title };
}

/**
 * @description Fetching song file by the source type.
 * @param {*} songData 
 * @returns 
 */
const fetchByUrlType = async (songData) => {
    if (songData.urlType !== 'fallback' && !commonConfigService.isSourceEnabled(songData.urlType, 'download')) {
        throw new Error(`Download source '${songData.urlType}' is disabled`);
    }

    switch (songData.urlType) {
        case 'youtube':
            return await downloadFromYoutube(songData);
        case 'jiosaavn':
            return await downloadFromJioSaavn(songData);
        case 'soundcloud':
            return await downloadFromSoundCloud(songData);
        case 'gaana':
            return await downloadFromGaana(songData);
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
export const fetchNextTrack = async (channelId, genre = 'all') => {
    const songQueue = new SongQueueManager(channelId);
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const tryFetchTrack = async () => {
        try {
            const currentTrack = songQueue.getFirstFromQueue();
            let songResult;

            const trackToProcess = currentTrack ?? await emptySongQueueHandler(channelId);

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
