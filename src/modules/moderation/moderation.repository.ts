import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from './entities/report.schema';
import { ReportDto } from './dto/report.dto';

@Injectable()
export class ModerationRepository {
  constructor(@InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>) {}

  async createReport(reporterId: string, dto: ReportDto): Promise<ReportDocument> {
    return this.reportModel.create({
      reporterId,
      reportedUserId: dto.reportedUserId,
      roomId: dto.roomId,
      reason: dto.reason,
      description: dto.description || '',
    });
  }
}
