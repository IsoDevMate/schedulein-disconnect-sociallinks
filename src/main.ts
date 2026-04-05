import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { Logger, ValidationPipe, BadRequestException } from "@nestjs/common";
import { join } from "path";
import * as fs from "fs";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { BullBoardModule } from "./asynched/bull-board.module";
import { getQueueToken } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { V2Module } from "./v2/v2.module";
import * as express from 'express';

async function bootstrap() {
  let app: NestExpressApplication;

  try {
    const httpsOptions =
      process.env.NODE_ENV === "production"
        ? {
            key: fs.readFileSync("/etc/nginx/ssl/nginx.key"),
            cert: fs.readFileSync("/etc/nginx/ssl/nginx.crt"),
          }
        : {
            key: fs.readFileSync("../schedulein/key.pem"),
            cert: fs.readFileSync("../schedulein/cert.pem"),
          };

    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      httpsOptions,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error("SSL certificate files not found. Please check the paths.");
    } else if (error.library === "PEM routines") {
      console.error(
        "Invalid SSL certificate format. Please check the certificate files.",
      );
    } else {
      console.error("Error creating application:", error.message);
    }

    // Fallback to HTTP if HTTPS setup fails
    console.log("Falling back to HTTP-only mode");
    app = await NestFactory.create<NestExpressApplication>(AppModule);
  }

  // Add body parsing middleware with raw body retention for webhook signature verification
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Swagger v1 (legacy) - All modules
  const config = new DocumentBuilder()
    .setTitle("Comprehensive API Documentation for Socials&Links ")
    .setDescription(
      "Full application API documentation. Welcome to the Social Media Management API! This API enables you to manage posts, handle LinkedIn interactions, and process payments through Stripe integration. You can also store files in S3, use OpenAI services, manage bloggers, and handle subscriptions and affiliate programs. Enjoy!",
    )
    .setVersion("1.0")
    .addTag("auth", "Authentication endpoints")
    .addTag("users", "User management endpoints")
    .addTag("posts", "Posts management")
    .addTag("agencies", "Agency-related endpoints")
    .addTag("linkedin", "LinkedIn integration")
    .addTag("stripe", "Payment processing")
    .addTag("s3", "File storage")
    .addTag("openai", "AI services")
    .addTag("bloggers", "Bloggers management")
    .addTag("subscriptions", "Subscription services")
    .addTag("affiliate", "Affiliate program")
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup("api", app, document);

  // Swagger v2 (new) - Only v2 modules
  const v2Config = new DocumentBuilder()
    .setTitle("Social Media Management API v2")
    .setDescription(`
# Social Media Management API v2

Welcome to the next-generation Social Media Management API! This API provides advanced features for managing social media accounts, content, and analytics across multiple platforms.

## 🚀 Key Features

### 🔐 Identity Management (v2-identities)
- **User Registration & Authentication**: Email-based registration with verification
- **OAuth Integration**: Seamless login with TikTok, Instagram, YouTube, and LinkedIn
- **Management Authorization**: Special OAuth flows for content management access
- **Multi-Platform Identity**: Unified identity system across all social platforms

### 🔗 Account Connection (v2-account-connect)
- **Social Account Management**: Connect and manage multiple social media accounts
- **Content Analytics**: Advanced analytics and performance metrics
- **Goal Setting & Tracking**: Set and monitor content goals
- **Bookmark Management**: Save and organize content ideas
- **Content Summary**: AI-powered content analysis and insights
- **Real-time Monitoring**: Track account performance and engagement

### 📊 Management Dashboard (v2-management)
- **TikTok Management**: Comprehensive TikTok video and analytics management
- **Content Performance**: Detailed performance metrics and insights
- **Dashboard Analytics**: Unified dashboard for all connected accounts
- **Content Optimization**: Data-driven content recommendations

### 🔄 OAuth Services (v2-oauth)
- **Token Management**: Secure token handling and refresh mechanisms
- **Platform Integration**: Deep integration with social media APIs
- **Authorization Flows**: Streamlined OAuth processes for all platforms

## 🔧 Authentication

All endpoints require Bearer token authentication. OAuth endpoints are publicly accessible for initial authentication flows.

## 📈 Analytics & Insights

- Real-time performance tracking
- Cross-platform analytics comparison
- Content optimization recommendations
- Engagement rate analysis
- Hashtag performance tracking

## 🎯 Use Cases

- **Content Creators**: Manage multiple social media accounts from one platform
- **Agencies**: Oversee client accounts with comprehensive analytics
- **Businesses**: Track social media performance and optimize content strategy
- **Influencers**: Analyze content performance and grow audience engagement

## 🔗 API Endpoints

- **Base URL**: \`/v2\`
- **Documentation**: \`/docs/v2\`
- **Health Check**: \`/v2/health\`

## 📚 Getting Started

1. Register an account using email or OAuth
2. Connect your social media accounts
3. Start tracking analytics and managing content
4. Set goals and monitor progress

For detailed endpoint documentation, explore the sections below.
    `)
    .setVersion("2.0.0")
    .addBearerAuth()
    .addTag("v2-identities", "User identity management and authentication")
    .addTag("v2-account-connect", "Social account connection and management")
    .addTag("v2-management", "Content management and analytics dashboard")
    .addTag("v2-oauth", "OAuth token management and platform integration")
    .build();
  const v2Doc = SwaggerModule.createDocument(app, v2Config, {
    include: [V2Module],
  });
  SwaggerModule.setup("docs/v2", app, v2Doc);

  app.enableCors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  });

  app.useStaticAssets(join(__dirname, "..", "uploads"));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: (errors) => {
        console.error(" All Validation errors:", errors);
        return new BadRequestException(errors);
      },
    }),
  );
  app.enableShutdownHooks();

  const queue = app.get<Queue>(getQueueToken("asynched-jobs"));
  BullBoardModule.setup(app, queue);

  const port = process.env.PORT ?? 3000;
  const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";
  const domain =
    process.env.NODE_ENV === "production" ? "13.53.84.76" : "localhost";
  await app.listen(port, host);

  Logger.log(
    `Server running on http://${domain}:${port} and https://${domain}:${port}`,
    "Bootstrap",
  );
}

bootstrap();
