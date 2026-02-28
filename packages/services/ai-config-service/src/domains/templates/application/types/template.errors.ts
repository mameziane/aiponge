import { ServiceError } from '@aiponge/platform-core';

export class TemplateNotFoundError extends ServiceError {
  constructor(templateId: string) {
    super('TemplateNotFoundError', `Template not found: ${templateId}`, {
      statusCode: 404,
      details: { templateId },
    });
  }
}

export class TemplateValidationError extends ServiceError {
  public validationErrors: string[];
  constructor(message: string, validationErrors: string[]) {
    super('TemplateValidationError', message, {
      statusCode: 400,
      details: { validationErrors },
    });
    this.validationErrors = validationErrors;
  }
}

export class TemplateExecutionError extends ServiceError {
  public templateId: string;
  constructor(message: string, templateId: string) {
    super('TemplateExecutionError', message, {
      statusCode: 500,
      details: { templateId },
    });
    this.templateId = templateId;
  }
}
