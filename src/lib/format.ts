const KM = 1000;

// 12400 -> "12.4 km"
export const km = (metres: number) =>
  `${(metres / KM).toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

// 1380.4 -> "1,380 m"
export const m = (metres: number) => `${Math.round(metres).toLocaleString('en')} m`;

// Joins defined parts: ["Alpine Climbing", undefined, "Yukon"] -> "Alpine Climbing · Yukon"
export const dot = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
