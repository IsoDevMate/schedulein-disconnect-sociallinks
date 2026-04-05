import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiParam,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AnalyticsService } from "../services/analytics.service";
import { CrossNicheComparisonService } from "../services/cross-niche-comparison.service";
import {
  IViralityScore,
  ITrendAnalysis,
  INicheAnalysis,
} from "../services/analytics.interface";
import {
  ViralityScoreResponseDto,
  TrendAnalysisResponseDto,
  NicheAnalysisResponseDto,
  CrossNicheComparisonDto,
} from "../dto/analytics-response.dto";

@ApiTags("analytics")
@Controller("analytics")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly crossNicheComparisonService: CrossNicheComparisonService,
  ) {}

  @Get("virality-score/:videoId")
  @ApiOperation({
    summary: "Calculate virality score for a video",
    description:
      "Analyzes a YouTube video and calculates its viral potential score based on engagement metrics, growth velocity, and content optimization factors. The score ranges from 0-100, where higher scores indicate greater viral potential.",
  })
  @ApiParam({
    name: "videoId",
    description: "YouTube video ID to analyze",
    example: "dQw4w9WgXcQ",
  })
  @ApiResponse({
    status: 200,
    description: "Returns the virality score with detailed metrics",
    type: ViralityScoreResponseDto,
  })
  @ApiResponse({ status: 404, description: "Video not found in database" })
  @ApiResponse({ status: 500, description: "Error calculating virality score" })
  async getViralityScore(
    @Param("videoId") videoId: string,
  ): Promise<IViralityScore> {
    return this.analyticsService.calculateViralityScore(videoId);
  }

  @Get("trends")
  @ApiOperation({
    summary: "Get trending content analysis",
    description:
      "Analyzes trending content across all niches within the specified time range. Provides insights into top-performing hashtags, topics, niches, and trending videos with their performance metrics.",
  })
  @ApiQuery({
    name: "timeRange",
    description: "Time range for trend analysis",
    enum: ["24h", "7d", "30d"],
    example: "7d",
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: "Returns comprehensive trend analysis",
    type: TrendAnalysisResponseDto,
  })
  @ApiResponse({ status: 500, description: "Error analyzing trends" })
  async getTrends(
    @Query("timeRange") timeRange: "24h" | "7d" | "30d" = "7d",
  ): Promise<ITrendAnalysis> {
    return this.analyticsService.analyzeTrends(timeRange);
  }

  @Get("niche/:niche")
  @ApiOperation({
    summary: "Analyze a specific niche",
    description:
      "Performs comprehensive analysis of a specific content niche. Combines database and real-time YouTube API data to provide insights into trending hashtags, content ideas, optimal posting times, and top-performing videos/channels within the niche.",
  })
  @ApiParam({
    name: "niche",
    description:
      "Content niche to analyze (e.g., fitness, cooking, gaming, tech, beauty)",
    example: "fitness",
  })
  @ApiQuery({
    name: "useRealTime",
    description: "Whether to include real-time data from YouTube API",
    type: Boolean,
    example: true,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: "Returns comprehensive niche analysis",
    type: NicheAnalysisResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Niche not found or no data available",
  })
  @ApiResponse({ status: 500, description: "Error analyzing niche" })
  async getNicheAnalysis(
    @Param("niche") niche: string,
    @Query("useRealTime") useRealTime: boolean = true,
    @Request() req: any,
  ): Promise<INicheAnalysis> {
    const userId = req.user?._id || req.user?.id || req.user?.sub;
    return this.analyticsService.analyzeNiche(niche, useRealTime, userId);
  }

  @Get("niche-comparison")
  @ApiOperation({
    summary: "Compare performance across multiple niches",
    description:
      "Compares performance metrics across multiple content niches to identify strengths, weaknesses, and strategic opportunities. Provides ranked analysis and actionable insights for content strategy.",
  })
  @ApiQuery({
    name: "niches",
    description: "Comma-separated list of niches to compare",
    example: "fitness,cooking,gaming",
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: "Returns cross-niche comparison analysis",
    type: CrossNicheComparisonDto,
  })
  @ApiResponse({ status: 400, description: "Invalid niches parameter" })
  @ApiResponse({ status: 500, description: "Error comparing niches" })
  async getNicheComparison(@Query("niches") niches: string): Promise<any> {
    const nicheArray = niches.split(",").map((n) => n.trim());
    return this.crossNicheComparisonService.compareNiches(nicheArray);
  }
}
