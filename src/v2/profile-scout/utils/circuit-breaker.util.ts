/**
 * Simple Circuit Breaker Utility
 * Prevents infinite loops and API abuse by temporarily disabling failing providers
 */

export class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailureTime: Map<string, number> = new Map();
  private readonly maxFailures = 3;
  private readonly resetTimeout = 60000; // 1 minute

  /**
   * Check if a provider should be called
   */
  canCall(providerName: string): boolean {
    const failures = this.failures.get(providerName) || 0;
    const lastFailure = this.lastFailureTime.get(providerName) || 0;
    const now = Date.now();

    // If we've exceeded max failures and haven't waited long enough
    if (failures >= this.maxFailures && (now - lastFailure) < this.resetTimeout) {
      return false;
    }

    // Reset failure count if enough time has passed
    if (failures >= this.maxFailures && (now - lastFailure) >= this.resetTimeout) {
      this.failures.set(providerName, 0);
      this.lastFailureTime.delete(providerName);
    }

    return true;
  }

  /**
   * Record a successful call
   */
  recordSuccess(providerName: string): void {
    this.failures.set(providerName, 0);
    this.lastFailureTime.delete(providerName);
  }

  /**
   * Record a failed call
   */
  recordFailure(providerName: string): void {
    const failures = this.failures.get(providerName) || 0;
    this.failures.set(providerName, failures + 1);
    this.lastFailureTime.set(providerName, Date.now());
  }

  /**
   * Get status of a provider
   */
  getStatus(providerName: string): 'healthy' | 'degraded' | 'failed' {
    const failures = this.failures.get(providerName) || 0;

    if (failures === 0) return 'healthy';
    if (failures < this.maxFailures) return 'degraded';
    return 'failed';
  }
}



