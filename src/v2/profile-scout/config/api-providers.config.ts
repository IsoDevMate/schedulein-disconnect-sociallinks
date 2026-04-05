export const API_PROVIDERS_CONFIG = {
  // Hugging Face API (Free tier: 30k chars/month)
  huggingFace: {
    baseUrl: 'https://api-inference.huggingface.co/models',
    token: process.env.HUGGINGFACE_TOKEN,
    rateLimit: 30, // requests per minute
    freeTier: 30000, // characters per month
    models: {
      languageDetection: 'facebook/fasttext-language-identification',
      genderPrediction: 'fc63/gender_prediction_model_from_text',
      agePrediction: 'abhilash88/age-gender-prediction',
    },
  },

  // Google Cloud Vision API (Free tier: 1,000 units/month)
  googleVision: {
    baseUrl: 'https://vision.googleapis.com/v1/images:annotate',
    token: process.env.GOOGLE_VISION_TOKEN,
    rateLimit: 60,
    freeTier: 1000, // units per month
    features: ['LABEL_DETECTION', 'FACE_DETECTION', 'TEXT_DETECTION'],
  },

  // Azure Cognitive Services (Free tier: 5,000 transactions/month)
  azureCognitive: {
    baseUrl: process.env.AZURE_COGNITIVE_ENDPOINT || 'https://your-region.cognitiveservices.azure.com',
    token: process.env.AZURE_COGNITIVE_TOKEN,
    rateLimit: 20,
    freeTier: 5000, // transactions per month
    services: {
      language: '/text/analytics/v3.1/languages',
      sentiment: '/text/analytics/v3.1/sentiment',
      vision: '/vision/v3.2/analyze',
    },
  },

  // IBM Watson (Free tier: 2,500 requests/month)
  ibmWatson: {
    baseUrl: 'https://api.us-south.natural-language-understanding.watson.cloud.ibm.com',
    token: process.env.IBM_WATSON_TOKEN,
    instanceId: process.env.IBM_WATSON_INSTANCE_ID,
    rateLimit: 10,
    freeTier: 2500, // requests per month
    services: {
      nlu: '/instances/{instanceId}/v1/analyze',
    },
  },

  // Clarifai (Free tier: 1,000 predictions/month)
  clarifai: {
    baseUrl: 'https://api.clarifai.com/v2/models',
    token: process.env.CLARIFAI_TOKEN,
    rateLimit: 30,
    freeTier: 1000, // predictions per month
    models: {
      general: 'general-image-recognition',
      demographics: 'demographics-recognition',
    },
  },

  // Reddit API (Free, unlimited)
  reddit: {
    baseUrl: 'https://www.reddit.com/api/v1',
    token: process.env.REDDIT_TOKEN,
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    rateLimit: 60,
    freeTier: -1, // unlimited
    subreddits: ['GenZ', 'teenagers', 'millennials', 'GenerationX'],
  },

  // Urban Dictionary API (Free tier: 1,000 requests/day)
  urbanDictionary: {
    baseUrl: 'https://unofficialurbandictionaryapi.com/api',
    token: null, // No token required - completely free!
    rateLimit: 0, // No rate limits
    freeTier: 'unlimited', // Completely free
    endpoints: {
      search: '/search',
      random: '/random',
      browse: '/browse',
      author: '/author',
    },
  },

  // Wikipedia API (Free, unlimited)
  wikipedia: {
    baseUrl: 'https://en.wikipedia.org/api/rest_v1',
    rateLimit: 200,
    freeTier: -1, // unlimited
    endpoints: {
      summary: '/page/summary',
      content: '/page/content',
    },
  },

  // REST Countries API (Free, unlimited)
  restCountries: {
    baseUrl: 'https://restcountries.com/v3.1',
    rateLimit: 1000,
    freeTier: -1, // unlimited
    endpoints: {
      all: '/all',
      byLanguage: '/lang/{language}',
    },
  },

  // Cache Configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL_SECONDS || '3600'),
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
  },

  // Rate Limiting
  rateLimit: {
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '60'),
    burstSize: parseInt(process.env.RATE_LIMIT_BURST_SIZE || '10'),
  },

  // Fallback Configuration
  fallback: {
    enabled: process.env.ENABLE_FALLBACK_PROVIDERS === 'true',
    timeout: parseInt(process.env.FALLBACK_TIMEOUT_MS || '5000'),
    maxRetries: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
  },
};

export const DEMOGRAPHIC_PATTERNS = {
  // Default age group distributions by platform
  platformDefaults: {
    tiktok: {
      genZ: 45,
      millennial: 35,
      genX: 15,
      boomer: 5,
    },
    youtube: {
      genZ: 35,
      millennial: 40,
      genX: 20,
      boomer: 5,
    },
    instagram: {
      genZ: 40,
      millennial: 35,
      genX: 20,
      boomer: 5,
    },
  },

  // Default gender distributions by platform
  genderDefaults: {
    tiktok: { male: 43, female: 57, other: 0 },
    youtube: { male: 55, female: 45, other: 0 },
    instagram: { male: 48, female: 52, other: 0 },
  },

  // Confidence thresholds
  confidenceThresholds: {
    high: 80,
    medium: 60,
    low: 40,
    veryLow: 20,
  },
};
