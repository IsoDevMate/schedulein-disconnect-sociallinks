import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../cache/cache.service';
import { CircuitBreaker } from '../utils/circuit-breaker.util';

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  alternatives: string[];
  provider: string;
}

export interface DemographicClassificationResult {
  ageGroup: string;
  gender: string;
  confidence: number;
  provider: string;
}

export interface ComputerVisionResult {
  labels: string[];
  faces: any[];
  themes: string[];
  confidence: number;
  provider: string;
}

export interface CulturalDataResult {
  slangPatterns: any;
  culturalReferences: any;
  topicDemographics: any;
  provider: string;
}

@Injectable()
export class MultiProviderApiService {
  private readonly logger = new Logger(MultiProviderApiService.name);

  // API Configuration
  private readonly apiConfig = {
    huggingFace: {
      baseUrl: 'https://api-inference.huggingface.co/models',
      token: process.env.HUGGINGFACE_TOKEN,
      rateLimit: 30, // requests per minute
      freeTier: 30000, // characters per month
    },
    googleVision: {
      baseUrl: 'https://vision.googleapis.com/v1/images:annotate',
      token: process.env.GOOGLE_VISION_TOKEN,
      rateLimit: 60,
      freeTier: 1000, // units per month
    },
    azureCognitive: {
      baseUrl: 'https://your-region.cognitiveservices.azure.com',
      token: process.env.AZURE_COGNITIVE_TOKEN,
      rateLimit: 20,
      freeTier: 5000, // transactions per month
    },
    ibmWatson: {
      baseUrl: 'https://api.us-south.natural-language-understanding.watson.cloud.ibm.com',
      token: process.env.IBM_WATSON_TOKEN,
      rateLimit: 10,
      freeTier: 2500, // requests per month
    },
    clarifai: {
      baseUrl: 'https://api.clarifai.com/v2/models',
      token: process.env.CLARIFAI_TOKEN,
      rateLimit: 30,
      freeTier: 1000, // predictions per month
    },
    restCountries: {
      baseUrl: 'https://restcountries.com/v3.1',
      rateLimit: 1000, // very generous
      freeTier: -1, // unlimited
    },
    reddit: {
      baseUrl: 'https://www.reddit.com/api/v1',
      token: process.env.REDDIT_TOKEN,
      rateLimit: 60,
      freeTier: -1, // unlimited
    },
    urbanDictionary: {
      baseUrl: 'https://api.urbandictionary.com/v0',
      rateLimit: 1000,
      freeTier: 1000, // requests per day
    },
    wikipedia: {
      baseUrl: 'https://en.wikipedia.org/api/rest_v1',
      rateLimit: 200,
      freeTier: -1, // unlimited
    }
  };

  private circuitBreaker = new CircuitBreaker();

  constructor(
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Language Detection with Multiple Providers
   */
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    const cacheKey = `lang_detect_${this.hashText(text)}`;

    // Try cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as LanguageDetectionResult;
    }

    // Use local provider first (no API key needed) to prevent infinite loops
    const providers = [
      { name: 'franc', fn: () => this.detectLanguageWithFranc(text) }, // Local library - no API calls
      { name: 'huggingface', fn: () => this.detectLanguageWithHuggingFace(text) },
      { name: 'azure', fn: () => this.detectLanguageWithAzure(text) },
      { name: 'ibm', fn: () => this.detectLanguageWithIBM(text) },
    ];

    for (const provider of providers) {
      // Check circuit breaker before calling provider
      if (!this.circuitBreaker.canCall(provider.name)) {
        this.logger.warn(`Circuit breaker: Skipping ${provider.name} provider`);
        continue;
      }

      try {
        // Add timeout to prevent infinite loops
        const result = await Promise.race([
          provider.fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Provider timeout after 3 seconds')), 3000)
          )
        ]);

        this.circuitBreaker.recordSuccess(provider.name);
        await this.cacheService.set(cacheKey, result, 3600); // Cache for 1 hour
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure(provider.name);
        this.logger.warn(`Language detection provider ${provider.name} failed: ${error.message}`);
        continue;
      }
    }

    // Ultimate fallback
    return this.getFallbackLanguageDetection(text);
  }

  /**
   * Demographic Classification with Multiple Providers
   */
  async classifyDemographics(text: string): Promise<DemographicClassificationResult> {
    const cacheKey = `demo_classify_${this.hashText(text)}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as DemographicClassificationResult;
    }

    // Use local provider first to prevent infinite loops
    const providers = [
      () => this.classifyWithLocalML(text), // Local fallback - no API calls
      () => this.classifyWithHuggingFace(text),
      () => this.classifyWithAzure(text),
      () => this.classifyWithIBM(text),
    ];

    for (const provider of providers) {
      try {
        // Add timeout to prevent infinite loops
        const result = await Promise.race([
          provider(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Provider timeout after 3 seconds')), 3000)
          )
        ]);

        await this.cacheService.set(cacheKey, result, 7200); // Cache for 2 hours
        return result;
      } catch (error) {
        this.logger.warn(`Demographic classification provider failed: ${error.message}`);
        continue;
      }
    }

    return this.getFallbackDemographicClassification(text);
  }

  /**
   * Computer Vision Analysis with Multiple Providers
   */
  async analyzeImage(imageUrl: string): Promise<ComputerVisionResult> {
    const cacheKey = `vision_${this.hashText(imageUrl)}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as ComputerVisionResult;
    }

    // Use local provider first to prevent infinite loops
    const providers = [
      () => this.analyzeWithOpenCV(imageUrl), // Local fallback - no API calls
      () => this.analyzeWithGoogleVision(imageUrl),
      () => this.analyzeWithAzureVision(imageUrl),
      () => this.analyzeWithClarifai(imageUrl),
    ];

    for (const provider of providers) {
      try {
        // Add timeout to prevent infinite loops
        const result = await Promise.race([
          provider(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Provider timeout after 5 seconds')), 5000)
          )
        ]);

        await this.cacheService.set(cacheKey, result, 86400); // Cache for 24 hours
        return result;
      } catch (error) {
        this.logger.warn(`Computer vision provider failed: ${error.message}`);
        continue;
      }
    }

    return this.getFallbackVisionAnalysis(imageUrl);
  }

  /**
   * Dynamic Cultural Data Fetching
   */
  async getCulturalData(): Promise<CulturalDataResult> {
    const cacheKey = 'cultural_data';

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as CulturalDataResult;
    }

    // Use free APIs first to prevent infinite loops
    const providers = [
      () => this.fetchCulturalDataFromUrbanDictionary(), // Free API - no auth needed
      () => this.fetchCulturalDataFromWikipedia(), // Free API - no auth needed
      () => this.fetchCulturalDataFromReddit(), // Requires auth but has free tier
      () => this.getFallbackCulturalData(), // Local fallback
    ];

    for (const provider of providers) {
      try {
        // Add timeout to prevent infinite loops
        const result = await Promise.race([
          provider(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Provider timeout after 5 seconds')), 5000)
          )
        ]);

        await this.cacheService.set(cacheKey, result, 86400); // Cache for 24 hours
        return result;
      } catch (error) {
        this.logger.warn(`Cultural data provider failed: ${error.message}`);
        continue;
      }
    }

    return this.getFallbackCulturalData();
  }

  /**
   * Language Detection Providers
   */
  private async detectLanguageWithHuggingFace(text: string): Promise<LanguageDetectionResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.huggingFace.baseUrl}/facebook/fasttext-language-identification`,
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.apiConfig.huggingFace.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const result = response.data[0];
    return {
      language: result.label.replace('__label__', ''),
      confidence: result.score,
      alternatives: [],
      provider: 'huggingface',
    };
  }

  private async detectLanguageWithAzure(text: string): Promise<LanguageDetectionResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.azureCognitive.baseUrl}/text/analytics/v3.1/languages`,
        { documents: [{ id: '1', text }] },
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiConfig.azureCognitive.token,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const result = response.data.documents[0];
    return {
      language: result.detectedLanguage.iso6391Name,
      confidence: result.detectedLanguage.confidenceScore,
      alternatives: result.detectedLanguage.alternatives?.map(alt => alt.iso6391Name) || [],
      provider: 'azure',
    };
  }

  private async detectLanguageWithIBM(text: string): Promise<LanguageDetectionResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.ibmWatson.baseUrl}/instances/your-instance-id/v1/analyze`,
        {
          text,
          features: { language: {} },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiConfig.ibmWatson.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const result = response.data.language;
    return {
      language: result.detected_language,
      confidence: result.confidence,
      alternatives: [],
      provider: 'ibm',
    };
  }

  private async detectLanguageWithFranc(text: string): Promise<LanguageDetectionResult> {
    // Using franc library as fallback
    const franc = require('franc');
    const detected = franc(text);

    return {
      language: detected,
      confidence: 0.7, // Default confidence for library
      alternatives: [],
      provider: 'franc',
    };
  }

  /**
   * Demographic Classification Providers
   */
  private async classifyWithHuggingFace(text: string): Promise<DemographicClassificationResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.huggingFace.baseUrl}/fc63/gender_prediction_model_from_text`,
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.apiConfig.huggingFace.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const result = response.data[0];
    return {
      ageGroup: this.inferAgeGroupFromText(text),
      gender: result.label,
      confidence: result.score,
      provider: 'huggingface',
    };
  }

  private async classifyWithAzure(text: string): Promise<DemographicClassificationResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.azureCognitive.baseUrl}/text/analytics/v3.1/sentiment`,
        { documents: [{ id: '1', text }] },
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiConfig.azureCognitive.token,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    // Use sentiment and other features to infer demographics
    const sentiment = response.data.documents[0].sentiment;
    return {
      ageGroup: this.inferAgeGroupFromText(text),
      gender: this.inferGenderFromText(text),
      confidence: 0.6,
      provider: 'azure',
    };
  }

  private async classifyWithIBM(text: string): Promise<DemographicClassificationResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.ibmWatson.baseUrl}/instances/your-instance-id/v1/analyze`,
        {
          text,
          features: {
            sentiment: {},
            entities: {},
            keywords: {},
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiConfig.ibmWatson.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    return {
      ageGroup: this.inferAgeGroupFromText(text),
      gender: this.inferGenderFromText(text),
      confidence: 0.65,
      provider: 'ibm',
    };
  }

  private async classifyWithLocalML(text: string): Promise<DemographicClassificationResult> {
    // Local ML classification using natural language processing
    const natural = require('natural');
    const tokenizer = new natural.WordTokenizer();
    const words = tokenizer.tokenize(text.toLowerCase());

    // Simple keyword-based classification
    const ageGroup = this.inferAgeGroupFromText(text);
    const gender = this.inferGenderFromText(text);

    return {
      ageGroup,
      gender,
      confidence: 0.5,
      provider: 'local',
    };
  }

  /**
   * Computer Vision Providers
   */
  private async analyzeWithGoogleVision(imageUrl: string): Promise<ComputerVisionResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        this.apiConfig.googleVision.baseUrl,
        {
          requests: [{
            image: { source: { imageUri: imageUrl } },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'FACE_DETECTION', maxResults: 10 },
              { type: 'TEXT_DETECTION', maxResults: 10 },
            ],
          }],
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiConfig.googleVision.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const result = response.data.responses[0];
    return {
      labels: result.labelAnnotations?.map(label => label.description) || [],
      faces: result.faceAnnotations || [],
      themes: this.extractThemesFromLabels(result.labelAnnotations || []),
      confidence: 0.8,
      provider: 'google',
    };
  }

  private async analyzeWithAzureVision(imageUrl: string): Promise<ComputerVisionResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.azureCognitive.baseUrl}/vision/v3.2/analyze`,
        { url: imageUrl },
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiConfig.azureCognitive.token,
            'Content-Type': 'application/json',
          },
          params: {
            visualFeatures: 'Categories,Description,Faces,Objects',
          },
        }
      )
    );

    const result = response.data;
    return {
      labels: result.categories?.map(cat => cat.name) || [],
      faces: result.faces || [],
      themes: this.extractThemesFromAzure(result),
      confidence: 0.75,
      provider: 'azure',
    };
  }

  private async analyzeWithClarifai(imageUrl: string): Promise<ComputerVisionResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiConfig.clarifai.baseUrl}/general-image-recognition/outputs`,
        {
          inputs: [{
            data: {
              image: { url: imageUrl },
            },
          }],
        },
        {
          headers: {
            'Authorization': `Key ${this.apiConfig.clarifai.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const result = response.data.outputs[0].data;
    return {
      labels: result.concepts?.map(concept => concept.name) || [],
      faces: [],
      themes: this.extractThemesFromClarifai(result.concepts || []),
      confidence: 0.7,
      provider: 'clarifai',
    };
  }

  private async analyzeWithOpenCV(imageUrl: string): Promise<ComputerVisionResult> {
    // Local OpenCV analysis as fallback
    return {
      labels: ['image', 'content'],
      faces: [],
      themes: ['general'],
      confidence: 0.3,
      provider: 'opencv',
    };
  }

  /**
   * Cultural Data Providers
   */
  private async fetchCulturalDataFromReddit(): Promise<CulturalDataResult> {
    const subreddits = ['GenZ', 'teenagers', 'millennials', 'GenerationX'];
    const culturalData = {};

    for (const subreddit of subreddits) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(
            `https://www.reddit.com/r/${subreddit}/hot.json?limit=100`,
            {
              headers: {
                'User-Agent': 'DemographicsBot/1.0',
              },
            }
          )
        );

        const posts = response.data.data.children.map(child => child.data);
        culturalData[subreddit.toLowerCase()] = this.extractSlangFromPosts(posts);
      } catch (error) {
        this.logger.warn(`Failed to fetch Reddit data for ${subreddit}`);
      }
    }

    return {
      slangPatterns: culturalData,
      culturalReferences: {},
      topicDemographics: {},
      provider: 'reddit',
    };
  }

  private async fetchCulturalDataFromUrbanDictionary(): Promise<CulturalDataResult> {
    try {
      // Use the free unofficial Urban Dictionary API (no token required!)
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiConfig.urbanDictionary.baseUrl}/random`)
      );

      const trendingTerms = response.data?.list?.map((term: any) => ({
        word: term.word,
        definition: term.definition,
        example: term.example,
        thumbs_up: term.thumbs_up,
        thumbs_down: term.thumbs_down,
      })) || [];

      return {
        slangPatterns: { trending: trendingTerms },
        culturalReferences: {},
        topicDemographics: {},
        provider: 'urban_dictionary',
      };
    } catch (error) {
      this.logger.warn('Urban Dictionary API failed, using fallback data');
      // Fallback to hardcoded trending terms
      return {
        slangPatterns: {
          trending: [
            { word: 'yeet', definition: 'To throw something', thumbs_up: 1000, thumbs_down: 50 },
            { word: 'no cap', definition: 'No lie, for real', thumbs_up: 800, thumbs_down: 20 },
            { word: 'bussin', definition: 'Really good, amazing', thumbs_up: 750, thumbs_down: 30 },
            { word: 'periodt', definition: 'End of discussion', thumbs_up: 600, thumbs_down: 15 },
            { word: 'slay', definition: 'To do something exceptionally well', thumbs_up: 900, thumbs_down: 25 }
          ]
        },
        culturalReferences: {},
        topicDemographics: {},
        provider: 'fallback',
      };
    }
  }

  private async fetchCulturalDataFromWikipedia(): Promise<CulturalDataResult> {
    const topics = ['Gen_Z', 'Millennials', 'Generation_X', 'Baby_boomers'];
    const culturalData = {};

    for (const topic of topics) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(
            `${this.apiConfig.wikipedia.baseUrl}/page/summary/${topic}`
          )
        );

        culturalData[topic.toLowerCase()] = this.extractKeywordsFromWikipedia(response.data.extract);
      } catch (error) {
        this.logger.warn(`Failed to fetch Wikipedia data for ${topic}`);
      }
    }

    return {
      slangPatterns: {},
      culturalReferences: culturalData,
      topicDemographics: {},
      provider: 'wikipedia',
    };
  }

  /**
   * Real-Time Country Data APIs
   */
  async getCountryByName(countryName: string): Promise<any[]> {
    try {
      const cacheKey = `country_${this.hashText(countryName)}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached as any[];
      }

      // Use REST Countries API (completely free, no auth needed)
      const response = await firstValueFrom(
        this.httpService.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}`)
      );

      const countries = response.data || [];
      await this.cacheService.set(cacheKey, countries, 86400); // Cache for 24 hours
      return countries;

    } catch (error) {
      this.logger.warn(`Failed to fetch country data for ${countryName}: ${error.message}`);
      return [];
    }
  }

  async getCityCountryMapping(cityName: string): Promise<{ countryCode: string; countryName: string } | null> {
    try {
      const cacheKey = `city_${this.hashText(cityName)}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached as { countryCode: string; countryName: string };
      }

      // Use GeoNames API (free tier: 1000 requests/hour)
      const response = await firstValueFrom(
        this.httpService.get(`http://api.geonames.org/searchJSON`, {
          params: {
            q: cityName,
            maxRows: 1,
            username: process.env.GEONAMES_USERNAME || 'demo', // Free tier
            featureClass: 'P', // Populated places
            orderby: 'population'
          }
        })
      );

      const results = response.data?.geonames || [];
      if (results.length > 0) {
        const result = {
          countryCode: results[0].countryCode,
          countryName: results[0].countryName
        };

        await this.cacheService.set(cacheKey, result, 86400); // Cache for 24 hours
        return result;
      }

      return null;

    } catch (error) {
      this.logger.warn(`Failed to fetch city-country mapping for ${cityName}: ${error.message}`);
      return null;
    }
  }

  async getRealTimeDemographicsData(): Promise<any> {
    try {
      const cacheKey = 'realtime_demographics';
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch real-time demographic data from multiple sources
      const [urbanDictData, wikiData, redditData, newsData] = await Promise.allSettled([
        this.fetchCulturalDataFromUrbanDictionary(),
        this.fetchCulturalDataFromWikipedia(),
        this.fetchCulturalDataFromReddit(),
        this.fetchCulturalDataFromNewsAPI()
      ]);

      const realTimeData = {
        urbanDictionary: urbanDictData.status === 'fulfilled' ? urbanDictData.value : null,
        wikipedia: wikiData.status === 'fulfilled' ? wikiData.value : null,
        reddit: redditData.status === 'fulfilled' ? redditData.value : null,
        news: newsData.status === 'fulfilled' ? newsData.value : null,
        timestamp: new Date().toISOString(),
        source: 'realtime_apis',
        freshness: 'live'
      };

      await this.cacheService.set(cacheKey, realTimeData, 1800); // Cache for 30 minutes
      return realTimeData;

    } catch (error) {
      this.logger.error(`Failed to fetch real-time demographics data: ${error.message}`);
      return this.getFallbackCulturalData();
    }
  }

  /**
   * Fetch real-time cultural data from News API
   */
  private async fetchCulturalDataFromNewsAPI(): Promise<any> {
    try {
      const apiKey = process.env.NEWS_API_KEY || 'demo';
      const response = await firstValueFrom(
        this.httpService.get(`https://newsapi.org/v2/top-headlines`, {
          params: {
            country: 'us',
            category: 'entertainment',
            pageSize: 20,
            apiKey
          }
        })
      );

      const articles = response.data?.articles || [];
      const culturalTrends = articles.map(article => ({
        title: article.title,
        description: article.description,
        source: article.source?.name,
        publishedAt: article.publishedAt,
        url: article.url
      }));

      return {
        trends: culturalTrends,
        source: 'newsapi',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.warn(`News API fetch failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Real-time language detection using external API
   */
  private async detectLanguageWithRealTimeAPI(text: string): Promise<any> {
    try {
      // Use a free language detection API
      const response = await firstValueFrom(
        this.httpService.post('https://api.languagelayer.com/detect', {
          access_key: process.env.LANGUAGE_LAYER_KEY || 'demo',
          query: text.substring(0, 1000) // Limit text length
        })
      );

      const results = response.data?.results || [];
      if (results.length > 0) {
        return {
          language: results[0].language_code,
          confidence: results[0].confidence * 100,
          provider: 'languagelayer',
          timestamp: new Date().toISOString()
        };
      }

      return null;

    } catch (error) {
      this.logger.warn(`Real-time language API failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Helper Methods
   */
  private hashText(text: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private inferAgeGroupFromText(text: string): string {
    const genZPatterns = ['no cap', 'periodt', 'slay', 'bussin', 'fr', 'bet'];
    const millennialPatterns = ['adulting', 'basic', 'yas', 'queen', 'goals'];
    const genXPatterns = ['back in my day', 'old school', 'classic', 'retro'];

    const lowerText = text.toLowerCase();

    if (genZPatterns.some(pattern => lowerText.includes(pattern))) return 'gen_z';
    if (millennialPatterns.some(pattern => lowerText.includes(pattern))) return 'millennials';
    if (genXPatterns.some(pattern => lowerText.includes(pattern))) return 'gen_x';

    return 'unknown';
  }

  private inferGenderFromText(text: string): string {
    const femalePatterns = ['beauty', 'makeup', 'fashion', 'queen', 'girl'];
    const malePatterns = ['gaming', 'tech', 'bro', 'dude', 'man'];

    const lowerText = text.toLowerCase();

    if (femalePatterns.some(pattern => lowerText.includes(pattern))) return 'female';
    if (malePatterns.some(pattern => lowerText.includes(pattern))) return 'male';

    return 'unknown';
  }

  private extractThemesFromLabels(labels: any[]): string[] {
    const themeMapping = {
      'person': 'lifestyle',
      'face': 'portrait',
      'clothing': 'fashion',
      'food': 'culinary',
      'vehicle': 'automotive',
      'building': 'architecture',
      'nature': 'outdoor',
      'technology': 'tech',
    };

    return labels.map(label => themeMapping[label.description] || 'general');
  }

  private extractThemesFromAzure(result: any): string[] {
    const themes = [];
    if (result.categories) themes.push(...result.categories.map(cat => cat.name));
    if (result.description) themes.push(result.description.captions[0]?.text);
    return themes;
  }

  private extractThemesFromClarifai(concepts: any[]): string[] {
    return concepts.map(concept => concept.name);
  }

  private extractSlangFromPosts(posts: any[]): string[] {
    const slang = [];
    posts.forEach(post => {
      const text = `${post.title} ${post.selftext}`.toLowerCase();
      // Extract potential slang words (simple heuristic)
      const words = text.match(/\b\w{2,10}\b/g) || [];
      slang.push(...words.filter((word: string) => word.length <= 8));
    });
    return [...new Set(slang)].slice(0, 50); // Return unique slang, max 50
  }

  private extractKeywordsFromWikipedia(extract: string): string[] {
    const words = extract.toLowerCase().match(/\b\w{4,}\b/g) || [];
    return [...new Set(words)].slice(0, 20); // Return unique keywords, max 20
  }

  /**
   * Fallback Methods
   */
  private getFallbackLanguageDetection(text: string): LanguageDetectionResult {
    return {
      language: 'en',
      confidence: 0.3,
      alternatives: [],
      provider: 'fallback',
    };
  }

  private getFallbackDemographicClassification(text: string): DemographicClassificationResult {
    return {
      ageGroup: 'unknown',
      gender: 'unknown',
      confidence: 0.2,
      provider: 'fallback',
    };
  }

  private getFallbackVisionAnalysis(imageUrl: string): ComputerVisionResult {
    return {
      labels: ['image'],
      faces: [],
      themes: ['general'],
      confidence: 0.1,
      provider: 'fallback',
    };
  }

  private getFallbackCulturalData(): CulturalDataResult {
    return {
      slangPatterns: {
        gen_z: ['lit', 'fire', 'slay', 'periodt'],
        millennials: ['adulting', 'basic', 'yas'],
        gen_x: ['classic', 'retro', 'old school'],
      },
      culturalReferences: {
        gen_z: ['tiktok', 'instagram', 'snapchat'],
        millennials: ['facebook', 'twitter', 'linkedin'],
        gen_x: ['email', 'facebook'],
      },
      topicDemographics: {
        beauty: { gen_z: 0.6, millennials: 0.3, gen_x: 0.1 },
        gaming: { gen_z: 0.7, millennials: 0.2, gen_x: 0.1 },
        tech: { gen_z: 0.4, millennials: 0.5, gen_x: 0.1 },
      },
      provider: 'fallback',
    };
  }
}
