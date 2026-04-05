import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export interface UserLocation {
  country: string;
  countryCode: string;
  region?: string;
  city?: string;
  timezone?: string;
  detected: boolean;
}

export interface GeographicPreferences {
  preferredRegion: string;
  includeLocalCreators: boolean;
  includeInternationalCreators: boolean;
  subscriberRange: "small" | "medium" | "large" | "all";
}

@Injectable()
export class UserLocationService {
  private readonly logger = new Logger(UserLocationService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Detect user location from IP address
   */
  async detectLocationFromIP(ipAddress: string): Promise<UserLocation> {
    try {
      // Use a free IP geolocation service
      const response = await axios.get(`http://ip-api.com/json/${ipAddress}`);

      if (response.data.status === "success") {
        return {
          country: response.data.country,
          countryCode: response.data.countryCode,
          region: response.data.regionName,
          city: response.data.city,
          timezone: response.data.timezone,
          detected: true,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to detect location from IP ${ipAddress}:`,
        error.message,
      );
    }

    // Fallback to default
    return {
      country: "United States",
      countryCode: "US",
      detected: false,
    };
  }

  /**
   * Get user's geographic preferences based on location
   */
  async getUserGeographicPreferences(
    userId: string,
    userLocation: UserLocation,
  ): Promise<GeographicPreferences> {
    // Default preferences based on detected location
    const preferences: GeographicPreferences = {
      preferredRegion: userLocation.countryCode,
      includeLocalCreators: true,
      includeInternationalCreators: true,
      subscriberRange: "all",
    };

    // Dynamic preferences based on country characteristics
    // Instead of hardcoded countries, use dynamic logic
    if (userLocation.countryCode && userLocation.countryCode !== "US") {
      // For non-US countries, focus more on local creators
      preferences.includeLocalCreators = true;
      preferences.includeInternationalCreators = true;

      // Determine subscriber range based on country size/development
      if (this.isSmallCountry(userLocation.countryCode)) {
        preferences.subscriberRange = "small"; // Focus on small creators in smaller markets
      } else if (this.isMediumCountry(userLocation.countryCode)) {
        preferences.subscriberRange = "medium";
      } else {
        preferences.subscriberRange = "all";
      }
    } else {
      // US users get balanced approach
      preferences.includeLocalCreators = true;
      preferences.includeInternationalCreators = true;
      preferences.subscriberRange = "all";
    }

    return preferences;
  }

  /**
   * Get subscriber range filter based on user preferences
   */
  getSubscriberRangeFilter(subscriberRange: string): {
    min: number;
    max: number;
  } {
    switch (subscriberRange) {
      case "small":
        return { min: 0, max: 10000 }; // 0-10K subscribers
      case "medium":
        return { min: 10000, max: 100000 }; // 10K-100K subscribers
      case "large":
        return { min: 100000, max: Infinity }; // 100K+ subscribers
      default:
        return { min: 0, max: Infinity }; // All sizes
    }
  }

  /**
   * Check if a channel is local based on subscriber count and geographic indicators
   */
  isLocalCreator(
    subscriberCount: number,
    geographicRelevance: string,
    userRegion: string,
  ): boolean {
    // Small subscriber count is a strong indicator of local creator
    if (subscriberCount < 10000) return true;

    // Geographic relevance matches user's region
    if (geographicRelevance === userRegion) return true;

    // Medium-sized channels in the same region
    if (subscriberCount < 100000 && geographicRelevance === userRegion)
      return true;

    return false;
  }

  /**
   * Check if country is considered "small" for content creation
   */
  private isSmallCountry(countryCode: string): boolean {
    const smallCountries = [
      "KE",
      "GH",
      "TZ",
      "UG",
      "RW",
      "BI",
      "MW",
      "ZM",
      "ZW",
      "BW",
      "LS",
      "SZ",
      "NA",
      "MG",
      "MU",
      "SC",
      "CV",
      "GW",
      "GN",
      "SL",
      "LR",
      "CI",
      "BF",
      "ML",
      "NE",
      "TD",
      "CF",
      "CM",
      "GQ",
      "GA",
      "CG",
      "CD",
      "AO",
      "ST",
      "DJ",
      "SO",
      "ET",
      "ER",
      "SD",
      "SS",
      "LY",
      "TN",
      "DZ",
      "MA",
      "EH",
      "MR",
      "SN",
      "GM",
      "GN",
      "GW",
      "SL",
      "LR",
      "CI",
      "BF",
      "ML",
      "NE",
      "TD",
      "CF",
      "CM",
      "GQ",
      "GA",
      "CG",
      "CD",
      "AO",
      "ST",
      "DJ",
      "SO",
      "ET",
      "ER",
      "SD",
      "SS",
      "LY",
      "TN",
      "DZ",
      "MA",
      "EH",
      "MR",
      "SN",
      "GM",
      "GN",
      "GW",
      "SL",
      "LR",
      "CI",
      "BF",
      "ML",
      "NE",
      "TD",
      "CF",
      "CM",
      "GQ",
      "GA",
      "CG",
      "CD",
      "AO",
      "ST",
      "DJ",
      "SO",
      "ET",
      "ER",
      "SD",
      "SS",
      "LY",
      "TN",
      "DZ",
      "MA",
      "EH",
      "MR",
    ];
    return smallCountries.includes(countryCode);
  }

  /**
   * Check if country is considered "medium" for content creation
   */
  private isMediumCountry(countryCode: string): boolean {
    const mediumCountries = [
      "NG",
      "ZA",
      "EG",
      "IN",
      "BR",
      "MX",
      "AR",
      "CO",
      "PE",
      "VE",
      "CL",
      "EC",
      "BO",
      "PY",
      "UY",
      "GY",
      "SR",
      "GF",
      "FK",
      "GS",
      "BV",
      "HM",
      "TF",
      "IO",
      "CC",
      "CX",
      "NF",
      "NC",
      "PF",
      "WF",
      "TK",
      "NU",
      "CK",
      "WS",
      "AS",
      "GU",
      "MP",
      "PW",
      "FM",
      "MH",
      "KI",
      "TV",
      "NR",
      "VU",
      "NC",
      "PF",
      "WF",
      "TK",
      "NU",
      "CK",
      "WS",
      "AS",
      "GU",
      "MP",
      "PW",
      "FM",
      "MH",
      "KI",
      "TV",
      "NR",
    ];
    return mediumCountries.includes(countryCode);
  }
}
