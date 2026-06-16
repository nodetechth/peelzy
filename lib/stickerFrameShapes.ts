type Point = { x: number; y: number };

type CubicCurve = {
  c1: Point;
  c2: Point;
  end: Point;
};

const HEART_START: Point = { x: 0.5, y: 0.88 };

const HEART_CURVES: CubicCurve[] = [
  {
    c1: { x: 0.42, y: 0.8 },
    c2: { x: 0.18, y: 0.61 },
    end: { x: 0.13, y: 0.4 },
  },
  {
    c1: { x: 0.09, y: 0.22 },
    c2: { x: 0.2, y: 0.11 },
    end: { x: 0.34, y: 0.12 },
  },
  {
    c1: { x: 0.42, y: 0.13 },
    c2: { x: 0.48, y: 0.18 },
    end: { x: 0.5, y: 0.27 },
  },
  {
    c1: { x: 0.52, y: 0.18 },
    c2: { x: 0.58, y: 0.13 },
    end: { x: 0.66, y: 0.12 },
  },
  {
    c1: { x: 0.8, y: 0.11 },
    c2: { x: 0.91, y: 0.22 },
    end: { x: 0.87, y: 0.4 },
  },
  {
    c1: { x: 0.82, y: 0.61 },
    c2: { x: 0.58, y: 0.8 },
    end: HEART_START,
  },
];

function scalePoint(point: Point, size: number): Point {
  return {
    x: point.x * size,
    y: point.y * size,
  };
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function cubicPoint(start: Point, curve: CubicCurve, progress: number): Point {
  const inverse = 1 - progress;
  const inverseSquared = inverse * inverse;
  const progressSquared = progress * progress;

  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * progress * curve.c1.x +
      3 * inverse * progressSquared * curve.c2.x +
      progressSquared * progress * curve.end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * progress * curve.c1.y +
      3 * inverse * progressSquared * curve.c2.y +
      progressSquared * progress * curve.end.y,
  };
}

function isPointInPolygon(pointX: number, pointY: number, polygon: Point[]): boolean {
  let inside = false;

  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > pointY !== previousPoint.y > pointY &&
      pointX <
        ((previousPoint.x - currentPoint.x) * (pointY - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }

  return inside;
}

export function getStickerFrameStarPath(size: number, outerRadius: number, innerRadius: number): string {
  const center = size / 2;
  const points: string[] = [];

  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    points.push(`${index === 0 ? 'M' : 'L'}${formatCoordinate(x)} ${formatCoordinate(y)}`);
  }

  return `${points.join(' ')} Z`;
}

export function getStickerFrameHeartPath(size: number): string {
  const start = scalePoint(HEART_START, size);
  const commands = [`M ${formatCoordinate(start.x)} ${formatCoordinate(start.y)}`];

  HEART_CURVES.forEach((curve) => {
    const c1 = scalePoint(curve.c1, size);
    const c2 = scalePoint(curve.c2, size);
    const end = scalePoint(curve.end, size);
    commands.push(
      `C ${formatCoordinate(c1.x)} ${formatCoordinate(c1.y)}, ${formatCoordinate(c2.x)} ${formatCoordinate(c2.y)}, ${formatCoordinate(end.x)} ${formatCoordinate(end.y)}`
    );
  });

  return `${commands.join(' ')} Z`;
}

export function createStickerFrameHeartPolygon(segmentsPerCurve = 16): Point[] {
  const points: Point[] = [HEART_START];
  let start = HEART_START;

  HEART_CURVES.forEach((curve) => {
    for (let segment = 1; segment <= segmentsPerCurve; segment += 1) {
      points.push(cubicPoint(start, curve, segment / segmentsPerCurve));
    }
    start = curve.end;
  });

  return points;
}

const DEFAULT_HEART_POLYGON = createStickerFrameHeartPolygon();

export function isPointInsideStickerFrameHeart(normalizedX: number, normalizedY: number): boolean {
  return isPointInPolygon(normalizedX, normalizedY, DEFAULT_HEART_POLYGON);
}
