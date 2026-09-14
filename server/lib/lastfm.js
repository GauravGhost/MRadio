import axios from 'axios';
import { LASTFM_API_URL, LASTFM_SEARCH_LIMIT } from '../utils/constant.js';
import { checkSimilarity, isCleanMatch } from '../utils/utils.js';
import logger from '../utils/logger.js';
import secret from '../utils/secret.js';

const SIMILARITY_THRESHOLD = 60;
const POPULARITY_FLOOR = 100000;
const ARTIST_SPLIT_PATTERN = /,|&|feat\.?|ft\.?/i;
const BRACKETED_SEGMENT_PATTERN = /\([^)]*\)|\[[^\]]*\]/g;

const normalizeText = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const artistParts = (artist) =>
    (artist || '').split(ARTIST_SPLIT_PATTERN).map(normalizeText).filter(Boolean);

const removeArtistMentions = (text, artist) =>
    artistParts(artist).reduce(
        (acc, part) => acc.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' '),
        normalizeText(text)
    ).replace(/\s+/g, ' ').trim();

class LastfmAPI {
    constructor() {
        this.apiKey = secret.LASTFM_API_KEY;
    }

    formatTrack(track, { title, artist } = {}) {
        if (!track) return null;
        const finalTitle = title || track.name || 'Unknown Title';
        const finalArtist = artist || track.artist || 'Unknown Artist';

        return {
            title: finalTitle,
            artist: finalArtist,
            name: finalTitle,
            url: track.url,
            listeners: Number(track.listeners) || 0,
            platform: 'lastfm',
            type: 'track',
            mbid: track.mbid,
            searchQuery: `${finalTitle} ${finalArtist}`.trim()
        };
    }

    /**
     * @description Prefers the artist the user named, otherwise the first credited artist.
     * @param {string} query
     * @param {string} artist
     * @returns {string}
     */
    pickArtist(query, artist) {
        const parts = (artist || '').split(ARTIST_SPLIT_PATTERN).map(part => part.trim()).filter(Boolean);
        const mentioned = parts.find(part => normalizeText(query).includes(normalizeText(part)));
        return mentioned || parts[0] || 'Unknown Artist';
    }

    /**
     * @description Picks the most reliable match among Last.fm's loose results.
     * @param {string} query
     * @param {object[]} tracks
     * @returns {object|null}
     */
    selectBestMatch(query, tracks) {
        const candidates = tracks
            .filter(track => track?.name && isCleanMatch(query, track.name))
            .map(track => {
                const artist = track.artist || '';
                const candidatesTitle = normalizeText(track.name.replace(BRACKETED_SEGMENT_PATTERN, ' '));
                const queryTitle = removeArtistMentions(query, artist);
                return {
                    track,
                    titleSimilarity: checkSimilarity(queryTitle, candidatesTitle),
                    listeners: Number(track.listeners) || 0,
                    artistMentioned: artistParts(artist).some(part => normalizeText(query).includes(part))
                };
            })
            .filter(candidate => candidate.titleSimilarity > SIMILARITY_THRESHOLD);

        const mentioned = candidates.filter(candidate => candidate.artistMentioned);
        const pool = mentioned.length
            ? mentioned
            : candidates.filter(candidate => candidate.listeners >= POPULARITY_FLOOR);

        if (!pool.length) return null;
        pool.sort((a, b) => b.listeners - a.listeners);

        const winner = pool[0].track;
        const title = winner.name.replace(BRACKETED_SEGMENT_PATTERN, ' ').replace(/\s+/g, ' ').trim();
        return this.formatTrack(winner, { title, artist: this.pickArtist(query, winner.artist) });
    }

    /**
     * @description Searches Last.fm for a track and returns the best matching result.
     * @param {string} query
     * @param {number} limit
     * @returns {Promise<object|null>}
     */
    async searchTrack(query, limit = LASTFM_SEARCH_LIMIT) {
        try {
            const response = await axios.get(LASTFM_API_URL, {
                params: {
                    method: 'track.search',
                    track: query,
                    api_key: this.apiKey,
                    format: 'json',
                    limit
                },
                timeout: 30000
            });

            const tracks = response.data?.results?.trackmatches?.track;
            if (!Array.isArray(tracks) || tracks.length === 0) {
                return null;
            }

            return this.selectBestMatch(query, tracks);
        } catch (error) {
            logger.error(`Error searching for track on Last.fm: ${error.message}`);
            throw error;
        }
    }
}

export default LastfmAPI;
