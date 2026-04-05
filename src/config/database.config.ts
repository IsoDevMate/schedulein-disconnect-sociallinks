import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as mongoose from "mongoose";
import keys from "./keys";
@Injectable()
export class DatabaseConfig {
  constructor(private configService: ConfigService) {}

  get uri(): string {
    return keys.mongoURI;
  }

  get options(): mongoose.ConnectOptions {
    // For MongoDB Node.js Driver v4.0.0 +
    return {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      family: 4, // Use IPv4, skip trying IPv6
      maxPoolSize: 10, // Maximum number of connections in the connection pool
      retryWrites: true,
      w: "majority",
    };
  }
}
