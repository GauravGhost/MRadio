import axios from 'axios';
import logger from '../utils/logger.js';
import { checkSimilarity, isCleanMatch } from '../utils/utils.js';
import { GANAA_SEARCH_SONGS_URL, GANAA_SONG_DETAILS_URL, GANAA_PLAYLIST_DETAILS_URL, GANAA_REQUEST_HEADERS } from '../utils/constant.js';
import { decryptGaanaLink } from '../utils/crypto.js';

const MAX_SONG_DURATION_SECONDS = 600;

class Gaana {
    /**
     * @description Performs a POST against Gaana's apiv2 endpoints, never throws.
     * @param {string} url
     * @returns {Promise<object|null>}
     */
    async request(url) {
        try {
            const response = await axios.post(url, null, { headers: GANAA_REQUEST_HEADERS, timeout: 30000 });
            if (!response.data || typeof response.data !== 'object') return null;
            return response.data;
        } catch (error) {
            logger.error(`Gaana request failed: ${error.message}`);
            return null;
        }
    }

    /**
     * @description Extracts the decrypted stream urls for a track.
     * @param {object} urls
     * @returns {{ veryHighQuality: string, highQuality: string, mediumQuality: string, lowQuality: string }}
     */
    extractStreamUrls(urls = {}) {
        const empty = { veryHighQuality: '', highQuality: '', mediumQuality: '', lowQuality: '' };
        const message = urls?.medium?.message;
        if (!message) return empty;

        const baseUrl = decryptGaanaLink(message);
        if (!baseUrl) return empty;

        return {
            veryHighQuality: baseUrl.replace('64.mp4', '320.mp4'),
            highQuality: baseUrl.replace('64.mp4', '128.mp4'),
            mediumQuality: baseUrl,
            lowQuality: baseUrl.replace('64.mp4', '16.mp4')
        };
    }

    /**
     * @description Formats a raw Gaana track payload into a normalized object.
     * @param {object} results
     * @returns {object}
     */
    formatSong(results) {
        const artists = (results.artist || []).map(a => a?.name).filter(Boolean).join(', ');
        const genres = (results.gener || []).map(g => g?.name).filter(Boolean).join(', ');

        return {
            seokey: results.seokey,
            title: results.track_title || '',
            artists,
            album: results.album_title || '',
            duration: results.duration || '',
            language: results.language || '',
            genres,
            isExplicit: results.parental_warning === 1,
            streamUrls: this.extractStreamUrls(results.urls)
        };
    }

    /**
     * @description Fetches full details for a list of seokeys.
     * @param {string[]} seokeys
     * @returns {Promise<object[]>}
     */
    async getTrackInfo(seokeys = []) {
        if (!seokeys.length) return [];

        const responses = await Promise.all(
            seokeys.map(seokey => this.request(GANAA_SONG_DETAILS_URL(seokey)))
        );

        const tracks = [];
        for (const response of responses) {
            const list = response?.tracks;
            if (!Array.isArray(list)) continue;
            for (const track of list) {
                if (!track?.seokey) continue;
                tracks.push(this.formatSong(track));
            }
        }

        return tracks;
    }

    /**
     * @description Searches Gaana and resolves each hit to a full track payload.
     * @param {string} query
     * @param {number} limit
     * @returns {Promise<object[]>}
     */
    async searchSongs(query, limit = 5) {
        const result = await this.request(GANAA_SEARCH_SONGS_URL(query));
        const searchResults = result?.gr?.[0]?.gd;
        if (!Array.isArray(searchResults) || searchResults.length === 0) return [];

        const seokeys = searchResults
            .slice(0, limit)
            .map(item => item?.seo)
            .filter(Boolean);

        if (!seokeys.length) return [];
        return await this.getTrackInfo(seokeys);
    }

    /**
     * @description Search a song on Gaana and return the best matching result.
     * @param {string} songName
     * @param {number} limit
     * @returns {Promise<{ title: string, url: string, duration: string } | undefined>}
     */
    async getSongBySongName(songName, limit = 5) {
        try {
            const results = await this.searchSongs(songName, limit);
            if (results.length === 0) return;

            const cleanResults = results.filter(track => isCleanMatch(songName, track.title));
            const resultsToSearch = cleanResults.length > 0 ? cleanResults : results;

            const match = resultsToSearch.find(track => checkSimilarity(songName, track.title) > 60) || resultsToSearch[0];
            if (!match) return;

            if (Number(match.duration) > MAX_SONG_DURATION_SECONDS) {
                throw new Error("Song Duration is more than 10 minutes.");
            }

            const url = match.streamUrls.highQuality || match.streamUrls.mediumQuality;
            if (!url) return;

            return {
                title: match.title,
                url,
                duration: match.duration
            };
        } catch (error) {
            logger.error(`Gaana search error: ${error.message}`);
            return;
        }
    }

    /**
     * @description Fetches every track of a Gaana playlist.
     * @param {string} playlistId The playlist seokey.
     * @returns {Promise<object[]>}
     */
    async getPlaylistDetail(playlistId) {
        const result = await this.request(GANAA_PLAYLIST_DETAILS_URL(playlistId));
        const trackCount = Number(result?.count);
        if (!trackCount || !Array.isArray(result?.tracks)) return [];

        const seokeys = result.tracks
            .slice(0, trackCount)
            .map(track => track?.seokey)
            .filter(Boolean);

        if (!seokeys.length) return [];
        return await this.getTrackInfo(seokeys);
    }
}

export default Gaana;
