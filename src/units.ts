export type Unit = 'in' | 'mm'

export const MM_PER_IN = 25.4

export function toMm(value: number, unit: Unit): number {
  return unit === 'in' ? value * MM_PER_IN : value
}

export function fromMm(mm: number, unit: Unit): number {
  return unit === 'in' ? mm / MM_PER_IN : mm
}

export function formatLength(mm: number, unit: Unit): string {
  return unit === 'in' ? `${fromMm(mm, unit).toFixed(2)} in` : `${mm.toFixed(1)} mm`
}
