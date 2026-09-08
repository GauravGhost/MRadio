import JioSaavn from "../lib/jiosaavn.js";
import SoundCloud from "../lib/soundcloud.js";
import SpotifyAPI from "../lib/spotify.js";
import Yts from "../lib/yts.js";
import { addYoutubeVideoId, checkSimilarity, durationFormatter } from "../utils/utils.js";
import logger from "../utils/logger.js";

/**
 * @description Search song on spotify
 * @param {*} songName 
 * @returns 
 */
const searchSpotifySong = async (songName) => {
    try {
        const spotify = new SpotifyAPI();
        const songDetail = await spotify.searchTrack(songName);
        if (!songDetail) {
            throw new Error("No Song found By this Name");
        }

        if (!songDetail.name) {
            throw new Error("Invalid song name");
        }
        // Using searchQuery (title + artist)
        return { name: songDetail.searchQuery, id: songDetail.id };
    } catch (error) {
        logger.error("Spotify search error:", error);
        return null;
    }
};

/**
 * @description Search song on JioSaavn
 * @param {*} spotifyName 
 * @returns 
 */
const searchJioSaavnSong = async (spotifyName) => {
    try {
        const jio = new JioSaavn();
        const song = await jio.getSongBySongName(spotifyName);
        return song;
    } catch (error) {
        logger.error("JioSaavn search error:", error);
        return null;
    }
};

/**
 * @description Search song on JioSaavn
 * @param {*} spotifyName 
 * @returns 
 */
const searchSoundCloudSong = async (spotifyName) => {
    try {
        const soundCloud = new SoundCloud();
        const song = await soundCloud.getSongBySongName(spotifyName);
        return song;
    } catch (error) {
        logger.error("SoundCloud search error:", error);
        return null;
    }
};

/**
 * @description Search Song on Youtube
 */
export const searchYouTubeSong = async (spotifyName) => {
    try {
        const yt = new Yts();
        const videoDetail = await yt.getVideoDetail(spotifyName);

        if (!videoDetail) {
            return null;
        }

        const { url, title, timestamp } = videoDetail;

        // Validate the video (this now handles availability checking internally without cookies)
        const { status, message } = await yt.validateVideo(url);

        if (!status) {
            // Log the validation error but don't fail completely
            // Some videos might have format issues but still be playable
            console.warn(`YouTube video validation failed: ${message} - ${title}`);

            // For format-related errors, we'll still return the video but mark it as potentially problematic
            if (message.includes('Requested format is not available') ||
                message.includes('format')) {
                console.info(`Accepting video despite format issues: ${title}`);
                return { url, title, duration: timestamp, formatWarning: true };
            }

            // For other validation errors (duration, category), don't use this video
            return null;
        }

        return { url, title, duration: timestamp };
    } catch (error) {
        logger.error("YouTube search error:", error);
        return null;
    }
};

// Create metadata object
/**
 * @description Create Initial metadata object.
 * @param {*} originalName 
 * @param {*} spotifyName 
 * @param {*} requestedBy 
 * @returns 
 */
const createMetadata = (originalName, spotifyName, requestedBy) => ({
    title: '',
    url: '',
    urlType: '',
    duration: '',
    originalName,
    spotifyName,
    requestedBy
});

/**
 * @description Update the metadata object.
 * @param {*} metadata 
 * @param {*} type 
 * @param {*} title 
 * @param {*} url 
 * @param {*} duration 
 * @returns 
 */
const updateMetadata = (metadata, type, title, url, duration) => {
    checkSimilarity(metadata.originalName, title);
    return {
        ...metadata,
        title,
        url,
        urlType: type,
        duration: durationFormatter(duration)
    };
};

/**
 * @description Main function to generate single song metadata
 * @param {*} songName 
 * @param {*} requestedBy 
 * @returns 
 */
export const generateSongMetadata = async (songName, requestedBy, force = false, preference = null) => {
    try {
        let searchName = songName;

        // If not forced, try Spotify first to normalize track title and artist
        if (!force) {
            try {
                const spotifyResult = await searchSpotifySong(songName);
                if (spotifyResult?.name) {
                    searchName = spotifyResult.name;
                }
            } catch (err) {
                console.warn(`[metadataFetcher] Spotify normalization skipped for "${songName}":`, err?.message);
            }
        }

        const metadata = createMetadata(songName, searchName, requestedBy);

        // If preference is provided, search preferred platform first
        if (preference) {
            switch (preference.toLowerCase()) {
                case 'soundcloud': {
                    const soundCloudResult = await searchSoundCloudSong(searchName);
                    if (soundCloudResult) {
                        return updateMetadata(metadata, "soundcloud", soundCloudResult.title, soundCloudResult.url, soundCloudResult.duration);
                    }
                    if (force) throw new Error("Song not found on SoundCloud");
                    break;
                }

                case 'jiosaavn': {
                    const jioSaavnResult = await searchJioSaavnSong(searchName);
                    if (jioSaavnResult) {
                        return updateMetadata(metadata, "jiosaavn", jioSaavnResult.title, jioSaavnResult.url, jioSaavnResult.duration);
                    }
                    if (force) throw new Error("Song not found on JioSaavn");
                    break;
                }

                case 'youtube': {
                    const youtubeResult = await searchYouTubeSong(searchName);
                    if (youtubeResult) {
                        return updateMetadata(metadata, "youtube", youtubeResult.title, youtubeResult.url, youtubeResult.duration);
                    }
                    if (force) throw new Error("Song not found on YouTube");
                    break;
                }

                default:
                    if (force) throw new Error("Invalid platform preference");
            }
        }

        // Search across platforms in order
        const soundCloudResult = await searchSoundCloudSong(searchName);
        if (soundCloudResult) {
            return updateMetadata(metadata, "soundcloud", soundCloudResult.title, soundCloudResult.url, soundCloudResult.duration);
        }

        const jioSaavnResult = await searchJioSaavnSong(searchName);
        if (jioSaavnResult) {
            return updateMetadata(metadata, "jiosaavn", jioSaavnResult.title, jioSaavnResult.url, jioSaavnResult.duration);
        }

        const youtubeResult = await searchYouTubeSong(searchName);
        if (youtubeResult) {
            return updateMetadata(metadata, "youtube", youtubeResult.title, youtubeResult.url, youtubeResult.duration);
        }

        throw new Error("Song not found on any platform");
    } catch (error) {
        console.error("Error generating metadata:", {
            error: error.message,
            songName,
            requestedBy,
            force,
            preference
        });
        throw new Error(error.message || "Failed to generate song metadata");
    }
};

export const searchYoutubePlaylist = async (playlistId, requestedBy) => {
    let cleanId = String(playlistId || "").trim();
    if (cleanId.includes("list=")) {
        try {
            const parsed = new URL(cleanId.startsWith("http") ? cleanId : `https://${cleanId}`);
            cleanId = parsed.searchParams.get("list") || cleanId;
        } catch {
            // Keep cleanId as is
        }
    }
    const yts = new Yts();
    const playlistArray = await yts.getPlaylistDetail(cleanId);
    if (!playlistArray || !Array.isArray(playlistArray) || playlistArray.length === 0) {
        throw new Error("No videos found in YouTube playlist or playlist is private.");
    }
    const playListMetadata = playlistArray
        .filter((video) => video.duration?.seconds <= 900)
        .map((video) => ({
            title: video.title,
            duration: durationFormatter(video.duration?.timestamp),
            requestedBy: requestedBy,
            url: addYoutubeVideoId(video.videoId),
            urlType: "youtube"
        }));
    return playListMetadata;
}

export const searchJioSaavnPlaylist = async (playlistId, requestedBy) => {
    let cleanId = String(playlistId || "").trim();
    const match = cleanId.match(/(\d{5,})/);
    if (match) {
        cleanId = match[1];
    }
    const jio = new JioSaavn();
    const playlistArray = await jio.getPlaylistDetail(cleanId);
    if (!playlistArray || !Array.isArray(playlistArray) || playlistArray.length === 0) {
        throw new Error("Could not find songs in JioSaavn playlist. Please check the playlist ID or link.");
    }
    const playlistMetadata = playlistArray
        .filter((audio) => (audio.more_info?.duration || 0) <= 900)
        .map((audio) => ({
            title: audio.title,
            duration: durationFormatter(audio.more_info?.duration),
            requestedBy: requestedBy,
            url: audio.more_info?.encrypted_media_url,
            urlType: "jiosaavn"
        }));
    return playlistMetadata;
}

export const searchSpotifyPlaylist = async (playlistId, requestedBy) => {
    let cleanId = String(playlistId || "").trim();
    const spotify = new SpotifyAPI();
    const { id } = spotify.extractIdAndType(cleanId);
    cleanId = id || cleanId;

    const tracks = await spotify.getsongsByPlaylist(cleanId);
    if (!tracks || tracks.length === 0) {
        throw new Error("No videos found in Spotify playlist.");
    }

    // We return the searchQuery as the originalName so the queue manager will process it 
    // and resolve it via YouTube/SoundCloud when it plays.
    return tracks
        .filter((track) => track.duration <= 900)
        .map((track) => ({
            title: track.searchQuery,
            duration: durationFormatter(track.duration),
            requestedBy: requestedBy,
            url: '', // Will be resolved at playback time
            urlType: "spotify",
            originalName: track.searchQuery
        }));
}

/**
 * @description Main function to generate playlist metadata
 * @param {*} playlistId 
 * @param {*} sourceName 
 * @returns 
 */
export const generatePlaylistMetadata = async (playlistId, sourceName, requestedBy) => {
    if (!sourceName || !playlistId) {
        throw new Error("Invalid playlist parameters: playlistId and source are required");
    }
    const normalizedSource = String(sourceName).toLowerCase().trim();
    switch (normalizedSource) {
        case "youtube":
            return await searchYoutubePlaylist(playlistId, requestedBy);
        case "jiosaavn":
            return await searchJioSaavnPlaylist(playlistId, requestedBy);
        case "spotify":
            return await searchSpotifyPlaylist(playlistId, requestedBy);
        case "soundcloud":
            throw new Error("SoundCloud playlists are not supported directly. Please use YouTube or JioSaavn.");
        default:
            throw new Error(`Unsupported playlist source "${sourceName}". Supported sources are: YouTube, JioSaavn, Spotify.`);
    }
}
