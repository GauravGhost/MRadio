import { getCookiesPath } from './utils.js';
import fs from 'fs';

/**
 * Returns advanced yt-dlp options, including the iOS client fallback 
 */
export function getYtDlpOptions(extraOptions = {}) {
    const baseOptions = {
        noCheckCertificates: true,
        noWarnings: true,
        noCallHome: true,
        retries: 3,
        fragmentRetries: 3,
        // Using iOS client helps bypass 'Sign in to confirm you are not a bot'
        extractorArgs: 'youtube:player_client=ios',
        ...extraOptions
    };

    // Check if we have cookies
    const cookiesPath = getCookiesPath();
    if (fs.existsSync(cookiesPath)) {
        const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
        const cookieLines = cookiesContent.split('\n').filter(line => 
            line.trim() && !line.startsWith('#') && line.includes('.youtube.com')
        );

        if (cookieLines.length > 0) {
            baseOptions.cookies = cookiesPath;
        }
    }

    return baseOptions;
}
