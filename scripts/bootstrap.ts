import { NestFactory } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DatabaseConfig } from "../src/config/database.config";
import * as path from "path";

let configService: ConfigService;
let databaseConfig: DatabaseConfig;

export async function bootstrap() {
  try {
    // Create a temporary app context to get the ConfigService
    const appContext = await NestFactory.createApplicationContext(
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: path.resolve(process.cwd(), ".env"),
      }),
    );

    // Get the ConfigService instance
    configService = appContext.get(ConfigService);
    databaseConfig = new DatabaseConfig(configService);

    // Verify database configuration
    if (!databaseConfig.uri) {
      throw new Error(
        "MongoDB connection string is not configured. Please set MONGODB_URI in your .env file.",
      );
    }

    console.log("Configuration loaded successfully");
    return { configService, databaseConfig };
  } catch (error) {
    console.error("Failed to initialize configuration:", error);
    process.exit(1);
  }
}

export function getConfigService() {
  if (!configService) {
    throw new Error("ConfigService not initialized. Call bootstrap() first.");
  }
  return configService;
}

export function getDatabaseConfig() {
  if (!databaseConfig) {
    throw new Error("DatabaseConfig not initialized. Call bootstrap() first.");
  }
  return databaseConfig;
}
