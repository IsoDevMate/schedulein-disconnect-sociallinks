import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Metric, MetricDocument, MetricType } from '../schemas/metric.schema';

@Injectable()
export class MongoDBMetricsService {
  private readonly logger = new Logger(MongoDBMetricsService.name);

  constructor(
    @InjectModel(Metric.name) private metricModel: Model<MetricDocument>,
  ) {}

  async writeMetric(
    measurement: string,
    tags: Record<string, string> = {},
    fields: Record<string, any> = {},
    timestamp: Date = new Date(),
  ): Promise<void> {
    try {
      const metric = new this.metricModel({
        type: this.determineMetricType(measurement),
        name: measurement,
        tags,
        fields,
        timestamp,
      });
      await metric.save();
    } catch (error) {
      this.logger.error(`Failed to write metric: ${error.message}`, error.stack);
    }
  }

  async queryMetrics<T = any>(
    query: {
      measurement: string;
      startTime?: Date;
      endTime?: Date;
      groupBy?: string;
      fields: string[];
      interval?: string;
      limit?: number;
      sort?: Record<string, 1 | -1>;
    },
  ): Promise<T[]> {
    try {
      const { measurement, startTime, endTime, groupBy, fields, interval = '1h' } = query;

      const match: any = { name: measurement };

      // Add time range filter if provided
      if (startTime || endTime) {
        match.timestamp = {};
        if (startTime) match.timestamp.$gte = startTime;
        if (endTime) match.timestamp.$lte = endTime;
      }

      const pipeline: any[] = [{ $match: match }];

      // Add date grouping if interval is provided
      if (interval) {
        let dateFormat = '%Y-%m-%dT%H:00:00.000Z'; // Default to hourly
        if (interval === '1m') dateFormat = '%Y-%m-%dT%H:%M:00.000Z';
        else if (interval === '5m') dateFormat = '%Y-%m-%dT%H:%M:00.000Z';
        else if (interval === '15m') dateFormat = '%Y-%m-%dT%H:%M:00.000Z';
        else if (interval === '1d') dateFormat = '%Y-%m-%dT00:00:00.000Z';

        const group: any = {
          _id: {
            time: { $dateToString: { format: dateFormat, date: '$timestamp' } },
          },
          timestamp: { $first: '$timestamp' },
          ...fields.reduce((acc, field) => ({
            ...acc,
            [field]: { $avg: `$fields.${field}` }
          }), {})
        };

        // Add groupBy to _id if specified
        if (groupBy) {
          group._id[groupBy] = `$tags.${groupBy}`;
        }

        pipeline.push({ $group: group });
      }

      // Sort by time
      pipeline.push({ $sort: { 'timestamp': 1 } });

      // Project to final format
      const project: any = {
        _id: 0,
        time: '$_id.time',
      };
      if (groupBy) {
        project[groupBy] = `$_id.${groupBy}`;
      }
      fields.forEach((field) => {
        project[field] = 1;
      });

      pipeline.push({ $project: project });

      const results = await this.metricModel.aggregate(pipeline).exec();
      return results;
    } catch (error) {
      this.logger.error(`Failed to query metrics: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getMetricStats(
    measurement: string,
    field: string,
    options: {
      startTime?: Date;
      endTime?: Date;
      groupBy?: string;
      aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
    },
  ): Promise<any> {
    try {
      const { startTime, endTime, groupBy, aggregation } = options;

      const match: any = { name: measurement };

      // Add time range filter if provided
      if (startTime || endTime) {
        match.timestamp = {};
        if (startTime) match.timestamp.$gte = startTime;
        if (endTime) match.timestamp.$lte = endTime;
      }

      const pipeline: any[] = [{ $match: match }];

      // Add group stage if groupBy is provided
      if (groupBy) {
        const group: any = {
          _id: `$tags.${groupBy}`,
          value: { [`$${aggregation}`]: `$fields.${field}` },
        };

        // For count, we need to use $sum: 1
        if (aggregation === 'count') {
          group.value = { $sum: 1 };
        }

        pipeline.push({ $group: group });

        const result = await this.metricModel.aggregate(pipeline).exec();
        return result.map(item => ({
          [groupBy]: item._id,
          value: item.value
        }));
      } else {
        // For non-grouped aggregation
        const project: any = {};
        project[aggregation] = `$fields.${field}`;
        pipeline.push({ $group: { _id: null, value: project } });

        const result = await this.metricModel.aggregate(pipeline).exec();
        return result[0]?.value || 0;
      }
    } catch (error) {
      this.logger.error(`Failed to get metric stats: ${error.message}`, error.stack);
      return options.groupBy ? [] : 0;
    }
  }

  private determineMetricType(measurement: string): MetricType {
    if (measurement.includes('error')) return MetricType.HTTP_ERROR;
    if (measurement.includes('request')) return MetricType.HTTP_REQUEST;
    if (measurement.includes('cache')) return MetricType.CACHE_METRIC;
    if (measurement.includes('system') || measurement.includes('memory'))
      return MetricType.SYSTEM_METRIC;
    return MetricType.CUSTOM_METRIC;
  }
}
