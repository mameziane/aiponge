import { getLogger } from '../../../config/service-urls';

const logger = getLogger('get-track-use-case');

export interface GetTrackRequest {
  trackId: string;
}

export interface TrackDetails {
  id: string;
  title: string;
  userId: string;
  albumId: string;
  duration: number;
  fileUrl: string | null;
  artworkUrl: string | null;
}

export interface GetTrackResponse {
  track: TrackDetails | null;
  success: boolean;
  message?: string;
}

export interface ITrackRepository {
  findById(trackId: string): Promise<TrackDetails | null>;
}

export class GetTrackUseCase {
  constructor(private trackRepository: ITrackRepository) {}

  async execute(request: GetTrackRequest): Promise<GetTrackResponse> {
    try {
      const track = await this.trackRepository.findById(request.trackId);

      if (!track) {
        return {
          track: null,
          success: false,
          message: 'Track not found',
        };
      }

      return {
        track,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to get track', {
        trackId: request.trackId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        track: null,
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get track',
      };
    }
  }
}
