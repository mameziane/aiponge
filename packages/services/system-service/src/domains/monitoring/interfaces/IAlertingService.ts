import { Alert } from '../entities/Alert';

export interface IAlertingService {
  sendAlert(alert: Alert): Promise<void>;
}
