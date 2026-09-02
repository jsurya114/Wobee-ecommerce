"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { useState } from "react";
import { CustomerFilters } from "@/features/customers/components/CustomerFilters";
import { CustomersTable } from "@/features/customers/components/CustomersTable";
import { useAdminCustomers } from "@/features/customers/hooks/useAdminCustomers";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const { items, loading, error } = useAdminCustomers({ search, isActive, page: 1, pageSize: 50 });

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
        <CustomersTable items={items} />
      )}
    </div>
  );
}
