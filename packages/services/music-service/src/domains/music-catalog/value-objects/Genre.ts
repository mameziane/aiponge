/**
 * Genre Value Object
 * Encapsulates music genre business rules and validation
 */

import { MusicError } from '../../../application/errors';

export enum GenreCategory {
  ROCK = 'rock',
  POP = 'pop',
  ELECTRONIC = 'electronic',
  JAZZ = 'jazz',
  CLASSICAL = 'classical',
  BLUES = 'blues',
  FOLK = 'folk',
  COUNTRY = 'country',
  HIP_HOP = 'hip_hop',
  R_AND_B = 'r_and_b',
  REGGAE = 'reggae',
  PUNK = 'punk',
  METAL = 'metal',
  AMBIENT = 'ambient',
  WORLD = 'world',
  OTHER = 'other',
}

export interface GenreCharacteristics {
  typicalTempo: { min: number; max: number }; // BPM range
  energyLevel: 'low' | 'medium' | 'high';
  instrumentalFocus: string[];
  culturalOrigin?: string;
}

export class Genre {
  private constructor(
    private readonly _value: string,
    private readonly _category: GenreCategory,
    private readonly _characteristics: GenreCharacteristics
  ) {}

  static create(value: string): Genre {
    const normalized = value.toLowerCase().trim();

    if (!normalized) {
      throw MusicError.validationError('genre', 'Genre cannot be empty');
    }

    if (normalized.length > 50) {
      throw MusicError.validationError('genre', 'Genre name too long (max 50 characters)');
    }

    const category = this.determineCategory(normalized);
    const characteristics = this.determineCharacteristics(normalized);

    return new Genre(normalized, category, characteristics);
  }

  get value(): string {
    return this._value;
  }

  get category(): GenreCategory {
    return this._category;
  }

  get characteristics(): GenreCharacteristics {
    return this._characteristics;
  }

  /**
   * Business logic: determine if this genre is compatible with another
   */
  isCompatibleWith(other: Genre): boolean {
    // Same category genres are always compatible
    if (this._category === other._category) {
      return true;
    }

    // Cross-category compatibility rules
    const compatibleCategories: Record<GenreCategory, GenreCategory[]> = {
      [GenreCategory.ELECTRONIC]: [GenreCategory.AMBIENT, GenreCategory.POP],
      [GenreCategory.ROCK]: [GenreCategory.POP, GenreCategory.FOLK],
      [GenreCategory.JAZZ]: [GenreCategory.BLUES, GenreCategory.CLASSICAL],
      [GenreCategory.BLUES]: [GenreCategory.ROCK, GenreCategory.JAZZ, GenreCategory.COUNTRY],
      [GenreCategory.FOLK]: [GenreCategory.COUNTRY, GenreCategory.ROCK],
      [GenreCategory.POP]: [GenreCategory.ROCK, GenreCategory.ELECTRONIC, GenreCategory.R_AND_B],
      [GenreCategory.HIP_HOP]: [GenreCategory.R_AND_B, GenreCategory.ELECTRONIC],
      [GenreCategory.METAL]: [GenreCategory.ROCK, GenreCategory.PUNK],
      [GenreCategory.PUNK]: [GenreCategory.ROCK, GenreCategory.METAL],
      [GenreCategory.AMBIENT]: [GenreCategory.ELECTRONIC, GenreCategory.CLASSICAL],
      [GenreCategory.CLASSICAL]: [GenreCategory.JAZZ, GenreCategory.AMBIENT],
      [GenreCategory.COUNTRY]: [GenreCategory.FOLK, GenreCategory.BLUES],
      [GenreCategory.R_AND_B]: [GenreCategory.POP, GenreCategory.HIP_HOP],
      [GenreCategory.REGGAE]: [GenreCategory.WORLD],
      [GenreCategory.WORLD]: [GenreCategory.REGGAE, GenreCategory.FOLK],
      [GenreCategory.OTHER]: [],
    };

    return compatibleCategories[this._category]?.includes(other._category) || false;
  }

  /**
   * Business logic: get recommended tempo range for this genre
   */
  getRecommendedTempoRange(): { min: number; max: number } {
    return this._characteristics.typicalTempo;
  }

  /**
   * Business logic: check if a tempo is appropriate for this genre
   */
  isTempoAppropriate(bpm: number): boolean {
    const { min, max } = this._characteristics.typicalTempo;
    return bpm >= min && bpm <= max;
  }

  private static determineCategory(normalized: string): GenreCategory {
    const categoryMap: Record<string, GenreCategory> = {
      // Rock variations
      rock: GenreCategory.ROCK,
      alternative: GenreCategory.ROCK,
      indie: GenreCategory.ROCK,
      grunge: GenreCategory.ROCK,
      // Pop variations
      pop: GenreCategory.POP,
      synthpop: GenreCategory.POP,
      dance: GenreCategory.POP,
      // Electronic variations
      electronic: GenreCategory.ELECTRONIC,
      edm: GenreCategory.ELECTRONIC,
      techno: GenreCategory.ELECTRONIC,
      house: GenreCategory.ELECTRONIC,
      trance: GenreCategory.ELECTRONIC,
      dubstep: GenreCategory.ELECTRONIC,
      // Jazz variations
      jazz: GenreCategory.JAZZ,
      bebop: GenreCategory.JAZZ,
      'smooth jazz': GenreCategory.JAZZ,
      // Classical variations
      classical: GenreCategory.CLASSICAL,
      baroque: GenreCategory.CLASSICAL,
      romantic: GenreCategory.CLASSICAL,
      'contemporary classical': GenreCategory.CLASSICAL,
      // Blues variations
      blues: GenreCategory.BLUES,
      'chicago blues': GenreCategory.BLUES,
      'delta blues': GenreCategory.BLUES,
      // Folk variations
      folk: GenreCategory.FOLK,
      acoustic: GenreCategory.FOLK,
      americana: GenreCategory.FOLK,
      // Country variations
      country: GenreCategory.COUNTRY,
      bluegrass: GenreCategory.COUNTRY,
      'honky-tonk': GenreCategory.COUNTRY,
      // Hip Hop variations
      'hip hop': GenreCategory.HIP_HOP,
      rap: GenreCategory.HIP_HOP,
      trap: GenreCategory.HIP_HOP,
      // R&B variations
      'r&b': GenreCategory.R_AND_B,
      soul: GenreCategory.R_AND_B,
      funk: GenreCategory.R_AND_B,
      // Metal variations
      metal: GenreCategory.METAL,
      'heavy metal': GenreCategory.METAL,
      'death metal': GenreCategory.METAL,
      'black metal': GenreCategory.METAL,
      // Punk variations
      punk: GenreCategory.PUNK,
      'punk rock': GenreCategory.PUNK,
      hardcore: GenreCategory.PUNK,
      // Ambient variations
      ambient: GenreCategory.AMBIENT,
      chillout: GenreCategory.AMBIENT,
      'new age': GenreCategory.AMBIENT,
      // Reggae variations
      reggae: GenreCategory.REGGAE,
      ska: GenreCategory.REGGAE,
      dub: GenreCategory.REGGAE,
      // World variations
      world: GenreCategory.WORLD,
      african: GenreCategory.WORLD,
      latin: GenreCategory.WORLD,
      celtic: GenreCategory.WORLD,
    };

    return categoryMap[normalized] || GenreCategory.OTHER;
  }

  private static determineCharacteristics(normalized: string): GenreCharacteristics {
    const characteristicsMap: Record<GenreCategory, GenreCharacteristics> = {
      [GenreCategory.ROCK]: {
        typicalTempo: { min: 120, max: 140 },
        energyLevel: 'high',
        instrumentalFocus: ['guitar', 'bass', 'drums'],
        culturalOrigin: 'United States/United Kingdom',
      },
      [GenreCategory.POP]: {
        typicalTempo: { min: 110, max: 130 },
        energyLevel: 'medium',
        instrumentalFocus: ['vocals', 'synthesizer', 'guitar'],
        culturalOrigin: 'Global',
      },
      [GenreCategory.ELECTRONIC]: {
        typicalTempo: { min: 120, max: 150 },
        energyLevel: 'high',
        instrumentalFocus: ['synthesizer', 'drum machine', 'computer'],
        culturalOrigin: 'Germany/United States',
      },
      [GenreCategory.JAZZ]: {
        typicalTempo: { min: 80, max: 200 },
        energyLevel: 'medium',
        instrumentalFocus: ['saxophone', 'piano', 'trumpet', 'bass'],
        culturalOrigin: 'United States',
      },
      [GenreCategory.CLASSICAL]: {
        typicalTempo: { min: 60, max: 180 },
        energyLevel: 'medium',
        instrumentalFocus: ['orchestra', 'piano', 'violin', 'cello'],
        culturalOrigin: 'Europe',
      },
      [GenreCategory.BLUES]: {
        typicalTempo: { min: 60, max: 120 },
        energyLevel: 'medium',
        instrumentalFocus: ['guitar', 'harmonica', 'piano'],
        culturalOrigin: 'United States',
      },
      [GenreCategory.FOLK]: {
        typicalTempo: { min: 70, max: 110 },
        energyLevel: 'low',
        instrumentalFocus: ['acoustic guitar', 'vocals', 'fiddle'],
        culturalOrigin: 'Traditional/Various',
      },
      [GenreCategory.COUNTRY]: {
        typicalTempo: { min: 90, max: 140 },
        energyLevel: 'medium',
        instrumentalFocus: ['guitar', 'banjo', 'fiddle'],
        culturalOrigin: 'United States',
      },
      [GenreCategory.HIP_HOP]: {
        typicalTempo: { min: 80, max: 140 },
        energyLevel: 'high',
        instrumentalFocus: ['vocals', 'beats', 'sampling'],
        culturalOrigin: 'United States',
      },
      [GenreCategory.R_AND_B]: {
        typicalTempo: { min: 70, max: 110 },
        energyLevel: 'medium',
        instrumentalFocus: ['vocals', 'bass', 'keyboards'],
        culturalOrigin: 'United States',
      },
      [GenreCategory.REGGAE]: {
        typicalTempo: { min: 60, max: 100 },
        energyLevel: 'medium',
        instrumentalFocus: ['guitar', 'bass', 'drums'],
        culturalOrigin: 'Jamaica',
      },
      [GenreCategory.PUNK]: {
        typicalTempo: { min: 140, max: 200 },
        energyLevel: 'high',
        instrumentalFocus: ['guitar', 'bass', 'drums'],
        culturalOrigin: 'United States/United Kingdom',
      },
      [GenreCategory.METAL]: {
        typicalTempo: { min: 120, max: 200 },
        energyLevel: 'high',
        instrumentalFocus: ['guitar', 'bass', 'drums'],
        culturalOrigin: 'United Kingdom/United States',
      },
      [GenreCategory.AMBIENT]: {
        typicalTempo: { min: 60, max: 120 },
        energyLevel: 'low',
        instrumentalFocus: ['synthesizer', 'soundscapes', 'effects'],
        culturalOrigin: 'United Kingdom',
      },
      [GenreCategory.WORLD]: {
        typicalTempo: { min: 60, max: 160 },
        energyLevel: 'medium',
        instrumentalFocus: ['traditional instruments', 'vocals'],
        culturalOrigin: 'Various',
      },
      [GenreCategory.OTHER]: {
        typicalTempo: { min: 60, max: 180 },
        energyLevel: 'medium',
        instrumentalFocus: ['various'],
        culturalOrigin: 'Various',
      },
    };

    const category = this.determineCategory(normalized);
    return characteristicsMap[category];
  }

  /**
   * Value Record<string, unknown> equality
   */
  equals(other: Genre): boolean {
    return this._value === other._value;
  }

  toJSON(): string {
    return this._value;
  }
}
