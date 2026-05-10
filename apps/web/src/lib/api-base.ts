/** Browser-visible base URL for the FastAPI service (same host as the user’s browser). */
export function getPublicApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:8000"
  );
}
