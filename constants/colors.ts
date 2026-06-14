export type PeelzyColorValue =
  | '#F7D3E1'
  | '#F2E8FF'
  | '#E4C0FF'
  | '#FFE566'
  | '#9BF0B0'
  | '#8EC9DF'
  | '#F7F2E7';

export type PeelzyColorOption = {
  label: string;
  value: PeelzyColorValue;
};

export const PEELZY_COLOR_OPTIONS: PeelzyColorOption[] = [
  { label: 'Pink', value: '#F7D3E1' },
  { label: 'Lavender', value: '#F2E8FF' },
  { label: 'Purple', value: '#E4C0FF' },
  { label: 'Yellow', value: '#FFE566' },
  { label: 'Mint', value: '#9BF0B0' },
  { label: 'Sky', value: '#8EC9DF' },
  { label: 'Cream', value: '#F7F2E7' },
];

export const PEELZY_COLORS = PEELZY_COLOR_OPTIONS.map((color) => color.value);
export const DEFAULT_PEELZY_COLOR: PeelzyColorValue = '#E4C0FF';
