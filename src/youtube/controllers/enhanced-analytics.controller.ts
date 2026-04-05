import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EnhancedNicheClassificationService } from '../services/enhanced-niche-classification.service';
import { EnhancedContentAnalysisService } from '../services/enhanced-content-analysis.service';
import { OutlierDetectionService } from '../services/outlier-detection.service';
import { ContentIdeaService } from '../services/content-idea.service';
import { AnalyticsService } from '../services/analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Enhanced Analytics')
@Controller('enhanced-analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EnhancedAnalyticsController {
  private readonly logger = new Logger(EnhancedAnalyticsController.name);

  constructor(
    private readonly nicheClassificationService: EnhancedNicheClassificationService,
    private readonly contentAnalysisService: EnhancedContentAnalysisService,
    private readonly outlierDetectionService: OutlierDetectionService,
    private readonly contentIdeaService: ContentIdeaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('niches')
  @ApiOperation({ summary: 'Get all available niches' })
  @ApiResponse({ status: 200, description: 'List of available niches' })
  async getAvailableNiches() {
    try {
      const niches = await this.nicheClassificationService.getAvailableNiches();
      return {
        success: true,
        data: niches,
        message: 'Available niches retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Error getting available niches:', error);
      return {
        success: false,
        message: 'Failed to retrieve niches',
        error: error.message,
      };
    }
  }

  @Get('niche/:nicheType')
  @ApiOperation({ summary: 'Get specific niche definition' })
  @ApiResponse({ status: 200, description: 'Niche definition details' })
  async getNicheDefinition(@Param('nicheType') nicheType: string) {
    try {
      const niche = await this.nicheClassificationService.getNicheDefinition(nicheType);
      if (!niche) {
        return {
          success: false,
          message: 'Niche not found',
        };
      }
      return {
        success: true,
        data: niche,
        message: 'Niche definition retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Error getting niche definition:', error);
      return {
        success: false,
        message: 'Failed to retrieve niche definition',
        error: error.message,
      };
    }
  }

  @Post('classify-content')
  @ApiOperation({ summary: 'Classify content into niches using AI' })
  @ApiResponse({ status: 200, description: 'Content classification results' })
  async classifyContent(@Body() videoData: any, @Req() req: any) {
    try {
      const userId = req.user?.id;
      const result = await this.nicheClassificationService.classifyContent(videoData, userId);
      return {
        success: true,
        data: result,
        message: 'Content classified successfully',
      };
    } catch (error) {
      this.logger.error('Error classifying content:', error);
      return {
        success: false,
        message: 'Failed to classify content',
        error: error.message,
      };
    }
  }

  @Post('analyze-content')
  @ApiOperation({ summary: 'Perform comprehensive content analysis' })
  @ApiResponse({ status: 200, description: 'Content analysis results' })
  async analyzeContent(@Body() videoData: any, @Req() req: any) {
    try {
      const userId = req.user?.id;
      const result = await this.contentAnalysisService.analyzeContent(videoData, userId);
      return {
        success: true,
        data: result,
        message: 'Content analysis completed successfully',
      };
    } catch (error) {
      this.logger.error('Error analyzing content:', error);
      return {
        success: false,
        message: 'Failed to analyze content',
        error: error.message,
      };
    }
  }

  @Get('outliers')
  @ApiOperation({ summary: 'Detect viral outliers and high-performing content' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['24h', '7d', '30d'] })
  @ApiQuery({ name: 'niche', required: false })
  @ApiQuery({ name: 'minViews', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Outlier detection results' })
  async detectOutliers(
    @Query('timeRange') timeRange: string = '7d',
    @Query('niche') niche?: string,
    @Query('minViews') minViews?: number,
  ) {
    try {
      this.logger.log(`Detecting outliers with comprehensive niche analysis - niche: ${niche}, timeRange: ${timeRange}`);

      const outliers = await this.outlierDetectionService.getAvailableVideos({
        limit: 20,
        niche,
        minViews,
      });

      // Filter by time range
      const filteredOutliers = this.filterByTimeRange(outliers, timeRange);

      // Get niche definition for enhanced response
      let nicheInfo = null;
      if (niche) {
        try {
          nicheInfo = await this.nicheClassificationService.getNicheDefinition(niche);
        } catch (error) {
          this.logger.warn(`Failed to get niche definition: ${error.message}`);
        }
      }

      return {
        success: true,
        data: {
          outliers: filteredOutliers,
          timeRange,
          totalFound: filteredOutliers.length,
          filters: { niche, minViews },
          nicheAnalysis: nicheInfo ? {
            nicheType: nicheInfo.niche_type,
            label: nicheInfo.label,
            description: nicheInfo.description,
            keywordsUsed: nicheInfo.keywords?.slice(0, 10) || [],
            totalKeywords: nicheInfo.keywords?.length || 0,
            comprehensiveMatching: true
          } : null,
        },
        message: niche ? `Outliers detected successfully using comprehensive ${niche} niche analysis` : 'Outliers detected successfully',
      };
    } catch (error) {
      this.logger.error('Error detecting outliers:', error);
      return {
        success: false,
        message: 'Failed to detect outliers',
        error: error.message,
      };
    }
  }

  @Get('content-ideas')
  @ApiOperation({ summary: 'Generate content ideas based on trends' })
  @ApiQuery({ name: 'niche', required: false })
  @ApiQuery({ name: 'contentType', required: false })
  @ApiQuery({ name: 'targetAudience', required: false })
  @ApiResponse({ status: 200, description: 'Content ideas generated' })
  async generateContentIdeas(
    @Query('niche') niche?: string,
    @Query('contentType') contentType?: string,
    @Query('targetAudience') targetAudience?: string,
  ) {
    try {
      const options: any = {};
      if (niche) options.niche = niche;
      if (contentType) options.contentType = contentType;
      if (targetAudience) options.targetAudience = targetAudience;

      const ideas = await this.contentIdeaService.generateContentIdeas(options);

      return {
        success: true,
        data: {
          ideas,
          filters: { niche, contentType, targetAudience },
          totalGenerated: ideas.length,
        },
        message: 'Content ideas generated successfully',
      };
    } catch (error) {
      this.logger.error('Error generating content ideas:', error);
      return {
        success: false,
        message: 'Failed to generate content ideas',
        error: error.message,
      };
    }
  }

  @Post('compare-niches')
  @ApiOperation({ summary: 'Compare performance across different niches' })
  @ApiResponse({ status: 200, description: 'Niche comparison results' })
  async compareNiches(@Body() body: { niches: string[] }) {
    try {
      const { niches } = body;
      if (!niches || niches.length < 2) {
        return {
          success: false,
          message: 'At least 2 niches required for comparison',
        };
      }

      const comparisonResults = await Promise.all(
        niches.map(async (niche) => {
          try {
            const analysis = await this.analyticsService.analyzeNiche(niche, true);
            return {
              niche,
              metrics: analysis.metrics,
              topVideos: analysis.topVideos.slice(0, 5),
              trendingHashtags: analysis.trendingHashtags.slice(0, 5),
              contentIdeas: analysis.contentIdeas.slice(0, 3),
            };
          } catch (error) {
            this.logger.warn(`Failed to analyze niche ${niche}:`, error);
            return {
              niche,
              error: error.message,
            };
          }
        })
      );

      return {
        success: true,
        data: {
          comparison: comparisonResults,
          summary: this.generateComparisonSummary(comparisonResults),
        },
        message: 'Niche comparison completed successfully',
      };
    } catch (error) {
      this.logger.error('Error comparing niches:', error);
      return {
        success: false,
        message: 'Failed to compare niches',
        error: error.message,
      };
    }
  }

  @Get('comprehensive-analysis/:niche')
  @ApiOperation({ summary: 'Get comprehensive analysis for a specific niche' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['24h', '7d', '30d'] })
  @ApiResponse({ status: 200, description: 'Comprehensive niche analysis' })
  async getComprehensiveAnalysis(
    @Param('niche') niche: string,
    @Query('timeRange') timeRange: string = '7d',
  ) {
    try {
      // Get niche analysis
      const nicheAnalysis = await this.analyticsService.analyzeNiche(niche, true);

      // Get outliers in this niche
      const outliers = await this.outlierDetectionService.getAvailableVideos({
        niche,
        limit: 10,
      });

      // Get content ideas for this niche
      const contentIdeas = await this.contentIdeaService.generateContentIdeas({
        niche,
        limit: 5,
      });

      // Get trending topics
      const trendingTopics = await this.analyzeTrendingTopics(niche);

      // Get audience insights
      const audienceInsights = await this.analyzeAudienceInsights(niche);

      return {
        success: true,
        data: {
          niche,
          timeRange,
          overview: {
            totalVideos: nicheAnalysis.metrics.totalVideos,
            totalViews: nicheAnalysis.metrics.totalViews,
            avgEngagement: nicheAnalysis.metrics.avgEngagementRate,
            avgVirality: nicheAnalysis.metrics.avgViralityScore,
          },
          topVideos: nicheAnalysis.topVideos,
          topChannels: nicheAnalysis.topChannels,
          trendingHashtags: nicheAnalysis.trendingHashtags,
          contentIdeas,
          outliers: outliers.slice(0, 5),
          trendingTopics,
          audienceInsights,
          postingTimeAnalysis: nicheAnalysis.postingTimeAnalysis,
          lastUpdated: new Date(),
        },
        message: 'Comprehensive analysis completed successfully',
      };
    } catch (error) {
      this.logger.error('Error getting comprehensive analysis:', error);
      return {
        success: false,
        message: 'Failed to get comprehensive analysis',
        error: error.message,
      };
    }
  }

  @Get('trending-topics/:niche')
  @ApiOperation({ summary: 'Get trending topics within a specific niche' })
  @ApiResponse({ status: 200, description: 'Trending topics analysis' })
  async getTrendingTopics(@Param('niche') niche: string) {
    try {
      const trendingTopics = await this.analyzeTrendingTopics(niche);
      return {
        success: true,
        data: {
          niche,
          trendingTopics,
          totalTopics: trendingTopics.length,
          lastUpdated: new Date(),
        },
        message: 'Trending topics retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Error getting trending topics:', error);
      return {
        success: false,
        message: 'Failed to get trending topics',
        error: error.message,
      };
    }
  }

  @Get('audience-insights/:niche')
  @ApiOperation({ summary: 'Get audience insights for a specific niche' })
  @ApiResponse({ status: 200, description: 'Audience insights analysis' })
  async getAudienceInsights(@Param('niche') niche: string) {
    try {
      const audienceInsights = await this.analyzeAudienceInsights(niche);
      return {
        success: true,
        data: {
          niche,
          audienceInsights,
          lastUpdated: new Date(),
        },
        message: 'Audience insights retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Error getting audience insights:', error);
      return {
        success: false,
        message: 'Failed to get audience insights',
        error: error.message,
      };
    }
  }

  @Get('viral-predictor')
  @ApiOperation({ summary: 'Predict viral potential for content' })
  @ApiQuery({ name: 'niche', required: false })
  @ApiQuery({ name: 'contentType', required: false })
  @ApiResponse({ status: 200, description: 'Viral prediction results' })
  async predictViralPotential(
    @Query('niche') niche?: string,
    @Query('contentType') contentType?: string,
  ) {
    try {
      // Get recent viral content in the niche
      const viralContent = await this.outlierDetectionService.getAvailableVideos({
        niche,
        limit: 20,
        minViews: 100000, // High view threshold for viral content
      });

      // Analyze patterns in viral content
      const viralPatterns = this.analyzeViralPatterns(viralContent);

      return {
        success: true,
        data: {
          viralPatterns,
          sampleViralContent: viralContent.slice(0, 5),
          recommendations: this.generateViralRecommendations(viralPatterns),
          niche,
          contentType,
        },
        message: 'Viral potential analysis completed successfully',
      };
    } catch (error) {
      this.logger.error('Error predicting viral potential:', error);
      return {
        success: false,
        message: 'Failed to predict viral potential',
        error: error.message,
      };
    }
  }

  @Get('content-quality-assessment')
  @ApiOperation({ summary: 'Assess content quality metrics' })
  @ApiQuery({ name: 'niche', required: false })
  @ApiResponse({ status: 200, description: 'Content quality assessment' })
  async assessContentQuality(@Query('niche') niche?: string) {
    try {
      // Get recent content in the niche
      const recentContent = await this.outlierDetectionService.getAvailableVideos({
        niche,
        limit: 50,
      });

      // Analyze quality metrics
      const qualityMetrics = this.analyzeQualityMetrics(recentContent);

      return {
        success: true,
        data: {
          qualityMetrics,
          recommendations: this.generateQualityRecommendations(qualityMetrics),
          niche,
          sampleSize: recentContent.length,
        },
        message: 'Content quality assessment completed successfully',
      };
    } catch (error) {
      this.logger.error('Error assessing content quality:', error);
      return {
        success: false,
        message: 'Failed to assess content quality',
        error: error.message,
      };
    }
  }

  // Helper methods
  private filterByTimeRange(videos: any[], timeRange: string): any[] {
    const now = new Date();
    const timeRangeMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const cutoffTime = new Date(now.getTime() - timeRangeMs[timeRange]);

    return videos.filter(video => {
      const publishedAt = new Date(video.publishedAt);
      return publishedAt >= cutoffTime;
    });
  }

  private generateComparisonSummary(comparisonResults: any[]): any {
    const validResults = comparisonResults.filter(r => !r.error);

    if (validResults.length === 0) {
      return { message: 'No valid comparison data available' };
    }

    // Find best performing niche
    const bestPerforming = validResults.reduce((best, current) => {
      return (current.metrics?.avgEngagementRate || 0) > (best.metrics?.avgEngagementRate || 0) ? current : best;
    });

    // Calculate averages
    const avgEngagement = validResults.reduce((sum, r) => sum + (r.metrics?.avgEngagementRate || 0), 0) / validResults.length;
    const avgViews = validResults.reduce((sum, r) => sum + (r.metrics?.totalViews || 0), 0) / validResults.length;

    return {
      bestPerformingNiche: bestPerforming.niche,
      averageEngagement: avgEngagement,
      averageViews: avgViews,
      totalNichesAnalyzed: validResults.length,
    };
  }

  private async analyzeTrendingTopics(niche: string): Promise<string[]> {
    try {
      // Get recent videos in the niche
      const recentVideos = await this.outlierDetectionService.getAvailableVideos({
        niche,
        limit: 100,
      });

      // Extract topics from video titles and descriptions
      const allText = recentVideos
        .map(video => `${video.title} ${video.description}`)
        .join(' ')
        .toLowerCase();

      // Simple topic extraction (in production, use NLP/AI)
      const topics = this.extractTopicsFromText(allText);

      return topics.slice(0, 10); // Return top 10 topics
    } catch (error) {
      this.logger.warn(`Failed to analyze trending topics for ${niche}:`, error);
      return [];
    }
  }

  private async analyzeAudienceInsights(niche: string): Promise<any> {
    try {
      // Get recent videos in the niche
      const recentVideos = await this.outlierDetectionService.getAvailableVideos({
        niche,
        limit: 100,
      });

      // Analyze engagement patterns
      const engagementPatterns = this.analyzeEngagementPatterns(recentVideos);

      // Analyze content preferences
      const contentPreferences = this.analyzeContentPreferences(recentVideos);

      return {
        engagementPatterns,
        contentPreferences,
        targetAudience: this.determineTargetAudience(niche),
        recommendations: this.generateAudienceRecommendations(engagementPatterns, contentPreferences),
      };
    } catch (error) {
      this.logger.warn(`Failed to analyze audience insights for ${niche}:`, error);
      return {
        error: 'Failed to analyze audience insights',
      };
    }
  }

  private extractTopicsFromText(text: string): string[] {
    // Simple keyword extraction (in production, use NLP/AI)
    const words = text.split(/\s+/);
    const wordFrequency: Record<string, number> = {};

    words.forEach(word => {
      if (word.length > 3) {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      }
    });

    return Object.entries(wordFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);
  }

  private analyzeEngagementPatterns(videos: any[]): any {
    const engagementRates = videos.map(v => v.engagementRate || 0);
    const avgEngagement = engagementRates.reduce((sum, rate) => sum + rate, 0) / engagementRates.length;

    return {
      averageEngagement: avgEngagement,
      highEngagementThreshold: avgEngagement * 1.5,
      lowEngagementThreshold: avgEngagement * 0.5,
      engagementDistribution: {
        high: engagementRates.filter(r => r > avgEngagement * 1.5).length,
        medium: engagementRates.filter(r => r >= avgEngagement * 0.5 && r <= avgEngagement * 1.5).length,
        low: engagementRates.filter(r => r < avgEngagement * 0.5).length,
      },
    };
  }

  private analyzeContentPreferences(videos: any[]): any {
    const contentTypes = videos.map(v => this.detectContentType(v.title, v.description));
    const typeFrequency: Record<string, number> = {};

    contentTypes.forEach(type => {
      typeFrequency[type] = (typeFrequency[type] || 0) + 1;
    });

    return {
      preferredContentTypes: Object.entries(typeFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([type, count]) => ({ type, count })),
    };
  }

  private detectContentType(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();

    if (text.includes('how to') || text.includes('tutorial')) return 'Educational';
    if (text.includes('review') || text.includes('opinion')) return 'Review';
    if (text.includes('funny') || text.includes('comedy')) return 'Entertainment';
    if (text.includes('challenge') || text.includes('experiment')) return 'Challenge';
    if (text.includes('story') || text.includes('experience')) return 'Story';

    return 'General';
  }

  private determineTargetAudience(niche: string): string {
    const audienceMap: Record<string, string> = {
      'fitness': 'Fitness enthusiasts aged 18-35',
      'gaming': 'Gamers and esports fans',
      'food+drink': 'Food enthusiasts and home cooks',
      'technology': 'Tech enthusiasts and early adopters',
      'beauty': 'Beauty and fashion conscious individuals',
      'education': 'Students and lifelong learners',
      'entertainment': 'General entertainment audience',
      'lifestyle': 'Lifestyle and personal development seekers',
      'travel': 'Travelers and adventure seekers',
      'business': 'Entrepreneurs and professionals',
    };

    return audienceMap[niche] || 'General audience';
  }

  private generateAudienceRecommendations(engagementPatterns: any, contentPreferences: any): string[] {
    const recommendations: string[] = [];

    if (engagementPatterns.averageEngagement < 2) {
      recommendations.push('Focus on creating more engaging content');
      recommendations.push('Add interactive elements to increase engagement');
    }

    if (contentPreferences.preferredContentTypes.length > 0) {
      const topType = contentPreferences.preferredContentTypes[0];
      recommendations.push(`Create more ${topType.type.toLowerCase()} content`);
    }

    return recommendations;
  }

  private analyzeViralPatterns(viralContent: any[]): any {
    const patterns: any = {
      commonElements: [],
      engagementPatterns: [],
      contentTypes: [],
      postingTimes: [],
    };

    // Analyze common elements in viral content
    const allText = viralContent
      .map(video => `${video.title} ${video.description}`)
      .join(' ')
      .toLowerCase();

    // Extract common words/phrases
    const words = allText.split(/\s+/);
    const wordFrequency: Record<string, number> = {};

    words.forEach(word => {
      if (word.length > 3) {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      }
    });

    patterns.commonElements = Object.entries(wordFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);

    return patterns;
  }

  private generateViralRecommendations(viralPatterns: any): string[] {
    return [
      'Include trending keywords in your content',
      'Create content that evokes strong emotions',
      'Post at optimal times for your audience',
      'Use engaging thumbnails and titles',
      'Collaborate with other creators in your niche',
    ];
  }

  private analyzeQualityMetrics(content: any[]): any {
    const metrics = {
      averageTitleLength: 0,
      averageDescriptionLength: 0,
      hashtagUsage: 0,
      callToActionPresence: 0,
      engagementRate: 0,
    };

    if (content.length === 0) return metrics;

    metrics.averageTitleLength = content.reduce((sum, c) => sum + (c.title?.length || 0), 0) / content.length;
    metrics.averageDescriptionLength = content.reduce((sum, c) => sum + (c.description?.length || 0), 0) / content.length;
    metrics.hashtagUsage = content.filter(c => c.hashtags && c.hashtags.length > 0).length / content.length;
    metrics.callToActionPresence = content.filter(c =>
      c.description?.toLowerCase().includes('subscribe') ||
      c.description?.toLowerCase().includes('like') ||
      c.description?.toLowerCase().includes('comment')
    ).length / content.length;
    metrics.engagementRate = content.reduce((sum, c) => sum + (c.engagementRate || 0), 0) / content.length;

    return metrics;
  }

  private generateQualityRecommendations(qualityMetrics: any): string[] {
    const recommendations: string[] = [];

    if (qualityMetrics.averageTitleLength < 50) {
      recommendations.push('Optimize title length for better SEO');
    }

    if (qualityMetrics.averageDescriptionLength < 250) {
      recommendations.push('Add more detailed descriptions');
    }

    if (qualityMetrics.hashtagUsage < 0.5) {
      recommendations.push('Include more relevant hashtags');
    }

    if (qualityMetrics.callToActionPresence < 0.3) {
      recommendations.push('Add more call-to-actions in descriptions');
    }

    if (qualityMetrics.engagementRate < 2) {
      recommendations.push('Focus on creating more engaging content');
    }

    return recommendations;
  }
}
