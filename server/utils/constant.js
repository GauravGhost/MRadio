import secret from "./secret.js";

export const AUTH_TOKEN_LOCATION = "config/authToken.json";

export const TOKEN_ROLES = {
    ADMIN: "admin",
    USER: "user"
};
export const DEFAULT_TOKEN_ROLE = TOKEN_ROLES.USER;
export const MAIN_CHANNEL_ID = "main";

export const DEFAULT_CACHE_LOCATION = "cache";

export const DEFAULT_TRACKS_LOCATION = "media/tracks";
export const DEFAULT_FALLBACK_LOCATION = "media/fallback";

export const SONG_QUEUE_LOCATION = "data/queue.json";
export const PLAYBACK_STATE_LOCATION = "data/playbackState";
export const BLOCK_LIST_LOCATION = "data/blockList.json";
export const DEFAULT_PLAYLIST_LOCATION = "data/defaultSongPlaylist.json";
export const DEFAULT_PLAYLIST_METADATA_LOCATION = "data/defaultPlaylistMetadata.json";
export const COMMON_CONFIG_LOCATION = "data/commonConfig.json";

export const DEFAULT_QUEUE_SIZE = process.env.QUEUE_BUFFER_SIZE ? parseInt(process.env.QUEUE_BUFFER_SIZE, 10) : 2;
export const SONG_METADATA_UPDATE_TIME = 2 * 24 * 60 * 60 * 1000; // 2 days
export const CACHE_SIZE = 1024 * 1024 * 1024; // 1 GB


export const RESUME_MAX_GAP_MS = (process.env.RESUME_MAX_GAP_SECONDS ? parseInt(process.env.RESUME_MAX_GAP_SECONDS, 10) : 180) * 1000;
export const RESUME_MIN_REMAINING_SECONDS = 5;

export const COMMON_CONFIG_KEYS = {
    defaultPlaylistGenre: "defaultPlaylistGenre",
};

export const STREAM_MEDIA_TYPE = {
    youtube: "youtube",
    jiosaavn: "jiosaavn",
    soundcloud: "soundcloud"
}

export const JIO_SAAVN_SONG_SEARCH = (songName) => `https://www.jiosaavn.com/api.php?p=1&q=${songName}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=1&__call=search.getResults`
export const JIO_SAAVN_PLAYLIST_SEARCH = (playlistId) => `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&listid=${playlistId}&api_version=4&_format=json&_marker=0&ctx=web6dot0`

export const DEFAULT_PLAYLIST_SEED_DATA = () => {
    const id = secret.INITIAL_PLAYLIST_ID;
    const source = secret.INITIAL_PLAYLIST_SOURCE;
    const title = secret.INITIAL_PLAYLIST_TITLE;
    if (!id || !source || !title) {
        return [{
            playlistId: "1134543272",
            title: "Top 50 Songs",
            source: "jiosaavn",
            isActive: true,
            genre: "mix",
        }];
    }
    return [{
        playlistId: secret.INITIAL_PLAYLIST_ID,
        title: secret.INITIAL_PLAYLIST_TITLE,
        source: secret.INITIAL_PLAYLIST_SOURCE,
        isActive: true,
        genre: "mix",
    }]
}
