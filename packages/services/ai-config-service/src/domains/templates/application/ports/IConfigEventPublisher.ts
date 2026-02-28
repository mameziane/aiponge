export interface IConfigEventPublisher {
  templateCreated(
    templateId: string,
    templateKey: string,
    category: string,
    correlationId?: string,
    version?: string
  ): void;
  templateUpdated(
    templateId: string,
    templateKey: string,
    category: string,
    correlationId?: string,
    changes?: string[],
    version?: string
  ): void;
  templateDeleted(templateId: string, templateKey: string, correlationId?: string): void;
}
