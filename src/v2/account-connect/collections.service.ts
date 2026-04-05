import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Collection, CollectionDocument } from './schemas/collection.schema';
import { Bookmark, BookmarkDocument } from './schemas/bookmark.schema';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectModel(Collection.name) private collectionModel: Model<CollectionDocument>,
    @InjectModel(Bookmark.name) private bookmarkModel: Model<BookmarkDocument>,
  ) {}

  async createCollection(userId: string, name: string, description?: string): Promise<CollectionDocument> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('Collection name is required');
    }

    const collection = new this.collectionModel({
      userId: new Types.ObjectId(userId),
      name: name.trim(),
      description: description?.trim(),
      itemCount: 0,
      lastUpdated: new Date(),
    });

    return collection.save();
  }

  async getUserCollections(userId: string): Promise<CollectionDocument[]> {
    return this.collectionModel
      .find({ userId: new Types.ObjectId(userId), isActive: true })
      .sort({ lastUpdated: -1 })
      .exec();
  }

  async getCollectionById(userId: string, collectionId: string): Promise<CollectionDocument> {
    const collection = await this.collectionModel
      .findOne({
        _id: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
        isActive: true
      })
      .exec();

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return collection;
  }

  async updateCollection(
    userId: string,
    collectionId: string,
    updates: { name?: string; description?: string }
  ): Promise<CollectionDocument> {
    const collection = await this.getCollectionById(userId, collectionId);

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new BadRequestException('Collection name cannot be empty');
      }
      collection.name = updates.name.trim();
    }

    if (updates.description !== undefined) {
      collection.description = updates.description?.trim();
    }

    collection.lastUpdated = new Date();
    return collection.save();
  }

  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    const collection = await this.getCollectionById(userId, collectionId);

    // Soft delete the collection
    collection.isActive = false;
    await collection.save();

    // Move all bookmarks in this collection to a default collection or delete them
    // For now, we'll soft delete them too
    await this.bookmarkModel.updateMany(
      { collectionId: new Types.ObjectId(collectionId) },
      { $unset: { collectionId: 1 } }
    ).exec();
  }

  async getCollectionContents(userId: string, collectionId: string): Promise<{
    collection: CollectionDocument;
    videos: BookmarkDocument[];
    ideas: BookmarkDocument[];
    scripts: BookmarkDocument[];
  }> {
    const collection = await this.getCollectionById(userId, collectionId);

    const [videos, ideas, scripts] = await Promise.all([
      this.bookmarkModel
        .find({
          userId: new Types.ObjectId(userId),
          collectionId: new Types.ObjectId(collectionId),
          type: 'video'
        })
        .sort({ createdAt: -1 })
        .exec(),
      this.bookmarkModel
        .find({
          userId: new Types.ObjectId(userId),
          collectionId: new Types.ObjectId(collectionId),
          type: 'idea'
        })
        .sort({ createdAt: -1 })
        .exec(),
      this.bookmarkModel
        .find({
          userId: new Types.ObjectId(userId),
          collectionId: new Types.ObjectId(collectionId),
          type: 'script'
        })
        .sort({ createdAt: -1 })
        .exec(),
    ]);

    return {
      collection,
      videos,
      ideas,
      scripts,
    };
  }

  async updateCollectionItemCount(collectionId: string): Promise<void> {
    const count = await this.bookmarkModel.countDocuments({
      collectionId: new Types.ObjectId(collectionId)
    });

    await this.collectionModel.updateOne(
      { _id: new Types.ObjectId(collectionId) },
      {
        itemCount: count,
        lastUpdated: new Date()
      }
    ).exec();
  }
}
