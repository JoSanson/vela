import { describe, expect, it } from 'vitest';
import { convert, evaluate, instantAnswer, roundAnswer } from './answers';

describe('evaluate', () => {
  it.each([
    ['2+2*3', 8],
    ['(2+2)*3', 12],
    ['2^10', 1024],
    ['2**3', 8],
    ['-3 + 5', 2],
    ['10 / 4', 2.5],
    ['1,5 * 2', 3],
    ['7 × 6', 42],
    ['9 ÷ 3', 3],
    ['10 % 3', 1],
    ['50 * 20%', 10],
    ['sqrt(16) + 1', 5],
    ['2 * pi', 2 * Math.PI],
    ['=42', 42],
    ['1e3 + 1', 1001],
  ])('%s = %d', (input, expected) => {
    expect(evaluate(input)).toBeCloseTo(expected);
  });

  it.each([
    '42',
    'hello',
    'covid-19',
    '2024-10-12',
    '+33 6 12 34 56 78',
    '1.2.3',
    '2+',
    '(1+2',
    '',
    '1/0',
    'pi',
  ])('%s is not an answer', (input) => {
    expect(evaluate(input)).toBeNull();
  });
});

describe('convert', () => {
  it('converts between explicit units', () => {
    expect(convert('10 km to mi')?.result).toBeCloseTo(6.2137, 3);
    expect(convert('5 kg en livres')?.result).toBeCloseTo(11.023, 2);
    expect(convert('100 f in c')?.result).toBeCloseTo(37.778, 2);
    expect(convert('0 °C to K')?.result).toBeCloseTo(273.15);
    expect(convert('1 GiB to MB')?.result).toBeCloseTo(1073.741824);
    expect(convert('90 min in h')?.result).toBe(1.5);
    expect(convert('3 cups to ml')?.result).toBeCloseTo(709.76, 1);
    expect(convert('100 km/h to mph')?.result).toBeCloseTo(62.137, 2);
  });

  it('picks the metric/imperial counterpart when no target is given', () => {
    expect(convert('10 miles')).toMatchObject({ from: 'mi', to: 'km' });
    expect(convert('30c')).toMatchObject({ from: '°C', to: '°F', result: 86 });
    expect(convert('180 cm')).toMatchObject({ to: 'in' });
  });

  it('refuses mismatched or unknown units and bare one-letter units', () => {
    expect(convert('10 km to kg')).toBeNull();
    expect(convert('10 parsecs')).toBeNull();
    expect(convert('10 m')).toBeNull();
    expect(convert('5 ans plus tard')).toBeNull();
    expect(convert('3 km to km')).toBeNull();
  });
});

describe('instantAnswer', () => {
  it('tries conversion first, then arithmetic', () => {
    expect(instantAnswer('12 lb')?.kind).toBe('convert');
    expect(instantAnswer('12 * 3')).toMatchObject({ kind: 'calc', value: 36 });
    expect(instantAnswer('weather paris')).toBeNull();
  });
});

describe('roundAnswer', () => {
  it('removes float noise', () => {
    expect(roundAnswer(0.1 + 0.2)).toBe(0.3);
    expect(roundAnswer(0)).toBe(0);
    expect(roundAnswer(Infinity)).toBe(Infinity);
  });
});
