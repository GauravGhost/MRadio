import ytdl from 'youtube-dl-exec';
import yts from 'yt-search'
import logger from '../utils/logger.js';
import { checkSimilarity, getCookiesPath } from '../utils/utils.js';

class Yts {
    async getVideoDetail(name, artistName) {
        try {
            const query = artistName ? `${name} - ${artistName} official audio song music` : `${name} official audio song music`;
            const r = await yts({ query, category: 'music' });
            if (!r?.videos || r.videos.length === 0) {
                return;
            }

            const result = r.videos.find(track => checkSimilarity(name, track.title) > 60) || r.videos[0];
            return result;
        } catch (error) {
            logger.error("Error getting details: " + error.message);
            return;
        }
    }

    async getVideoDetailByUrl(videoId) {
        try {
            const r = await yts({ videoId: videoId });
            if (r.videos?.length === 0) {
                return;
            }
            return r;
        } catch (error) {
            logger.error("Error getting details: " + error.message);
            throw error;
        }
    }

    async validateVideo(url) {
        try {
            const fs = (await import('fs')).default;
            const cookiesPath = getCookiesPath();
            
            // Check if cookies file exists
            const hasCookies = fs.existsSync(cookiesPath);
            let cookiesContent = '';
            let validCookieLines = 0;
            
            if (hasCookies) {
                cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
                const cookieLines = cookiesContent.split('\n').filter(line => 
                    line.trim() && !line.startsWith('#') && line.includes('.youtube.com')
                );
                validCookieLines = cookieLines.length;
            }

            // Try different extraction methods in order of preference
            const extractionMethods = [
                // Method 1: Without cookies (often works better)
                {
                    name: 'without cookies',
                    options: {
                        dumpSingleJson: true,
                        noWarnings: true,
                        noCallHome: true,
                        noCheckCertificate: true,
                        ignoreErrors: true
                    }
                },
                // Method 2: With cookies (if available)
                ...(hasCookies && validCookieLines > 0 ? [{
                    name: 'with cookies',
                    options: {
                        dumpSingleJson: true,
                        noWarnings: true,
                        noCallHome: true,
                        noCheckCertificate: true,
                        cookies: cookiesPath,
                        ignoreErrors: true
                    }
                }] : []),
                // Method 3: With cookies and specific format
                ...(hasCookies && validCookieLines > 0 ? [{
                    name: 'with cookies and audio format',
                    options: {
                        dumpSingleJson: true,
                        noWarnings: true,
                        noCallHome: true,
                        noCheckCertificate: true,
                        cookies: cookiesPath,
                        format: 'bestaudio[ext=m4a]/bestaudio/worst',
                        ignoreErrors: true
                    }
                }] : [])
            ];

            let info = null;
            let usedMethod = null;

            // Try each extraction method
            for (const method of extractionMethods) {
                try {
                    logger.info(`Trying video extraction ${method.name} for ${url}`);
                    info = await ytdl(url, method.options);
                    usedMethod = method.name;
                    logger.info(`Successfully extracted video info using ${method.name}`);
                    break;
                } catch (error) {
                    logger.warn(`Video extraction failed using ${method.name}: ${error.message}`);
                    continue;
                }
            }

            // If all methods failed, return error
            if (!info?.duration) {
                return { 
                    status: false, 
                    message: 'Unable to extract video information. The video might be private, unavailable, or region-locked.'
                };
            }

            const duration = parseInt(info.duration);

            if (duration > 600) {
                return { status: false, message: 'Video duration exceeds 10 minutes' };
            }

            const categories = info.categories || [];
            const tags = info.tags || [];
            const isMusicCategory =
                categories.some(cat => cat.toLowerCase().includes('music')) ||
                tags.some(tag => tag.toLowerCase().includes('music')) ||
                Boolean(info.track || info.artist);

            // Allow if under 10 minutes even if YouTube uploader used another category (e.g. Entertainment)
            if (!isMusicCategory && duration > 600) {
                return { status: false, message: 'Video duration exceeds limits' };
            }

            return { 
                status: true, 
                message: `Successful (using ${usedMethod})`,
                extractionMethod: usedMethod 
            };
            
        } catch (error) {
            logger.error('Video validation error:', error);
            return { 
                status: false, 
                message: `Video validation error: ${error.message}`
            }
        }
    }
    async getPlaylistDetail(listId) {
        try {
            const r = await yts({ listId });
            if (r.videos?.length === 0) {
                throw new Error('No video found for the given name and artist');
            }

            return r.videos;
        } catch (error) {
            logger.error("Error getting details: " + error.message);
            throw error;
        }
    }

    async checkVideoAvailability(url) {
        try {
            const cookiesPath = getCookiesPath();
            
            // Quick availability check without downloading
            const info = await ytdl(url, {
                dumpSingleJson: true,
                noWarnings: true,
                noCallHome: true,
                cookies: cookiesPath,
                extractFlat: true, // Only get basic info
                ignoreErrors: false
            });
            
            return { available: true, info };
        } catch (error) {
            logger.warn(`Video availability check failed for ${url}:`, error.message);
            return { 
                available: false, 
                error: error.message.includes('Private video') ? 'Video is private' :
                       error.message.includes('unavailable') ? 'Video is unavailable' :
                       error.message.includes('region') ? 'Video is region-locked' :
                       'Video is not accessible'
            };
        }
    }

    async debugVideoFormats(url) {
        try {
            const cookiesPath = getCookiesPath();
            
            // List available formats for debugging
            const formats = await ytdl(url, {
                listFormats: true,
                noWarnings: true,
                cookies: cookiesPath
            });
            
            logger.info(`Available formats for ${url}:`, formats);
            return formats;
        } catch (error) {
            logger.error(`Could not list formats for ${url}:`, error.message);
            return null;
        }
    }
}

export default Yts;
