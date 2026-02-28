export class NotificationTemplateEntity {
  constructor(
    public id: string,
    public name: string,
    public type: string,
    public channel: string,
    public subjectTemplate: string,
    public bodyTemplate: string,
    public variables: string[],
    public isActive: boolean,
    public createdAt: Date,
    public updatedAt: Date
  ) {}

  // Business logic methods
  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  updateTemplate(subjectTemplate?: string, bodyTemplate?: string): void {
    if (subjectTemplate !== undefined) {
      this.subjectTemplate = subjectTemplate;
    }
    if (bodyTemplate !== undefined) {
      this.bodyTemplate = bodyTemplate;
    }
    this.updatedAt = new Date();
  }

  addVariable(variable: string): void {
    if (!this.variables.includes(variable)) {
      this.variables.push(variable);
      this.updatedAt = new Date();
    }
  }

  removeVariable(variable: string): void {
    const index = this.variables.indexOf(variable);
    if (index > -1) {
      this.variables.splice(index, 1);
      this.updatedAt = new Date();
    }
  }

  interpolate(variables: Record<string, unknown>): { subject: string; body: string } {
    let subject = this.subjectTemplate;
    let body = this.bodyTemplate;

    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), String(value));
      body = body.replace(new RegExp(placeholder, 'g'), String(value));
    });

    return { subject, body };
  }

  validateVariables(variables: Record<string, unknown>): string[] {
    const missingVariables: string[] = [];

    this.variables.forEach(variable => {
      if (!(variable in variables)) {
        missingVariables.push(variable);
      }
    });

    return missingVariables;
  }
}
