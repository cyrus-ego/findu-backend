import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlocklistController } from './blocklist.controller';
import { BlocklistService } from './blocklist.service';
import { BlocklistRepository } from './blocklist.repository';
import { Blocklist, BlocklistSchema } from './entities/blocklist.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Blocklist.name, schema: BlocklistSchema }]),
  ],
  controllers: [BlocklistController],
  providers: [BlocklistService, BlocklistRepository],
  exports: [BlocklistService],
})
export class BlocklistModule {}
