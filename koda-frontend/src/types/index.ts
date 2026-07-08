export interface PaginatedResponse<T> {
  total_records: number;
  limit: number;
  offset: number;
  data: T[];
}
