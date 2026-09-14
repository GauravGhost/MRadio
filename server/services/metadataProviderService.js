import SpotifyAPI from "../lib/spotify.js";
import LastfmAPI from "../lib/lastfm.js";
import { DEFAULT_METADATA_PROVIDER_CONFIG } from "../utils/constant.js";
import secret from "../utils/secret.js";
import commonConfigService from "./commonConfigService.js";
import logger from "../utils/logger.js";

const PROVIDERS = {
    spotify: {
        isConfigured: () => Boolean(secret.SPOTIFY_CLIEND_ID && secret.SPOTIFY_CLIEND_SECRET_ID),
        async fetch(query) {
            const spotify = new SpotifyAPI();
            const track = await spotify.searchTrack(query);
            if (!track?.searchQuery) {
                return null;
            }
            return {
                searchQuery: track.searchQuery,
                title: track.name,
                artist: track.artist,
                provider: "spotify"
            };
        }
    },
    lastfm: {
        isConfigured: () => Boolean(secret.LASTFM_API_KEY),
        async fetch(query) {
            const lastfm = new LastfmAPI();
            const track = await lastfm.searchTrack(query);
            if (!track?.searchQuery) {
                return null;
            }
            return {
                searchQuery: track.searchQuery,
                title: track.name,
                artist: track.artist,
                provider: "lastfm"
            };
        }
    }
};

export const getEnabledProviders = () =>
    Object.keys(DEFAULT_METADATA_PROVIDER_CONFIG)
        .filter((id) => commonConfigService.isMetadataProviderEnabled(id))
        .filter((id) => PROVIDERS[id]?.isConfigured());

export const normalizeSongQuery = async (query) => {
    for (const id of getEnabledProviders()) {
        try {
            const match = await PROVIDERS[id].fetch(query);
            if (match?.searchQuery) {
                return match;
            }
        } catch (error) {
            logger.warn(`Metadata provider '${id}' failed; trying next`, { error: error.message });
        }
    }
    return null;
};

export default { normalizeSongQuery, getEnabledProviders, PROVIDERS };
