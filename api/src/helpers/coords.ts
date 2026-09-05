export function parseLatLng(value: string | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const lat = Number.parseFloat(parts[0]!.trim());
  const lng = Number.parseFloat(parts[1]!.trim());
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}
