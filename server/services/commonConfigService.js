import { getCommonConfigJson, saveCommonConfigJson, getDefaultPlaylistJson } from "../utils/utils.js";
import { COMMON_CONFIG_KEYS, DEFAULT_SOURCE_CONFIG, SOURCE_CAPABILITIES, DEFAULT_METADATA_PROVIDER_CONFIG } from "../utils/constant.js";
import logger from "../utils/logger.js";

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

class CommonConfigService {
    constructor() {
        this.config = getCommonConfigJson();
        this.normalizeSourceConfig();
        this.normalizeMetadataProviders();
        this.allowedKeys = Object.values(COMMON_CONFIG_KEYS);
        this.validations = this.setupValidations();
    }

    normalizeSourceConfig() {
        const stored = this.config[COMMON_CONFIG_KEYS.sources];
        const normalized = {};
        for (const source of Object.keys(DEFAULT_SOURCE_CONFIG)) {
            const entry = isPlainObject(stored) && isPlainObject(stored[source]) ? stored[source] : {};
            normalized[source] = SOURCE_CAPABILITIES.reduce((acc, capability) => {
                acc[capability] = entry[capability] !== false;
                return acc;
            }, {});
        }
        this.config[COMMON_CONFIG_KEYS.sources] = normalized;
    }

    normalizeMetadataProviders() {
        const stored = this.config[COMMON_CONFIG_KEYS.metadataProviders];
        const normalized = {};
        for (const provider of Object.keys(DEFAULT_METADATA_PROVIDER_CONFIG)) {
            const entry = isPlainObject(stored) && isPlainObject(stored[provider]) ? stored[provider] : {};
            normalized[provider] = {
                enabled: typeof entry.enabled === "boolean"
                    ? entry.enabled
                    : DEFAULT_METADATA_PROVIDER_CONFIG[provider].enabled === true
            };
        }
        this.config[COMMON_CONFIG_KEYS.metadataProviders] = normalized;
    }

    /**
     * @description Check whether a source is enabled for a given capability.
     * Unknown sources/capabilities default to enabled so new integrations keep working.
     * @param {string} source
     * @param {"search"|"download"} capability
     * @returns {boolean}
     */
    isSourceEnabled(source, capability) {
        const entry = this.config?.[COMMON_CONFIG_KEYS.sources]?.[source];
        if (!isPlainObject(entry)) return true;
        return entry[capability] !== false;
    }

    /**
     * @description Check whether a metadata provider is enabled. Providers are opt-in, so
     * unknown/absent providers default to disabled.
     * @param {string} provider
     * @returns {boolean}
     */
    isMetadataProviderEnabled(provider) {
        const entry = this.config?.[COMMON_CONFIG_KEYS.metadataProviders]?.[provider];
        return isPlainObject(entry) && entry.enabled === true;
    }

    setupValidations() {
        const validatePlaylistValue = (value) => value === "all";
        const validSources = Object.keys(DEFAULT_SOURCE_CONFIG);
        const isValidSourceEntry = (entry) => isPlainObject(entry) &&
            Object.entries(entry).every(([capability, enabled]) =>
                SOURCE_CAPABILITIES.includes(capability) && typeof enabled === "boolean"
            );
        const validMetadataProviders = Object.keys(DEFAULT_METADATA_PROVIDER_CONFIG);

        return {
            [COMMON_CONFIG_KEYS.defaultPlaylistGenre]: {
                validate: async (value) => {
                    if (validatePlaylistValue(value)) return true;
                    
                    const playlists = getDefaultPlaylistJson();
                    return new Set(playlists.map(p => p.genre)).has(value);
                },
                errorMessage: (value) => `Genre '${value}' does not exist in default playlists`
            },
            [COMMON_CONFIG_KEYS.sources]: {
                validate: async (value) => isPlainObject(value) && Object.entries(value).every(
                    ([source, entry]) => validSources.includes(source) && isValidSourceEntry(entry)
                ),
                errorMessage: () => `sources must map each of [${validSources.join(', ')}] to { ${SOURCE_CAPABILITIES.map(c => `${c}?: boolean`).join(', ')} }`
            },
            [COMMON_CONFIG_KEYS.metadataProviders]: {
                validate: async (value) => isPlainObject(value) && Object.entries(value).every(
                    ([provider, entry]) => validMetadataProviders.includes(provider) &&
                        isPlainObject(entry) && typeof entry.enabled === "boolean"
                ),
                errorMessage: () => `metadataProviders must map each of [${validMetadataProviders.join(', ')}] to { enabled: boolean }`
            },
        };
    }

    isValidKey(key) {
        return this.allowedKeys.includes(key);
    }

    async validateKeyAndValue(key, value) {
        if (!this.isValidKey(key)) {
            throw new Error(`Invalid config key: ${key}. Allowed keys are: ${this.allowedKeys.join(', ')}`);
        }

        // If there's a validation rule for this key, run it
        if (this.validations[key]) {
            const validation = this.validations[key];
            const isValid = await validation.validate(value);
            if (!isValid) {
                throw new Error(validation.errorMessage(value));
            }
        }
    }

    getAll() {
        return this.config;
    }

    async get(key) {
        if(key){
            return this.config[key];
        }
        return this.config;
    }

    /**
     * @description Applies a single config value, keeping specialized keys (e.g. sources) normalized.
     */
    applyValue(key, value, partial) {
        if (partial && isPlainObject(this.config[key]) && isPlainObject(value)) {
            this.config[key] = {
                ...this.config[key],
                ...value
            };
        } else {
            this.config[key] = value;
        }

        if (key === COMMON_CONFIG_KEYS.sources) {
            this.normalizeSourceConfig();
        }

        if (key === COMMON_CONFIG_KEYS.metadataProviders) {
            this.normalizeMetadataProviders();
        }
    }

    async update(key, value, partial = false) {
        try {
            await this.validateKeyAndValue(key, value);
            this.applyValue(key, value, partial);

            saveCommonConfigJson(this.config);
            return true;
        } catch (error) {
            logger.error('Error updating config:', error);
            throw error;
        }
    }

    async updateMultiple(updates, partial = false) {
        try {
            // Validate all updates first
            await Promise.all(
                Object.entries(updates).map(([key, value]) =>
                    this.validateKeyAndValue(key, value)
                )
            );

            // If all validations pass, apply the updates
            Object.entries(updates).forEach(([key, value]) => {
                this.applyValue(key, value, partial);
            });

            saveCommonConfigJson(this.config);
            return true;
        } catch (error) {
            logger.error('Error updating multiple configs:', error);
            return false;
        }
    }

    async delete(key) {
        try {
            if (!this.isValidKey(key)) {
                throw new Error(`Invalid config key: ${key}. Allowed keys are: ${this.allowedKeys.join(', ')}`);
            }
            delete this.config[key];
            saveCommonConfigJson(this.config);
            return true;
        } catch (error) {
            logger.error('Error deleting config:', error);
            return false;
        }
    }
}

export default new CommonConfigService();
