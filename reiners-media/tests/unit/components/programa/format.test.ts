/**
 * TCK-016 — Formatação de data e duração.
 *
 * O ponto sensível é o FUSO: a data é formatada em UTC de propósito, para que
 * servidor, cliente e CI produzam a mesma string. O primeiro teste falha se
 * alguém remover `timeZone: 'UTC'`, porque `2025-03-10T02:00:00Z` cai no dia 9
 * em qualquer fuso negativo (inclusive o do Brasil).
 */
import { describe, expect, it } from 'vitest';

import {
  formatEpisodeCount,
  formatEpisodeNumber,
  formatPublishedAt,
  toDateTimeAttribute,
  toIsoDuration,
  toSpokenDuration,
} from '@/components/programa/format';

describe('formatPublishedAt', () => {
  it('formata em pt-BR e em UTC', () => {
    expect(formatPublishedAt('2025-03-10T02:00:00.000Z')).toBe('10 de março de 2025');
  });

  it('não desloca o dia por causa do fuso do ambiente', () => {
    // 02:00 UTC é 23:00 do dia anterior em UTC-3. Se a formatação usasse o fuso
    // local, esta asserção viraria "09 de março".
    const value = formatPublishedAt('2025-03-10T02:00:00.000Z');
    expect(value).toContain('10 de março');
  });

  it('devolve null em vez de "Invalid Date"', () => {
    expect(formatPublishedAt('nem data')).toBeNull();
    expect(formatPublishedAt('')).toBeNull();
    expect(formatPublishedAt(null)).toBeNull();
    expect(formatPublishedAt(undefined)).toBeNull();
  });
});

describe('toDateTimeAttribute', () => {
  it('devolve a data ISO curta para o atributo `dateTime`', () => {
    expect(toDateTimeAttribute('2025-03-10T02:00:00.000Z')).toBe('2025-03-10');
  });

  it('devolve null para entrada inválida', () => {
    expect(toDateTimeAttribute('x')).toBeNull();
    expect(toDateTimeAttribute(null)).toBeNull();
  });
});

describe('toIsoDuration', () => {
  it('converte MM:SS', () => {
    expect(toIsoDuration('45:30')).toBe('PT45M30S');
  });

  it('converte HH:MM:SS', () => {
    expect(toIsoDuration('01:12:05')).toBe('PT1H12M5S');
  });

  it('omite segmentos zerados', () => {
    expect(toIsoDuration('30:00')).toBe('PT30M');
    expect(toIsoDuration('00:07')).toBe('PT7S');
    expect(toIsoDuration('00:00')).toBe('PT0S');
  });

  it('rejeita o que `durationSchema` também rejeitaria', () => {
    expect(toIsoDuration('45')).toBeNull();
    expect(toIsoDuration('45:99')).toBeNull();
    expect(toIsoDuration('1:2:3:4')).toBeNull();
    expect(toIsoDuration('quarenta')).toBeNull();
    expect(toIsoDuration(null)).toBeNull();
  });
});

describe('toSpokenDuration', () => {
  it('vira texto que o leitor de tela pronuncia como duração', () => {
    expect(toSpokenDuration('45:30')).toBe('45 min 30 s');
    expect(toSpokenDuration('01:12:05')).toBe('1 h 12 min 5 s');
    expect(toSpokenDuration('00:00')).toBe('0 s');
  });

  it('devolve null quando a duração é inválida', () => {
    expect(toSpokenDuration('x')).toBeNull();
  });
});

describe('rótulos', () => {
  it('numera episódios', () => {
    expect(formatEpisodeNumber(1)).toBe('Episódio 1');
    expect(formatEpisodeNumber(25)).toBe('Episódio 25');
  });

  it('pluraliza o contador, inclusive no zero', () => {
    expect(formatEpisodeCount(0)).toBe('0 episódios');
    expect(formatEpisodeCount(1)).toBe('1 episódio');
    expect(formatEpisodeCount(2)).toBe('2 episódios');
  });
});
