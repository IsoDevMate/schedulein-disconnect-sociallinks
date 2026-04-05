import { Controller, Get, Query, UseGuards, Req } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { V2JwtAuthGuard } from "../../v2/account-connect/guards/v2-jwt-auth.guard";
import {
  OutlierDetectionService,
  OutlierAnalysis,
} from "../services/outlier-detection.service";
import { Request } from "express";

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    userId?: string;
  };
}

@ApiTags("outlier-detection")
@Controller("youtube/outliers")
@UseGuards(V2JwtAuthGuard)
export class OutlierDetectionController {
  constructor(
    private readonly outlierDetectionService: OutlierDetectionService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Detect viral outliers and high-performing content",
  })
  @ApiResponse({
    status: 200,
    description: "Returns outlier analysis with insights",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    description: "Time range for analysis (24h, 7d, 30d)",
    enum: ["24h", "7d", "30d"],
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "minViews",
    required: false,
    description: "Minimum view count threshold (default: 100000)",
  })
  @ApiQuery({
    name: "maxResults",
    required: false,
    description: "Maximum number of outliers to return (default: 50)",
  })
  @ApiQuery({
    name: "minViewsPerSub",
    required: false,
    description: "Minimum views per subscriber ratio gate (default: disabled)",
  })
  @ApiQuery({
    name: "includeSubscriberCount",
    required: false,
    description: "If true, include subscriberCount in response (may use quota)",
  })
  async detectOutliers(
    @Req() req: AuthenticatedRequest,
    @Query("timeRange") timeRange?: "24h" | "7d" | "30d",
    @Query("niche") niche?: string,
    @Query("minViews") minViews?: string,
    @Query("maxResults") maxResults?: string,
    @Query("minViewsPerSub") minViewsPerSub?: string,
    @Query("includeSubscriberCount") includeSubscriberCount?: string,
  ): Promise<OutlierAnalysis> {
    return this.outlierDetectionService.detectOutliers(
      req.user?.id || req.user?.userId || "687ff8258f19eef4a5c05124",
      {
        timeRange,
        niche,
        minViews: minViews ? parseInt(minViews, 10) : undefined,
        maxResults: maxResults ? parseInt(maxResults, 10) : undefined,
        minViewsPerSub: minViewsPerSub ? parseFloat(minViewsPerSub) : undefined,
        includeSubscriberCount:
          includeSubscriberCount === "true" || includeSubscriberCount === "1",
      },
    );
  }

  @Get("viral")
  @ApiOperation({ summary: "Get viral outliers specifically" })
  @ApiResponse({ status: 200, description: "Returns viral outliers analysis" })
  @ApiQuery({
    name: "timeRange",
    required: false,
    description: "Time range for analysis",
    enum: ["24h", "7d", "30d"],
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  async getViralOutliers(
    @Req() req: AuthenticatedRequest,
    @Query("timeRange") timeRange?: "24h" | "7d" | "30d",
    @Query("niche") niche?: string,
  ): Promise<OutlierAnalysis> {
    const analysis = await this.outlierDetectionService.detectOutliers(
      req.user?.id || req.user?.userId || "687ff8258f19eef4a5c05124",
      {
        timeRange,
        niche,
      },
    );

    // Filter to only viral outliers
    return {
      ...analysis,
      topOutliers: analysis.topOutliers.filter(
        (outlier) => outlier.outlierType === "viral",
      ),
      outlierTypes: {
        viral: analysis.outlierTypes.viral,
        engagement: 0,
        velocity: 0,
        niche_breakthrough: 0,
      },
    };
  }

  @Get("engagement")
  @ApiOperation({ summary: "Get high engagement outliers" })
  @ApiResponse({
    status: 200,
    description: "Returns engagement outliers analysis",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    description: "Time range for analysis",
    enum: ["24h", "7d", "30d"],
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  async getEngagementOutliers(
    @Req() req: AuthenticatedRequest,
    @Query("timeRange") timeRange?: "24h" | "7d" | "30d",
    @Query("niche") niche?: string,
  ): Promise<OutlierAnalysis> {
    const analysis = await this.outlierDetectionService.detectOutliers(
      req.user?.id || req.user?.userId || "687ff8258f19eef4a5c05124",
      {
        timeRange,
        niche,
      },
    );

    // Filter to only engagement outliers
    return {
      ...analysis,
      topOutliers: analysis.topOutliers.filter(
        (outlier) => outlier.outlierType === "engagement",
      ),
      outlierTypes: {
        viral: 0,
        engagement: analysis.outlierTypes.engagement,
        velocity: 0,
        niche_breakthrough: 0,
      },
    };
  }

  @Get("velocity")
  @ApiOperation({ summary: "Get rapid growth outliers" })
  @ApiResponse({
    status: 200,
    description: "Returns velocity outliers analysis",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    description: "Time range for analysis",
    enum: ["24h", "7d", "30d"],
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  async getVelocityOutliers(
    @Req() req: AuthenticatedRequest,
    @Query("timeRange") timeRange?: "24h" | "7d" | "30d",
    @Query("niche") niche?: string,
  ): Promise<OutlierAnalysis> {
    const analysis = await this.outlierDetectionService.detectOutliers(
      req.user?.id || req.user?.userId || "687ff8258f19eef4a5c05124",
      {
        timeRange,
        niche,
      },
    );

    // Filter to only velocity outliers
    return {
      ...analysis,
      topOutliers: analysis.topOutliers.filter(
        (outlier) => outlier.outlierType === "velocity",
      ),
      outlierTypes: {
        viral: 0,
        engagement: 0,
        velocity: analysis.outlierTypes.velocity,
        niche_breakthrough: 0,
      },
    };
  }

  @Get("niche-breakthrough")
  @ApiOperation({ summary: "Get niche breakthrough outliers" })
  @ApiResponse({
    status: 200,
    description: "Returns niche breakthrough outliers analysis",
  })
  @ApiQuery({
    name: "timeRange",
    required: false,
    description: "Time range for analysis",
    enum: ["24h", "7d", "30d"],
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  async getNicheBreakthroughOutliers(
    @Req() req: AuthenticatedRequest,
    @Query("timeRange") timeRange?: "24h" | "7d" | "30d",
    @Query("niche") niche?: string,
  ): Promise<OutlierAnalysis> {
    const analysis = await this.outlierDetectionService.detectOutliers(
      req.user?.id || req.user?.userId || "687ff8258f19eef4a5c05124",
      {
        timeRange,
        niche,
      },
    );

    // Filter to only niche breakthrough outliers
    const filteredOutliers = analysis.topOutliers.filter(
      (outlier) => outlier.outlierType === "niche_breakthrough",
    );

    return {
      ...analysis,
      topOutliers: filteredOutliers,
      outliersFound: filteredOutliers.length,
      outlierTypes: {
        viral: 0,
        engagement: 0,
        velocity: 0,
        niche_breakthrough: filteredOutliers.length,
      },
    };
  }
}
