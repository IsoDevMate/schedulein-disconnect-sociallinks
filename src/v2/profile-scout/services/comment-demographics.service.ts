import { Injectable, Logger } from '@nestjs/common';
import { MultiProviderApiService } from './multi-provider-api.service';

export interface VideoComment {
  text: string;
  author: string;
  likeCount: number;
  publishedAt: string;
  replyCount?: number;
  authorChannelId?: string;
}

export interface CommentDemographicSignals {
  commentPatterns: {
    languages: string[];
    slangUsage: string[];
    emojiPatterns: string[];
    responseStyle: 'formal' | 'casual' | 'slang-heavy';
    vocabularyLevel: 'basic' | 'intermediate' | 'advanced';
  };

  engagementSignals: {
    commentLength: number;
    responseTime: number;
    questionPatterns: string[];
    emotionalReactions: string[];
    interactionStyle: 'passive' | 'active' | 'highly-engaged';
  };

  geographicSignals: {
    timezoneMentions: string[];
    locationReferences: string[];
    culturalContext: string[];
    regionalSlang: string[];
  };

  ageGroupSignals: {
    genZ: number;
    millennial: number;
    genX: number;
    boomer: number;
  };

  confidence: number;
}

@Injectable()
export class CommentDemographicsService {
  private readonly logger = new Logger(CommentDemographicsService.name);

  constructor(
    private readonly multiProviderApi: MultiProviderApiService,
  ) {}

  /**
   * Analyze comments for demographic signals
   */
  async analyzeCommentsForDemographics(comments: VideoComment[]): Promise<CommentDemographicSignals> {
    if (!comments || comments.length === 0) {
      return this.getEmptySignals();
    }

    this.logger.log(`Analyzing ${comments.length} comments for demographic signals`);

    try {
      const commentTexts = comments.map(c => c.text);
      const allText = commentTexts.join(' ').toLowerCase();

      // Analyze comment patterns
      const commentPatterns = await this.analyzeCommentPatterns(commentTexts);

      // Analyze engagement signals
      const engagementSignals = this.analyzeEngagementSignals(comments);

      // Analyze geographic signals
      const geographicSignals = this.analyzeGeographicSignals(commentTexts);

      // Analyze age group signals
      const ageGroupSignals = this.analyzeAgeGroupSignals(commentTexts);

      // Calculate overall confidence
      const confidence = this.calculateConfidence(comments.length, commentPatterns, engagementSignals);

      return {
        commentPatterns,
        engagementSignals,
        geographicSignals,
        ageGroupSignals,
        confidence
      };
    } catch (error) {
      this.logger.error('Error analyzing comments for demographics:', error);
      return this.getEmptySignals();
    }
  }

  /**
   * Analyze comment patterns (language, slang, emoji usage)
   */
  private async analyzeCommentPatterns(commentTexts: string[]): Promise<CommentDemographicSignals['commentPatterns']> {
    const allText = commentTexts.join(' ').toLowerCase();

    // Detect languages
    const languages = await this.detectCommentLanguages(commentTexts);

    // Extract slang patterns
    const slangUsage = this.extractSlangPatterns(allText);

    // Extract emoji patterns
    const emojiPatterns = this.extractEmojiPatterns(allText);

    // Analyze response style
    const responseStyle = this.analyzeResponseStyle(commentTexts);

    // Analyze vocabulary level
    const vocabularyLevel = this.analyzeVocabularyLevel(allText);

    return {
      languages,
      slangUsage,
      emojiPatterns,
      responseStyle,
      vocabularyLevel
    };
  }

  /**
   * Analyze engagement signals
   */
  private analyzeEngagementSignals(comments: VideoComment[]): CommentDemographicSignals['engagementSignals'] {
    const commentLengths = comments.map(c => c.text.length);
    const averageLength = commentLengths.reduce((sum, len) => sum + len, 0) / commentLengths.length;

    // Analyze question patterns
    const questionPatterns = this.extractQuestionPatterns(comments.map(c => c.text));

    // Analyze emotional reactions
    const emotionalReactions = this.analyzeEmotionalReactions(comments.map(c => c.text));

    // Analyze interaction style
    const interactionStyle = this.analyzeInteractionStyle(comments);

    return {
      commentLength: averageLength,
      responseTime: 0, // Would need timestamp analysis
      questionPatterns,
      emotionalReactions,
      interactionStyle
    };
  }

  /**
   * Analyze geographic signals
   */
  private analyzeGeographicSignals(commentTexts: string[]): CommentDemographicSignals['geographicSignals'] {
    const allText = commentTexts.join(' ').toLowerCase();

    // Extract timezone mentions
    const timezoneMentions = this.extractTimezoneMentions(allText);

    // Extract location references
    const locationReferences = this.extractLocationReferences(allText);

    // Extract cultural context
    const culturalContext = this.extractCulturalContext(allText);

    // Extract regional slang
    const regionalSlang = this.extractRegionalSlang(allText);

    return {
      timezoneMentions,
      locationReferences,
      culturalContext,
      regionalSlang
    };
  }

  /**
   * Analyze age group signals from comments
   */
  private analyzeAgeGroupSignals(commentTexts: string[]): CommentDemographicSignals['ageGroupSignals'] {
    const allText = commentTexts.join(' ').toLowerCase();

    // Age-specific lexica (same as SmartDemographicsService)
    const ageLexica = {
      genZ: {
        slang: ['no cap', 'periodt', 'slay', 'bussin', 'fr', 'bet', 'main character', 'vibe check', 'it hits different', 'that slaps'],
        emojis: ['💀', '🔥', '✨', '💅', 'periodt', '💯', '🤪', '😭', '💀', '✨'],
        vocabulary: ['literally', 'actually', 'honestly', 'ngl', 'lowkey', 'highkey', 'stan', 'ship', 'flex'],
        topics: ['school', 'college', 'gen z', 'teen', 'young', 'trending', 'viral', 'aesthetic']
      },
      millennial: {
        slang: ['adulting', 'literally', 'basic', 'yas', 'slay', 'queen', 'boss', 'goals', 'mood', 'same'],
        emojis: ['😂', '😭', '💯', '🔥', '✨', '👏', '🙌', '💪', '🎉', '❤️'],
        vocabulary: ['work', 'career', 'professional', 'adult', 'responsibility', 'life', 'real', 'authentic'],
        topics: ['work', 'career', 'adulting', 'millennial', 'nostalgia', '90s', '2000s', 'life']
      },
      genX: {
        slang: ['back in my day', 'kids these days', 'old school', 'classic', 'retro', 'vintage'],
        emojis: ['👍', '👌', '😊', '🙂', '😄', '😃', '😁', '😉', '😎', '🤔'],
        vocabulary: ['traditional', 'classic', 'established', 'experienced', 'mature', 'wise', 'seasoned'],
        topics: ['family', 'kids', 'parenting', 'traditional', 'classic', 'retro', 'vintage', '80s', '90s']
      },
      boomer: {
        slang: ['back in the day', 'when I was young', 'kids today', 'technology', 'smartphone'],
        emojis: ['😊', '👍', '👌', '🙂', '😄', '😃', '😁', '😉', '😎', '🤔'],
        vocabulary: ['traditional', 'classic', 'established', 'experienced', 'mature', 'wise', 'seasoned'],
        topics: ['family', 'grandkids', 'traditional', 'classic', 'retro', 'vintage', '60s', '70s']
      }
    };

    const ageGroups = { genZ: 0, millennial: 0, genX: 0, boomer: 0 };
    const weights = { genZ: 0, millennial: 0, genX: 0, boomer: 0 };

    // Analyze slang usage
    Object.keys(ageLexica).forEach(ageGroup => {
      ageLexica[ageGroup].slang.forEach(slang => {
        if (allText.includes(slang)) {
          weights[ageGroup] += 0.4;
        }
      });
    });

    // Analyze emoji usage
    Object.keys(ageLexica).forEach(ageGroup => {
      ageLexica[ageGroup].emojis.forEach(emoji => {
        if (allText.includes(emoji)) {
          weights[ageGroup] += 0.3;
        }
      });
    });

    // Analyze vocabulary
    Object.keys(ageLexica).forEach(ageGroup => {
      ageLexica[ageGroup].vocabulary.forEach(vocab => {
        if (allText.includes(vocab)) {
          weights[ageGroup] += 0.2;
        }
      });
    });

    // Analyze topics
    Object.keys(ageLexica).forEach(ageGroup => {
      ageLexica[ageGroup].topics.forEach(topic => {
        if (allText.includes(topic)) {
          weights[ageGroup] += 0.1;
        }
      });
    });

    // Normalize weights to percentages
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (totalWeight > 0) {
      Object.keys(ageGroups).forEach(ageGroup => {
        ageGroups[ageGroup] = Math.round((weights[ageGroup] / totalWeight) * 100);
      });
    }

    return ageGroups;
  }

  /**
   * Detect languages in comments
   */
  private async detectCommentLanguages(commentTexts: string[]): Promise<string[]> {
    try {
      const languages = new Set<string>();

      for (const text of commentTexts.slice(0, 10)) { // Analyze first 10 comments
        if (text.trim().length > 10) {
          const detection = await this.multiProviderApi.detectLanguage(text);
          if (detection && detection.language) {
            languages.add(detection.language);
          }
        }
      }

      return Array.from(languages);
    } catch (error) {
      this.logger.warn('Failed to detect comment languages:', error.message);
      return ['en']; // Default to English
    }
  }

  /**
   * Extract slang patterns from comments
   */
  private extractSlangPatterns(text: string): string[] {
    const slangPatterns = [
      // Gen Z slang
      'no cap', 'periodt', 'slay', 'bussin', 'fr', 'bet', 'main character', 'vibe check',
      'it hits different', 'that slaps', 'stan', 'ship', 'flex', 'ngl', 'lowkey', 'highkey',

      // Millennial slang
      'adulting', 'yas', 'queen', 'boss', 'goals', 'mood', 'same', 'basic',

      // Gen X slang
      'back in my day', 'kids these days', 'old school', 'classic', 'retro', 'vintage',

      // Boomer slang
      'back in the day', 'when I was young', 'kids today', 'technology', 'smartphone'
    ];

    return slangPatterns.filter(slang => text.includes(slang));
  }

  /**
   * Extract emoji patterns from comments
   */
  private extractEmojiPatterns(text: string): string[] {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojis = text.match(emojiRegex) || [];

    // Return unique emojis
    return [...new Set(emojis)];
  }

  /**
   * Analyze response style
   */
  private analyzeResponseStyle(commentTexts: string[]): 'formal' | 'casual' | 'slang-heavy' {
    const allText = commentTexts.join(' ').toLowerCase();

    const slangCount = this.extractSlangPatterns(allText).length;
    const emojiCount = this.extractEmojiPatterns(allText).length;
    const formalWords = ['please', 'thank you', 'sincerely', 'regards', 'respectfully'];
    const formalCount = formalWords.filter(word => allText.includes(word)).length;

    if (slangCount > 5 || emojiCount > 10) {
      return 'slang-heavy';
    } else if (formalCount > 2) {
      return 'formal';
    } else {
      return 'casual';
    }
  }

  /**
   * Analyze vocabulary level
   */
  private analyzeVocabularyLevel(text: string): 'basic' | 'intermediate' | 'advanced' {
    const words = text.split(/\s+/);
    const complexWords = words.filter(word =>
      word.length > 8 ||
      /[A-Z]/.test(word) ||
      /[0-9]/.test(word)
    );

    const complexityRatio = complexWords.length / words.length;

    if (complexityRatio > 0.3) {
      return 'advanced';
    } else if (complexityRatio > 0.15) {
      return 'intermediate';
    } else {
      return 'basic';
    }
  }

  /**
   * Extract question patterns
   */
  private extractQuestionPatterns(commentTexts: string[]): string[] {
    const questionPatterns = [];

    commentTexts.forEach(text => {
      if (text.includes('?')) {
        // Extract question types
        if (text.includes('how')) questionPatterns.push('how-questions');
        if (text.includes('what')) questionPatterns.push('what-questions');
        if (text.includes('why')) questionPatterns.push('why-questions');
        if (text.includes('when')) questionPatterns.push('when-questions');
        if (text.includes('where')) questionPatterns.push('where-questions');
        if (text.includes('who')) questionPatterns.push('who-questions');
      }
    });

    return [...new Set(questionPatterns)];
  }

  /**
   * Analyze emotional reactions
   */
  private analyzeEmotionalReactions(commentTexts: string[]): string[] {
    const emotions = [];
    const allText = commentTexts.join(' ').toLowerCase();

    // Positive emotions
    if (allText.includes('love') || allText.includes('amazing') || allText.includes('awesome')) {
      emotions.push('positive');
    }

    // Negative emotions
    if (allText.includes('hate') || allText.includes('terrible') || allText.includes('awful')) {
      emotions.push('negative');
    }

    // Excitement
    if (allText.includes('!!!') || allText.includes('omg') || allText.includes('wow')) {
      emotions.push('excited');
    }

    // Confusion
    if (allText.includes('confused') || allText.includes('??') || allText.includes('what')) {
      emotions.push('confused');
    }

    return [...new Set(emotions)];
  }

  /**
   * Analyze interaction style
   */
  private analyzeInteractionStyle(comments: VideoComment[]): 'passive' | 'active' | 'highly-engaged' {
    const avgLikes = comments.reduce((sum, c) => sum + c.likeCount, 0) / comments.length;
    const avgLength = comments.reduce((sum, c) => sum + c.text.length, 0) / comments.length;

    if (avgLikes > 10 && avgLength > 50) {
      return 'highly-engaged';
    } else if (avgLikes > 2 || avgLength > 20) {
      return 'active';
    } else {
      return 'passive';
    }
  }

  /**
   * Extract timezone mentions
   */
  private extractTimezoneMentions(text: string): string[] {
    const timezonePatterns = [
      /\d+am\s+here/gi,
      /\d+pm\s+here/gi,
      /morning\s+in\s+\w+/gi,
      /evening\s+in\s+\w+/gi,
      /night\s+in\s+\w+/gi,
      /\d+:\d+\s+here/gi
    ];

    const mentions = [];
    timezonePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        mentions.push(...matches);
      }
    });

    return [...new Set(mentions)];
  }

  /**
   * Extract location references
   */
  private extractLocationReferences(text: string): string[] {
    const locationPatterns = [
      /in\s+\w+/gi,
      /from\s+\w+/gi,
      /\b[A-Z]{2,}\b/g, // State/country codes
      /\b\w+\s+city\b/gi,
      /\b\w+\s+state\b/gi,
      /\b\w+\s+country\b/gi
    ];

    const locations = [];
    locationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        locations.push(...matches);
      }
    });

    return [...new Set(locations)];
  }

  /**
   * Extract cultural context
   */
  private extractCulturalContext(text: string): string[] {
    const culturalPatterns = [
      'holiday', 'christmas', 'thanksgiving', 'easter', 'halloween',
      'festival', 'celebration', 'tradition', 'culture', 'heritage',
      'local', 'regional', 'national', 'international'
    ];

    return culturalPatterns.filter(pattern => text.includes(pattern));
  }

  /**
   * Extract regional slang
   */
  private extractRegionalSlang(text: string): string[] {
    const regionalSlang = {
      'US': ['y\'all', 'ain\'t', 'gonna', 'wanna', 'gotta'],
      'UK': ['bloody', 'brilliant', 'cheers', 'mate', 'proper'],
      'AU': ['mate', 'g\'day', 'fair dinkum', 'no worries', 'strewth'],
      'CA': ['eh', 'aboot', 'hoser', 'toque', 'double-double']
    };

    const foundSlang = [];
    Object.entries(regionalSlang).forEach(([region, slang]) => {
      slang.forEach(word => {
        if (text.includes(word)) {
          foundSlang.push(`${region}:${word}`);
        }
      });
    });

    return foundSlang;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    commentCount: number,
    commentPatterns: CommentDemographicSignals['commentPatterns'],
    engagementSignals: CommentDemographicSignals['engagementSignals']
  ): number {
    let confidence = 0;

    // Base confidence from comment count
    confidence += Math.min(commentCount * 2, 40);

    // Confidence from language detection
    if (commentPatterns.languages.length > 0) {
      confidence += 20;
    }

    // Confidence from slang detection
    if (commentPatterns.slangUsage.length > 0) {
      confidence += 15;
    }

    // Confidence from engagement
    if (engagementSignals.interactionStyle === 'highly-engaged') {
      confidence += 15;
    } else if (engagementSignals.interactionStyle === 'active') {
      confidence += 10;
    }

    // Confidence from emoji usage
    if (commentPatterns.emojiPatterns.length > 0) {
      confidence += 10;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Get empty signals for fallback
   */
  private getEmptySignals(): CommentDemographicSignals {
    return {
      commentPatterns: {
        languages: [],
        slangUsage: [],
        emojiPatterns: [],
        responseStyle: 'casual',
        vocabularyLevel: 'basic'
      },
      engagementSignals: {
        commentLength: 0,
        responseTime: 0,
        questionPatterns: [],
        emotionalReactions: [],
        interactionStyle: 'passive'
      },
      geographicSignals: {
        timezoneMentions: [],
        locationReferences: [],
        culturalContext: [],
        regionalSlang: []
      },
      ageGroupSignals: {
        genZ: 0,
        millennial: 0,
        genX: 0,
        boomer: 0
      },
      confidence: 0
    };
  }
}




