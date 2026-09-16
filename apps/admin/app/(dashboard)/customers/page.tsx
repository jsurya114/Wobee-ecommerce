"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Pagination } from "@/features/shell/components/Pagination";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { CustomerFilters } from "@/features/customers/components/CustomerFilters";
import { CustomersTable } from "@/features/customers/components/CustomersTable";
import { useAdminCustomers } from "@/features/customers/hooks/useAdminCustomers";

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { items, total, loading, error } = useAdminCustomers({
    search: debouncedSearch,
    isActive,
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, isActive]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl text-text-primary">Customers</h1>
        <p className="font-body text-sm text-text-secondary">View accounts and manage access.</p>
      </div>
      <CustomerFilters search={search} isActive={isActive} onSearchChange={setSearch} onActiveChange={setIsActive} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <>
          <CustomersTable items={items} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} itemCount={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
