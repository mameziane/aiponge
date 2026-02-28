export interface MusicApiConfig {
  endpoint: string;
  timeout: number;
  requestTemplate: {
    mv: string;
    duration: number;
    make_instrumental: boolean;
    custom_mode: boolean;
  };
}

export interface LLMConfig {
  endpoint: string;
  timeout: number;
  requestTemplate: {
    model: string;
    temperature?: number;
  };
}

export interface ImageConfig {
  endpoint: string;
  timeout: number;
  requestTemplate: {
    model: string;
    size?: string;
    quality?: string;
    n?: number;
  };
}

export const MODEL_VERSIONS = [
  { label: 'Sonic v5 (Latest)', value: 'sonic-v5' },
  { label: 'Sonic v4', value: 'sonic-v4' },
  { label: 'Sonic v3', value: 'sonic-v3' },
];
