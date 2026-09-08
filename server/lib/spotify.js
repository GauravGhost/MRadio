import SpotifyWebApi from 'spotify-web-api-node';
import { checkSimilarity } from '../utils/utils.js';
import logger from '../utils/logger.js';
import secret from '../utils/secret.js';

class SpotifyAPI {
    constructor() {
        this.spotifyApi = new SpotifyWebApi({
            clientId: secret.SPOTIFY_CLIEND_ID,
            clientSecret: secret.SPOTIFY_CLIEND_SECRET_ID,
        });
        this.tokenExpiresAt = 0;
    }

    async initializeApi() {
        if (Date.now() >= this.tokenExpiresAt) {
            try {
                logger.info('Refreshing Spotify access token');
                const data = await this.spotifyApi.clientCredentialsGrant();
                this.spotifyApi.setAccessToken(data.body.access_token);
                // Refresh slightly before it expires (data.body.expires_in is in seconds)
                this.tokenExpiresAt = Date.now() + (data.body.expires_in * 1000) - 5000;
            } catch (error) {
                logger.error('Spotify API authentication failed:', error);
                throw new Error('Spotify API authentication failed');
            }
        }
        return this.spotifyApi;
    }

    formatTrack(spotifyTrack) {
        if (!spotifyTrack) return null;
        const artists = spotifyTrack.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist';
        const title = spotifyTrack.name || 'Unknown Title';
        const searchQuery = `${title} ${artists}`;

        return {
            title: title,
            artist: artists,
            album: spotifyTrack.album?.name,
            url: spotifyTrack.external_urls?.spotify,
            duration: Math.floor(spotifyTrack.duration_ms / 1000), // convert to seconds
            thumbnail: spotifyTrack.album?.images?.[0]?.url,
            platform: 'spotify',
            type: 'track',
            id: spotifyTrack.id,
            searchQuery: searchQuery, // Useful for passing to YouTube downloader later
            name: title, // Keeping name for backward compatibility in codebase
        };
    }

    async searchTrack(query) {
        try {
            await this.initializeApi();
            const searchResult = await this.spotifyApi.searchTracks(query, { limit: 10 });

            if (!searchResult.body.tracks?.items || searchResult.body.tracks.items.length === 0) {
                return null;
            }

            // Find best match based on similarity or return the first one
            const foundTrack = searchResult.body.tracks.items.find(track => checkSimilarity(query, track.name) > 60) || searchResult.body.tracks.items[0];

            return this.formatTrack(foundTrack);
        } catch (error) {
            logger.error('Error searching for track:', error);
            throw error;
        }
    }

    async getsongsByPlaylist(playlistId) {
        try {
            await this.initializeApi();
            const playlistInfo = await this.spotifyApi.getPlaylist(playlistId);
            const tracks = [];

            // We can fetch up to 100 tracks easily. For pagination we'd need a loop. 
            // For now, limiting to the first 100 items from the initial payload.
            for (const item of playlistInfo.body.tracks.items) {
                if (item.track && item.track.type === 'track') {
                    const formattedTrack = this.formatTrack(item.track);
                    if (formattedTrack) {
                        tracks.push(formattedTrack);
                    }
                }
            }
            return tracks;
        } catch (error) {
            logger.error(`Error fetching playlist ${playlistId}:`, error);
            throw error;
        }
    }

    async getsongsByAlbum(albumId) {
        try {
            await this.initializeApi();
            const albumInfo = await this.spotifyApi.getAlbum(albumId);
            const tracks = [];

            for (const track of albumInfo.body.tracks.items) {
                // Spotify API doesn't include full album info in album tracks endpoint, inject it
                track.album = {
                    name: albumInfo.body.name,
                    images: albumInfo.body.images,
                };
                const formattedTrack = this.formatTrack(track);
                if (formattedTrack) {
                    tracks.push(formattedTrack);
                }
            }
            return tracks;
        } catch (error) {
            logger.error(`Error fetching album ${albumId}:`, error);
            throw error;
        }
    }

    isSpotifyURL(url) {
        return url.includes('open.spotify.com');
    }

    extractIdAndType(url) {
        const match = url.match(/^https?:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/);
        if (match) {
            return { type: match[1], id: match[2] };
        }
        return { type: null, id: null };
    }
}

export default SpotifyAPI;
