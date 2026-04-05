import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsService } from './metrics.service';
import { ErrorBoundaryFilter } from '../error-handling/error-boundary.filter';
import { PrometheusModule, makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { MongoDBMetricsService } from './services/mongodb-metrics.service';
import { Metric, MetricSchema } from './schemas/metric.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Metric.name, schema: MetricSchema }]),
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    MetricsService,
    MongoDBMetricsService,
    {
      provide: 'METRICS_SERVICE',
      useClass: MongoDBMetricsService,
    },
    // Register Prometheus metrics
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
    }),
    {
      provide: APP_FILTER,
      useClass: ErrorBoundaryFilter,
    },
  ],
  exports: [MetricsService, MongoDBMetricsService],
})
export class MonitoringModule {}
