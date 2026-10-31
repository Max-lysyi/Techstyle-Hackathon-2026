import { z } from 'zod';

export const visionElementSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  type: z.enum(['logo', 'text', 'number', 'graphic', 'background', 'unknown']),
  bbox: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite(), height: z.number().finite() }).strict(),
  confidence: z.number().finite().min(0).max(1),
  description: z.string().max(1000),
}).strict();
export const visionResultSchema = z.object({
  elements: z.array(visionElementSchema).max(40),
  background: z.object({
    type: z.enum(['solid', 'gradient', 'geometric', 'textured', 'unknown']),
    description: z.string().max(1000),
    selectionRecommendation: z.string().max(1000),
    restorationRecommendation: z.string().max(1000),
  }).strict(),
}).strict();
export type VisionResult = z.infer<typeof visionResultSchema>;
export type VisionElement = z.infer<typeof visionElementSchema>;

// Responses Structured Outputs supports a subset of JSON Schema; validate bounds separately.
export const visionJsonSchema = {
  type: 'object', additionalProperties: false, required: ['elements', 'background'],
  properties: {
    elements: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['id', 'name', 'type', 'bbox', 'confidence', 'description'],
      properties: {
        id: { type: 'string' }, name: { type: 'string' },
        type: { type: 'string', enum: ['logo', 'text', 'number', 'graphic', 'background', 'unknown'] },
        bbox: { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: {
          x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
        } },
        confidence: { type: 'number' }, description: { type: 'string' },
      },
    } },
    background: { type: 'object', additionalProperties: false, required: ['type', 'description', 'selectionRecommendation', 'restorationRecommendation'], properties: {
      type: { type: 'string', enum: ['solid', 'gradient', 'geometric', 'textured', 'unknown'] },
      description: { type: 'string' }, selectionRecommendation: { type: 'string' }, restorationRecommendation: { type: 'string' },
    } },
  },
} as const;

export function validateVisionResult(value: unknown): VisionResult {
  const parsed = visionResultSchema.parse(value);
  const ids = new Set<string>();
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const elements = parsed.elements.map((element) => {
    if (ids.has(element.id)) throw new Error('Повторний ідентифікатор елемента у відповіді моделі.');
    ids.add(element.id);
    const { x, y, width, height } = element.bbox;
    if (width <= 0 || height <= 0) throw new Error('Некоректні розміри області у відповіді моделі.');
    const left = clamp(x), top = clamp(y), right = clamp(x + width), bottom = clamp(y + height);
    if (right <= left || bottom <= top) throw new Error('Область моделі знаходиться за межами зображення.');
    return { ...element, bbox: { x: left, y: top, width: right - left, height: bottom - top } };
  });
  return { ...parsed, elements };
}

/** Presentation captions are not graphic assets, even if Vision labels them as text. */
export function isGarmentArtwork(element:Pick<VisionElement,'type'|'name'|'description'>):boolean {
  if(element.type==='logo')return true;
  if(!['text','number'].includes(element.type))return false;
  return !/caption|feature title|handwritten|text block|підпис|заголов|характеристик|презентац|інтерфейс/i.test(element.name+' '+element.description);
}
