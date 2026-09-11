import dotenv from 'dotenv';
dotenv.config();

export default {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    FFMPEG_ENV: process.env.FFMPEG_ENV ?? "development",

    SPOTIFY_CLIEND_ID: process.env.SPOTIFY_CLIEND_ID,
    SPOTIFY_CLIEND_SECRET_ID: process.env.SPOTIFY_CLIEND_SECRET_ID,
    SOUNDCLOUD_API_KEY: process.env.SOUNDCLOUD_API_KEY,

    X_ADMIN_API_KEY: process.env.X_ADMIN_API_KEY,
    X_ADMIN_TOKEN_KEY: process.env.X_ADMIN_TOKEN_KEY,

    INITIAL_PLAYLIST_ID: process.env.INITIAL_PLAYLIST_ID,
    INITIAL_PLAYLIST_SOURCE: process.env.INITIAL_PLAYLIST_SOURCE,
    INITIAL_PLAYLIST_TITLE: process.env.INITIAL_PLAYLIST_TITLE,

    // Icecast Configuration
    ICECAST_HOST: process.env.ICECAST_HOST,
    ICECAST_PORT: process.env.ICECAST_PORT,
    ICECAST_PASSWORD: process.env.ICECAST_PASSWORD,
    ICECAST_BITRATE: process.env.ICECAST_BITRATE || '128'
}
