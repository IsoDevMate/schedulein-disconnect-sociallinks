import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  UnauthorizedException,
  Param,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiParam,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  OutlierDetectionService,
  RisingStarVideo,
} from "../services/outlier-detection.service";

interface AuthenticatedRequest extends Request {
  user?: any;
}
@ApiTags("Rising Stars")
@Controller("youtube/rising-stars")
@UseGuards(JwtAuthGuard)
export class RisingStarsController {
  constructor(
    private readonly outlierDetectionService: OutlierDetectionService,
  ) {}

  @Get("auth-status")
  @ApiOperation({ summary: "Check YouTube authentication status" })
  @ApiResponse({ status: 200, description: "Authentication status checked" })
  async checkYouTubeAuthStatus(@Request() req: AuthenticatedRequest) {
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!userId) {
      return {
        authenticated: false,
        message: "User ID not found",
        error: "Missing user identification",
        nextStep: "Please ensure you are properly authenticated",
      };
    }

    try {
      // Check if user has YouTube tokens
      const user =
        await this.outlierDetectionService["usersService"].findById(userId);

      const hasYouTubeTokens =
        user && (user.youtubeAccessToken || user.youtubeRefreshToken);

      return {
        authenticated: hasYouTubeTokens,
        message: hasYouTubeTokens
          ? "YouTube authentication is valid"
          : "YouTube authentication required",
        nextStep: hasYouTubeTokens
          ? "You can now use YouTube features"
          : "Please authenticate with YouTube",
        authUrl: "/auth/youtube/login",
        userId: userId,
      };
    } catch (error) {
      return {
        authenticated: false,
        message: "YouTube authentication failed",
        error: error.message,
        nextStep: "Please authenticate with YouTube",
        authUrl: "/auth/youtube/login",
        userId: userId,
      };
    }
  }

  @Get()
  @ApiOperation({ summary: "Find rising star videos that are growing fast" })
  @ApiQuery({
    name: "timeRange",
    required: false,
    enum: ["hour", "day", "week", "month"],
    description: "Time range for analysis",
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Specific niche to analyze",
  })
  @ApiQuery({
    name: "minGrowthRate",
    required: false,
    type: Number,
    description: "Minimum views per hour (default: 100)",
  })
  @ApiQuery({
    name: "maxResults",
    required: false,
    type: Number,
    description: "Maximum number of results (default: 50)",
  })
  @ApiQuery({
    name: "includeMusicAnalysis",
    required: false,
    type: Boolean,
    description: "Include music trend analysis",
  })
  @ApiQuery({
    name: "regionCode",
    required: false,
    description:
      "Geographic region (e.g., 'KE' for Kenya, 'US' for United States)",
  })
  @ApiQuery({
    name: "includeLocalCreators",
    required: false,
    type: Boolean,
    description: "Include local creators (default: true)",
  })
  @ApiQuery({
    name: "includeInternationalCreators",
    required: false,
    type: Boolean,
    description: "Include international creators (default: true)",
  })
  @ApiQuery({
    name: "subscriberRange",
    required: false,
    enum: ["small", "medium", "large", "all"],
    description: "Filter by channel size (default: all)",
  })
  @ApiResponse({ status: 200, description: "Rising stars found successfully" })
  async findRisingStars(
    @Request() req: AuthenticatedRequest,
    @Query("timeRange") timeRange: string = "day",
    @Query("niche") niche?: string,
    @Query("minGrowthRate") minGrowthRate: number = 500,
    @Query("maxResults") maxResults: number = 50,
  ): Promise<RisingStarVideo[]> {
    const userId = req.user._id || req.user.id || req.user.sub;
    console.log("userId", userId);

    if (!userId) {
      throw new UnauthorizedException({
        message: "User ID not found in request",
        error: "Missing user identification",
        solution: "Please ensure you are properly authenticated",
      });
    }

    try {
      return await this.outlierDetectionService.findRisingStars(userId, {
        timeRange,
        niche,
        minGrowthRate,
        maxResults,
      });
    } catch (error) {
      // Handle specific YouTube authentication errors
      if (
        error.message?.includes("No refresh token") ||
        error.message?.includes("User not found") ||
        error.message?.includes("YouTube tokens expired")
      ) {
        throw new UnauthorizedException({
          message: "YouTube authentication required",
          error: error.message,
          solution: "Please authenticate with YouTube first",
          endpoint: "/auth/youtube/login",
        });
      }
      throw error;
    }
  }

  @Get("competitors")
  @ApiOperation({ summary: "Analyze competitors in a specific niche" })
  @ApiQuery({
    name: "niche",
    required: true,
    description: "Specific niche to analyze competitors",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    enum: ["24h", "7d", "30d"],
    description: "Time range for analysis",
  })
  @ApiResponse({ status: 200, description: "Competitor analysis completed" })
  async analyzeCompetitors(
    @Request() req: AuthenticatedRequest,
    @Query("niche") niche: string,
    @Query("timeRange") timeRange: string = "7d",
  ): Promise<any> {
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    return this.outlierDetectionService.analyzeCompetitors(
      userId,
      niche,
      timeRange,
    );
  }

  @Get("hashtag-trends")
  @ApiOperation({ summary: "Analyze hashtag trends and performance" })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Specific niche to analyze hashtags",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    enum: ["24h", "7d", "30d"],
    description: "Time range for analysis",
  })
  @ApiResponse({ status: 200, description: "Hashtag trend analysis completed" })
  async analyzeHashtagTrends(
    @Request() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("timeRange") timeRange: string = "7d",
  ): Promise<any> {
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    return this.outlierDetectionService.analyzeHashtagTrends(
      userId,
      niche,
      timeRange,
    );
  }

  @Get("track/:videoId")
  @ApiOperation({ summary: "Track real-time performance of a specific video" })
  @ApiParam({
    name: "videoId",
    description: "YouTube video ID to track",
  })
  @ApiResponse({ status: 200, description: "Video performance tracking data" })
  async trackVideoPerformance(
    @Request() req: AuthenticatedRequest,
    @Param("videoId") videoId: string,
  ): Promise<any> {
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    return this.outlierDetectionService.trackVideoPerformance(videoId);
  }

  @Get("performance-history/:videoId")
  @ApiOperation({ summary: "Get performance history of a specific video" })
  @ApiParam({
    name: "videoId",
    description: "YouTube video ID to get history for",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    enum: ["7d", "30d", "90d"],
    description: "Time range for history analysis",
  })
  @ApiResponse({ status: 200, description: "Video performance history data" })
  async getVideoPerformanceHistory(
    @Request() req: AuthenticatedRequest,
    @Param("videoId") videoId: string,
    @Query("timeRange") timeRange: string = "7d",
  ): Promise<any> {
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    return this.outlierDetectionService.getVideoPerformanceHistory(
      videoId,
      timeRange,
    );
  }

  @Get("available-videos")
  @ApiOperation({ summary: "Get list of available video IDs for testing" })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Number of videos to return (default: 10)",
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "minViews",
    required: false,
    type: Number,
    description: "Minimum view count filter",
  })
  @ApiResponse({ status: 200, description: "List of available videos" })
  async getAvailableVideos(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit: number = 10,
    @Query("niche") niche?: string,
    @Query("minViews") minViews?: number,
  ): Promise<any> {
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    return this.outlierDetectionService.getAvailableVideos({
      limit,
      niche,
      minViews,
    });
  }

  @Get("predict-trends")
  @ApiOperation({ summary: "Predict trends for a specific niche" })
  @ApiQuery({
    name: "niche",
    required: true,
    description: "Niche to predict trends for",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    enum: ["7d", "30d"],
    description: "Time range for trend analysis",
  })
  @ApiResponse({ status: 200, description: "Trend predictions completed" })
  async predictTrends(
    @Request() req: AuthenticatedRequest,
    @Query("niche") niche: string,
    @Query("timeRange") timeRange: string = "30d",
  ): Promise<any> {
    const userId = req.user._id || req.user.id || req.user.sub;

    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    return this.outlierDetectionService.predictTrends(niche, timeRange);
  }

  @Get("outliers")
  @ApiOperation({ summary: "Find outlier videos (already viral)" })
  @ApiQuery({
    name: "timeRange",
    required: false,
    enum: ["24h", "7d", "30d"],
    description: "Time range for analysis",
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Specific niche to analyze",
  })
  @ApiQuery({
    name: "minViews",
    required: false,
    type: Number,
    description: "Minimum view count (default: 1000)",
  })
  @ApiQuery({
    name: "maxResults",
    required: false,
    type: Number,
    description: "Maximum number of results (default: 50)",
  })
  @ApiResponse({ status: 200, description: "Outliers found successfully" })
  async detectOutliers(
    @Request() req,
    @Query("timeRange") timeRange: "24h" | "7d" | "30d" = "24h",
    @Query("niche") niche?: string,
    @Query("minViews") minViews: number = 1000,
    @Query("maxResults") maxResults: number = 50,
  ) {
    const userId =
      req.user?._id ||
      req.user?.id ||
      req.user?.sub ||
      "687ff8258f19eef4a5c05124";
    return this.outlierDetectionService.detectOutliers(userId, {
      timeRange,
      niche,
      minViews,
      maxResults,
    });
  }
}
