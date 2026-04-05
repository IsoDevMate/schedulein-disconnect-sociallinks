import { registerAs } from '@nestjs/config';

export default registerAs('demographics', () => ({
  // Enable/disable different data sources
  enableYouTubeAnalytics: process.env.DEMOGRAPHICS_YOUTUBE_ANALYTICS !== 'false', // Default true
  enableEstimation: process.env.DEMOGRAPHICS_ESTIMATION !== 'false', // Default true
  enableFallback: process.env.DEMOGRAPHICS_FALLBACK !== 'false', // Default true

  // Cache configuration
  cacheTimeout: parseInt(process.env.DEMOGRAPHICS_CACHE_TIMEOUT) || 60, // minutes
  cachePrefix: process.env.DEMOGRAPHICS_CACHE_PREFIX || 'demographics',

  // YouTube Analytics configuration
  youtubeAnalytics: {
    enableRealTimeData: process.env.YOUTUBE_ANALYTICS_REALTIME === 'true',
    maxRetries: parseInt(process.env.YOUTUBE_ANALYTICS_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.YOUTUBE_ANALYTICS_RETRY_DELAY) || 1000,
  },

  // Data quality thresholds
  qualityThresholds: {
    highConfidence: parseInt(process.env.DEMOGRAPHICS_HIGH_CONFIDENCE) || 80,
    mediumConfidence: parseInt(process.env.DEMOGRAPHICS_MEDIUM_CONFIDENCE) || 60,
    lowConfidence: parseInt(process.env.DEMOGRAPHICS_LOW_CONFIDENCE) || 40,
  },

  // Regional bias configuration
  regionalBias: {
    enabled: process.env.DEMOGRAPHICS_REGIONAL_BIAS === 'true',
    biasStrength: parseFloat(process.env.DEMOGRAPHICS_BIAS_STRENGTH) || 0.2, // 20%
  },

  // Data validation
  validation: {
    enabled: process.env.DEMOGRAPHICS_VALIDATION === 'true',
    maxCountries: parseInt(process.env.DEMOGRAPHICS_MAX_COUNTRIES) || 25,
    minTotalAudience: parseInt(process.env.DEMOGRAPHICS_MIN_TOTAL_AUDIENCE) || 1000,
    maxTotalAudience: parseInt(process.env.DEMOGRAPHICS_MAX_TOTAL_AUDIENCE) || 1000000000,
  },

  // Monitoring and logging
  monitoring: {
    enabled: process.env.DEMOGRAPHICS_MONITORING === 'true',
    logLevel: process.env.DEMOGRAPHICS_LOG_LEVEL || 'info',
    metricsEnabled: process.env.DEMOGRAPHICS_METRICS === 'true',
  },
}));
