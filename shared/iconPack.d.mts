export type IconDefinition = {
  viewBox?: string;
  fill?: string;
  stroke?: string;
  shapes: {tag:string;attrs:Partial<Record<string,string>>}[];
};
export type IconOverrides = Record<string,IconDefinition>;
export const svgNamespace: 'http://www.w3.org/2000/svg';
export function validIconName(name:unknown): boolean;
export function validateIconDefinition(raw:unknown): IconDefinition;
export function validateIconPack(raw:unknown): {version:1;icons:IconOverrides};
export function normalizeIconOverrides(raw:unknown,names?:readonly string[]): IconOverrides;
export function iconAttributes(icon:IconDefinition): Record<string,string>;
export const dockIconNames: Readonly<{left:'ArrowLeft';right:'ArrowRight';top:'ArrowUp';bottom:'ArrowDown';center:'Layers'}>;
export type DockIconOverrides = Partial<Record<(typeof dockIconNames)[keyof typeof dockIconNames],IconDefinition>>;
export function dockIcons(overrides?:unknown): Record<keyof typeof dockIconNames,IconDefinition>;
export function dockIconPayload(overrides?:unknown): Record<keyof typeof dockIconNames,{
  name:string;attrs:Record<string,string>;shapes:IconDefinition['shapes'];
}>;
