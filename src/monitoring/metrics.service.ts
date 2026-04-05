import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge, Counter, Histogram } from 'prom-client';
import { MongoDBMetricsService } from './services/mongodb-metrics.service';
import { Logger } from '@nestjs/common';
interface ErrorMetric {
  statusCode: number;
  path: string;
  method: string;
  errorCode: string;
}

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private readonly requestHistogram: Histogram<string>;
  private readonly errorCounter: Counter<string>;
  private readonly activeConnectionsGauge: Gauge<string>;
  private readonly cacheMetricsGauge: Gauge<string>;

  constructor(
    @InjectMetric('http_requests_total') private readonly httpRequestsTotal: Counter<string>,
    @Inject('METRICS_SERVICE')
    private readonly metricsService: MongoDBMetricsService,
  ) {
    // Initialize Prometheus metrics
    this.requestHistogram = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5],
    });

    this.errorCounter = new Counter({
      name: 'http_errors_total',
      help: 'Total number of HTTP errors',
      labelNames: ['status', 'path', 'method', 'error_code'],
    });

    this.activeConnectionsGauge = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
    });

    this.cacheMetricsGauge = new Gauge({
      name: 'cache_metrics',
      help: 'Cache hit/miss statistics',
      labelNames: ['type', 'cache'],
    });
  }

  async onModuleInit() {
    // Start background metrics collection
    this.startMetricsCollection();
  }

  async onModuleDestroy() {
    // Clean up resources
  }

  private startMetricsCollection() {
    // Collect system metrics periodically
    setInterval(() => this.collectSystemMetrics(), 60000); // Every minute
  }

  private async collectSystemMetrics() {
    try {
      // Collect memory usage
      const memoryUsage = process.memoryUsage();
      await this.metricsService.writeMetric(
        'memory_usage',
        {},
        {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
        }
      );

      // Collect event loop lag
      const start = process.hrtime();
      setImmediate(async () => {
        try {
          const delta = process.hrtime(start);
          const lag = delta[0] * 1000 + delta[1] / 1e6; // Convert to ms
          await this.metricsService.writeMetric(
            'event_loop_lag',
            {},
            { lag }
          );
        } catch (error) {
          this.logger.error('Error recording event loop lag', error.stack);
        }
      });
    } catch (error) {
      this.logger.error('Error collecting system metrics', error.stack);
    }
  }

  async recordRequest(
    method: string,
    route: string,
    status: number,
    duration: number,
  ) {
    // Record in Prometheus
    this.requestHistogram.labels(method, route, status.toString()).observe(duration);
    this.httpRequestsTotal.inc({ method, route, status: status.toString() });

    // Record in MongoDB
    await this.metricsService.writeMetric(
      'http_requests',
      { method, route, status: status.toString() },
      { duration, count: 1 }
    );
  }

  async recordError(error: ErrorMetric) {
    const { statusCode, path, method, errorCode } = error;

    // Record in Prometheus
    this.errorCounter
      .labels(statusCode.toString(), path, method, errorCode)
      .inc();

    // Record in MongoDB
    await this.metricsService.writeMetric(
      'http_errors',
      {
        status: statusCode.toString(),
        path,
        method,
        error_code: errorCode
      },
      { count: 1 }
    );
  }

  recordCacheHit(cacheName: string) {
    this.cacheMetricsGauge.labels('hit', cacheName).inc();
  }

  recordCacheMiss(cacheName: string) {
    this.cacheMetricsGauge.labels('miss', cacheName).inc();
  }

  incrementActiveConnections(type: string) {
    this.activeConnectionsGauge.labels(type).inc();
  }

  decrementActiveConnections(type: string) {
    this.activeConnectionsGauge.labels(type).dec();
  }

  async getMetrics(startTime: Date = new Date(Date.now() - 24 * 60 * 60 * 1000), endTime: Date = new Date()) {
    try {
      // Get request metrics
      const requestMetrics = await this.metricsService.queryMetrics({
        measurement: 'http_requests',
        startTime,
        endTime,
        groupBy: 'route',
        fields: ['count'],
        interval: '1h'
      });

      // Get error metrics
      const errorMetrics = await this.metricsService.queryMetrics({
        measurement: 'http_errors',
        startTime,
        endTime,
        groupBy: 'status',
        fields: ['count'],
        interval: '1h'
      });

      // Get system metrics
      const systemMetrics = await this.metricsService.queryMetrics({
        measurement: 'memory_usage',
        startTime,
        endTime,
        fields: ['rss', 'heapUsed', 'heapTotal'],
        interval: '1h'
      });

      // Get cache metrics
      const cacheMetrics = await this.metricsService.queryMetrics({
        measurement: 'cache_metrics',
        startTime,
        endTime,
        fields: ['hits', 'misses', 'hitRatio'],
        interval: '1h'
      });

      return {
        requestMetrics,
        errorMetrics,
        systemMetrics,
        cacheMetrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to get metrics: ${error.message}`, error.stack);
      throw error;
    }
  }
}
