import { useState, useCallback } from 'react';

export function usePagination(defaultLimit = 50) {
  const [limit, setLimit] = useState(defaultLimit);
  const [offset, setOffset] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);

  const nextPage = useCallback(() => {
    setOffset((prev) => prev + limit);
  }, [limit]);

  const prevPage = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - limit));
  }, [limit]);

  const goToPage = useCallback((page: number) => {
    const pageIndex = Math.max(1, page);
    setOffset((pageIndex - 1) * limit);
  }, [limit]);

  const hasNextPage = offset + limit < totalRecords;
  const hasPrevPage = offset > 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

  return {
    limit,
    offset,
    totalRecords,
    setLimit,
    setOffset,
    setTotalRecords,
    nextPage,
    prevPage,
    goToPage,
    hasNextPage,
    hasPrevPage,
    currentPage,
    totalPages,
  };
}
