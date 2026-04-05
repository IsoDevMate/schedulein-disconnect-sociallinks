import { Injectable, Logger } from "@nestjs/common";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache = new Map<string, CacheEntry<any>>();

  /**
   * Set cache entry with TTL
   */
  set<T>(key: string, data: T, ttlMinutes: number = 60): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000,
    };
    this.cache.set(key, entry);
  }

  /**
   * Get cache entry if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T>;

    if (!entry) {
      return null;
    }

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Cache subscriber count for a channel
   */
  setSubscriberCount(channelId: string, subscriberCount: number): void {
    this.set(`subscriber:${channelId}`, subscriberCount, 60); // Cache for 1 hour
  }

  /**
   * Get cached subscriber count
   */
  getSubscriberCount(channelId: string): number | null {
    return this.get<number>(`subscriber:${channelId}`);
  }

  /**
   * Cache geographic classification
   */
  setGeographicClassification(channelId: string, classification: any): void {
    this.set(`geo:${channelId}`, classification, 24 * 60); // Cache for 24 hours
  }

  /**
   * Get cached geographic classification
   */
  getGeographicClassification(channelId: string): any | null {
    return this.get(`geo:${channelId}`);
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
