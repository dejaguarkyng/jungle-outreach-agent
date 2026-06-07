"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ExternalLink, Search } from "lucide-react";
import type { Prospect } from "@/src/domain/schemas";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/src/lib/utils";

const column = createColumnHelper<Prospect>();

export function ProspectsTable({ prospects }: { prospects: Prospect[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");

  const filtered = useMemo(
    () =>
      prospects.filter((prospect) => {
        const haystack = [
          prospect.name,
          prospect.email,
          prospect.domain,
          prospect.company,
          prospect.project,
          prospect.githubUsername,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          haystack.includes(search.toLowerCase()) &&
          (!category || prospect.category === category) &&
          (!status || prospect.status === status) &&
          (!source || prospect.emailSourceType === source)
        );
      }),
    [prospects, search, category, status, source],
  );

  const columns = useMemo(
    () => [
      column.accessor("name", {
        header: "Prospect",
        cell: ({ row }) => (
          <div>
            <Link href={`/prospects/${row.original.id}`} className="font-medium hover:text-green-300">
              {row.original.name}
            </Link>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      }),
      column.accessor("project", {
        header: "Project",
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      column.accessor("category", {
        header: "Category",
        cell: (info) => <Badge>{info.getValue().replaceAll("_", " ")}</Badge>,
      }),
      column.accessor("fitScore", {
        header: "Fit",
        cell: (info) => (
          <span className="font-mono text-sm">{info.getValue() === null ? "—" : info.getValue()}</span>
        ),
      }),
      column.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge tone={["blocked", "bounced", "rejected"].includes(info.getValue()) ? "red" : "green"}>
            {info.getValue().replaceAll("_", " ")}
          </Badge>
        ),
      }),
      column.accessor("emailSourceType", {
        header: "Source",
        cell: ({ row }) => (
          <a
            href={row.original.emailSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {row.original.emailSourceType.replaceAll("_", " ")}
            <ExternalLink className="h-3 w-3" />
          </a>
        ),
      }),
      column.accessor("createdAt", {
        header: "Created",
        cell: (info) => <span className="text-xs text-muted-foreground">{formatDate(info.getValue())}</span>,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_160px_180px]">
        <label className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search prospects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, domain, company, repo..."
            className="pl-9"
          />
        </label>
        <Filter value={category} onChange={setCategory} label="All categories" options={[...new Set(prospects.map((p) => p.category))]} />
        <Filter value={status} onChange={setStatus} label="All statuses" options={[...new Set(prospects.map((p) => p.status))]} />
        <Filter value={source} onChange={setSource} label="All sources" options={[...new Set(prospects.map((p) => p.emailSourceType))]} />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b bg-white/[0.025] text-xs uppercase text-muted-foreground">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="bg-card hover:bg-white/[0.025]">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No prospects match the current filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Filter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border bg-card px-3 text-sm outline-none focus:border-primary"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
